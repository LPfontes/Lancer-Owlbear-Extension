import OBR from '@owlbear-rodeo/sdk'
import {
  changedTokenIds,
  collectBoundTokenIds,
  collectTokenPositions,
  removedTokenIds,
  euclideanDistance,
  type CanvasPoint,
} from '@/services/tokenMovementGesture'
import { COMPCON_METADATA_KEY } from '@/types/compcon-obr'
import { classifyMovementKind, decideMovement, normalizeSpaces } from '@/services/tokenMovement'
import { toTrackerInt } from '@/services/tokenTrackerModel'
import {
  tokenTrackerLog,
  tokenTrackerTrace,
  tokenTrackerWarn,
} from '@/services/tokenTrackerDebug'
import { tokenTrackerService, type MovementTarget } from '@/services/tokenTrackerService'
import { isSheetWindowContext } from '@/services/mainWindow'
import type {
  MovementDecision,
  MovementSpendReply,
  MovementSpendRequest,
} from '@/types/token-movement'

/**
 * Captura do arrasto do token e gasto de movimento (plano §13.3/§13.4).
 *
 * O SDK não tem gancho de "antes/depois do movimento": o único sinal é
 * `items.onChange`, que entrega a lista inteira sem diff. Aqui o diff é feito pelo
 * módulo puro `tokenMovementGesture.ts`, e o gesto só é liquidado depois de
 * `SETTLE_MS` sem mexer — é assim que um arrasto contínuo vira **um** gasto.
 *
 * A decisão de gasto é pura (`tokenMovement.decideMovement`). Esta camada só lê a
 * cena, chama o motor e guarda o que o cartão da M2 vai precisar (§13.5/§13.6).
 *
 * **Ordem obrigatória: decidir antes de gastar.** `SpendMovement` clampa em zero e
 * joga o excedente fora; gastar 9 com 5 restantes perderia os 4 sem oferecer Boost.
 *
 * **Quem debita é a janela da FICHA, não a que arrastou.** O app roda em iframes
 * separados: o `StatController` vivo só existe na janela persistente da ficha
 * (`windowType=floating`). Quando o arrasto acontece noutro iframe, ele manda o
 * GESTO por broadcast e o dono decide com os números frescos — quem decide precisa
 * do `remaining`/`BoostBonus` de verdade, e uma cópia deserializada mentiria.
 */

/** Tempo parado que fecha o gesto (plano §13.3). */
export const MOVEMENT_SETTLE_MS = 250

/** Envio/ack do relay. Registrados pelo bridge (evita import circular). */
type RelaySend = (payload: Record<string, unknown>) => void | Promise<void>

/** Id curto e único o bastante para casar pedido e resposta entre iframes. */
function newRequestId(): string {
  return `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface Gesture {
  tokenId: string
  /** Canto (`position` cru) no início do gesto — é para cá que o Desfazer volta. */
  startCorner: CanvasPoint
  /**
   * Centro no início do gesto, buscado **uma vez** por gesto (`getItemBounds`).
   *
   * Guardado como promessa para não correr com o settle: o `getDistance` mede centro
   * a centro, e misturar canto com centro mediria o deslocamento **mais meio token**.
   */
  startCenterPromise: Promise<CanvasPoint>
  /** Quem mexeu no token por último (a comparação do §13.3). */
  movedBy: unknown
}

/** Estouro de cap aguardando a escolha do jogador (o cartão da M2 lê isto). */
export interface PendingOverflow {
  tokenId: string
  spaces: number
  overBy: number
  remaining: number
  canBoost: boolean
  target: MovementTarget
  /** Para onde voltar se o jogador desistir. */
  startCorner: CanvasPoint
}

/** Último gesto DEBITADO, para o "Desfazer" do §13.6. */
export interface SpentGesture {
  tokenId: string
  spent: number
  mode: 'move' | 'boost'
  /** Movimento restante ANTES do débito (o Desfazer devolve exatamente isto). */
  previousRemaining: number
  startCorner: CanvasPoint
  /** `StatController` do dono, para devolver o movimento. */
  statController: any
}

class TokenMovementCaptureService {
  private started = false
  private unsubscribe: (() => void) | null = null

  /** Última posição vista de cada token (canto). */
  private lastSeen = new Map<string, CanvasPoint>()
  private gestures = new Map<string, Gesture>()
  private settleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * "O próximo movimento é livre" (§13.7).
   *
   * O Owlbear não tem listener global de teclado — `onKeyDown` só existe dentro de um
   * `ToolMode` ativo (§13.10). Então o v1 usa estado armado, não tecla segurada.
   * Consome no primeiro gesto que assentar.
   */
  private freeArmed = new Set<string>()

  private overflows = new Map<string, PendingOverflow>()
  private lastSpentG = new Map<string, SpentGesture>()
  private relaySend: RelaySend | null = null
  /** Pedidos enviados a outro iframe, esperando a resposta do dono da ficha. */
  private relayPending = new Map<string, { tokenId: string; spaces: number; sentAt: number }>()

  /**
   * Liga o envio por broadcast. O bridge registra isto no boot (a captura não importa
   * o bridge para não criar ciclo: o bridge já importa a captura).
   */
  public setRelaySend(send: RelaySend | null): void {
    this.relaySend = send
  }

  public start(): void {
    if (this.started) return
    this.started = true
    this.unsubscribe = OBR.scene.items.onChange(items => {
      void this.onItems(items)
    })
    tokenTrackerLog('movimento', 'captura de arrasto ligada (settle de 250 ms)')
  }

  public stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    for (const timer of this.settleTimers.values()) clearTimeout(timer)
    this.settleTimers.clear()
    this.gestures.clear()
    this.lastSeen.clear()
    this.freeArmed.clear()
    this.overflows.clear()
    this.lastSpentG.clear()
    this.started = false
  }

  /////////////////////////////////////////////////////////////////////
  // Estado consultado pela UI (M2)
  /////////////////////////////////////////////////////////////////////

  /** Arma "este movimento é livre" para um token (some depois do primeiro gesto). */
  public armFreeMovement(tokenId: string): void {
    this.freeArmed.add(tokenId)
  }

  public disarmFreeMovement(tokenId: string): void {
    this.freeArmed.delete(tokenId)
  }

  public isFreeMovementArmed(tokenId: string): boolean {
    return this.freeArmed.has(tokenId)
  }

  public getPendingOverflow(tokenId: string): PendingOverflow | null {
    return this.overflows.get(tokenId) ?? null
  }

  public getLastSpent(tokenId: string): SpentGesture | null {
    return this.lastSpentG.get(tokenId) ?? null
  }

  public clearPendingOverflow(tokenId: string): void {
    this.overflows.delete(tokenId)
  }

  /////////////////////////////////////////////////////////////////////
  // Captura
  /////////////////////////////////////////////////////////////////////

  private async onItems(items: unknown[]): Promise<void> {
    if (!this.started) return

    const next = collectTokenPositions(items)
    for (const id of removedTokenIds(this.lastSeen, next)) {
      this.lastSeen.delete(id)
      this.forgetGesture(id)
    }

    const changed = changedTokenIds(this.lastSeen, next)
    if (changed.length) {
      // Só token com vínculo de ficha pode gastar movimento: arrastar cenário não
      // deve nem chegar a consultar o motor.
      const bound = collectBoundTokenIds(items, COMPCON_METADATA_KEY)
      const movedBy = this.movedByFromItems(items, changed)
      for (const tokenId of changed) {
        if (!bound.has(tokenId)) {
          tokenTrackerTrace(
            'movimento',
            `token ${tokenId}: arrastado, mas não tem vínculo de ficha (metadata["${COMPCON_METADATA_KEY}"]) — ignorado`
          )
          continue
        }
        const start = this.lastSeen.get(tokenId)
        const end = next.get(tokenId)
        if (!start || !end) continue

        const gesture = this.gestures.get(tokenId)
        if (gesture) {
          // Já está em gesto: só reinicia o settle (o início não se move).
          gesture.movedBy = movedBy.get(tokenId) ?? gesture.movedBy
        } else {
          const startCorner = { ...start }
          this.gestures.set(tokenId, {
            tokenId,
            startCorner,
            // Uma ida ao SDK por gesto (não por divergência): o diff de posição entre
            // `onChange`s continua barato.
            startCenterPromise: OBR.scene.items
              .getItemBounds([tokenId])
              .then(bounds => bounds?.center ?? startCorner)
              .catch(() => startCorner),
            movedBy: movedBy.get(tokenId),
          })
        }
        this.restartSettle(tokenId)
      }
    }

    // O retrato é atualizado DEPOIS: o diff acima é contra o estado anterior.
    this.lastSeen = next
  }

  private movedByFromItems(items: unknown[], ids: string[]): Map<string, unknown> {
    const map = new Map<string, unknown>()
    for (const raw of items) {
      const item = raw as { id?: unknown; lastModifiedUserId?: unknown }
      if (typeof item?.id !== 'string' || !ids.includes(item.id)) continue
      map.set(item.id, item.lastModifiedUserId)
    }
    return map
  }

  private restartSettle(tokenId: string): void {
    const existing = this.settleTimers.get(tokenId)
    if (existing) clearTimeout(existing)
    this.settleTimers.set(
      tokenId,
      setTimeout(() => {
        this.settleTimers.delete(tokenId)
        void this.settle(tokenId)
      }, MOVEMENT_SETTLE_MS)
    )
  }

  private forgetGesture(tokenId: string): void {
    const timer = this.settleTimers.get(tokenId)
    if (timer) clearTimeout(timer)
    this.settleTimers.delete(tokenId)
    this.gestures.delete(tokenId)
  }

  /** O gesto assentou: fecha o movimento e decide o gasto (§13.4). */
  private async settle(tokenId: string): Promise<void> {
    const gesture = this.gestures.get(tokenId)
    if (!gesture) return
    this.gestures.delete(tokenId)

    try {
      await this.settleGesture(gesture)
    } catch (err) {
      console.warn('[TokenTracker] Falha ao liquidar o gesto de movimento:', err)
    }
  }

  private async settleGesture(gesture: Gesture): Promise<void> {
    const target = await tokenTrackerService.getMovementTarget(gesture.tokenId)
    if (!target) {
      // O serviço já explicou o motivo (vínculo ausente, ficha não resolvida nesta
      // janela, ou dono sem `CombatController`) numa linha própria — aqui fica só o
      // fato consumado.
      tokenTrackerWarn('movimento', `token ${gesture.tokenId}: gesto sem alvo — nada debitado`)
      return
    }

    const spaces = await this.spacesOf(gesture)
    // Arrastar e voltar ao mesmo lugar não gasta nada (e o critério da M1 depende
    // disso: "arrastar de volta devolve o número").
    if (spaces <= 0) {
      tokenTrackerTrace(
        'movimento',
        `token ${gesture.tokenId}: gesto de 0 espaços (arrastou e voltou) — nada debitado`
      )
      return
    }

    const sameWindow = this.isSameWindow(gesture)
    const kind = classifyMovementKind({
      sameWindow,
      freeArmed: this.freeArmed.has(gesture.tokenId),
    })
    // "Livre" é um tiro só: consumido aqui, valha o desfecho.
    const wasFree = this.freeArmed.delete(gesture.tokenId)

    const decision = decideMovement({
      spaces,
      remaining: target.remaining,
      boostBonus: target.boostBonus,
      maxSpeed: target.maxSpeed,
      canBoost: target.canBoost,
      kind,
      immobilized: target.immobilized,
    })

    tokenTrackerLog('movimento', `token ${gesture.tokenId}: gesto de ${spaces} espaço(s)`, {
      classificacao: kind,
      atribuicao: sameWindow
        ? 'esta janela mexeu no token'
        : `outra janela mexeu (lastModifiedUserId=${String(gesture.movedBy)} ≠ ${this.playerId() || '?'})`,
      livreArmadoConsumido: wasFree,
      restante: target.remaining,
      capDoTurno: target.maxSpeed + target.boostBonus,
      boostBonus: target.boostBonus,
      podeDarBoost: target.canBoost,
      imobilizado: target.immobilized,
      decisao: decision.action,
      janelaDaFicha: isSheetWindowContext(),
      ...(decision.action === 'spend'
        ? { gasto: decision.spend, leg: decision.mode }
        : decision.action === 'offer-boost'
          ? { passouDoCapEm: decision.overBy, nota: 'aguardando Boost/Desfazer (nada debitado)' }
          : { motivo: decision.reason }),
    })

    // O débito tem de cair no controlador VIVO. Se esta janela não é a da ficha, o
    // que ela resolveu é uma cópia deserializada: debitar aqui seria perdido (a ficha
    // viva sobrescreve ao salvar) ou cobrado em dobro. Então o GESTO vai por
    // broadcast e o dono decide com os números dele.
    if (!isSheetWindowContext() && this.canRelay()) {
      await this.relayGesture(gesture, target, spaces, kind)
      return
    }

    await this.applyDecision(gesture, target, decision)
  }

  /**
   * Manda o gesto para a janela que tem a ficha viva.
   *
   * Vai o gesto (espaços + classificação), **não** a decisão: quem tem os números
   * frescos é o dono do controlador.
   */
  private async relayGesture(
    gesture: Gesture,
    target: MovementTarget,
    spaces: number,
    kind: MovementSpendRequest['kind']
  ): Promise<void> {
    const request: MovementSpendRequest = {
      requestId: newRequestId(),
      tokenId: gesture.tokenId,
      sheetId: target.binding.sheetId,
      mechId: target.binding.mechId,
      spaces,
      kind,
    }

    this.relayPending.set(request.requestId, {
      tokenId: gesture.tokenId,
      spaces,
      sentAt: Date.now(),
    })
    // Guarda o gesto para o caso de o dono recusar por estouro (o cartão da M2
    // precisa de saber para onde voltar).
    this.overflows.set(gesture.tokenId, {
      tokenId: gesture.tokenId,
      spaces,
      overBy: 0,
      remaining: target.remaining,
      canBoost: target.canBoost,
      target,
      startCorner: { ...gesture.startCorner },
    })

    tokenTrackerLog(
      'movimento',
      `token ${gesture.tokenId}: ${spaces} espaço(s) enviados para a janela da ficha (esta janela não tem o controlador vivo)`,
      { vinculo: `${target.binding.sheetId}${target.binding.mechId ? ` / ${target.binding.mechId}` : ''}`, requestId: request.requestId }
    )

    try {
      await this.relaySend?.({ type: 'MOVEMENT_SPEND', ...request })
    } catch (err) {
      tokenTrackerWarn('movimento', 'falha ao enviar o gesto para a janela da ficha', err)
    }
  }

  /**
   * Resposta do dono da ficha: o débito (ou a recusa) aconteceu **lá**.
   *
   * Aqui só se registra o resultado e se redesenha — o número exibido passa a vir do
   * resumo gravado no token, que o dono atualiza.
   */
  public async onSpendReply(reply: MovementSpendReply): Promise<void> {
    const pending = this.relayPending.get(reply.requestId)
    if (!pending) return
    this.relayPending.delete(reply.requestId)

    tokenTrackerLog('movimento', `token ${reply.tokenId}: resposta da janela da ficha`, {
      debitado: reply.applied ? reply.spent : 0,
      acao: reply.action,
      motivo: reply.reason ?? '(nenhum)',
      restanteDepois: reply.remainingAfter,
      espacosDoGesto: pending.spaces,
    })

    if (!reply.applied) {
      tokenTrackerWarn(
        'movimento',
        `token ${reply.tokenId}: a janela da ficha NÃO debitou (${reply.action}${reply.reason ? `: ${reply.reason}` : ''}) — o cartão da M2 é quem resolve isso`,
        { restanteNaFicha: reply.remainingAfter }
      )
    }
    await tokenTrackerService.refreshToken(reply.tokenId)
  }

  /**
   * Aplica um gesto recebido de OUTRO iframe. Só a janela da ficha executa, e só se o
   * vínculo for de uma ficha DESTA janela.
   */
  public async applyRemoteSpend(request: MovementSpendRequest): Promise<MovementSpendReply | null> {
    if (!isSheetWindowContext()) return null

    const own = tokenTrackerService.getOwnSheetIds()
    const isMine = own.includes(request.sheetId) || (!!request.mechId && own.includes(request.mechId))
    if (!isMine) {
      tokenTrackerTrace('movimento', `pedido de ${request.tokenId} não é desta janela`, {
        pedido: `${request.sheetId}${request.mechId ? ` / ${request.mechId}` : ''}`,
        fichasDestaJanela: own,
      })
      return null
    }

    // Resolve AQUI: o controlador desta janela é o vivo, então a decisão usa os
    // números frescos (restante, BoostBonus, imobilizado, legalidade do Boost).
    const target = await tokenTrackerService.getMovementTarget(request.tokenId)
    if (!target) {
      tokenTrackerWarn(
        'movimento',
        `pedido de ${request.tokenId} chegou à janela da ficha, mas o alvo não resolveu aqui`
      )
      return {
        requestId: request.requestId,
        tokenId: request.tokenId,
        applied: false,
        spent: 0,
        action: 'reject',
        reason: 'over-cap-no-boost',
        remainingAfter: 0,
      }
    }

    const decision = decideMovement({
      spaces: request.spaces,
      remaining: target.remaining,
      boostBonus: target.boostBonus,
      maxSpeed: target.maxSpeed,
      canBoost: target.canBoost,
      kind: request.kind,
      immobilized: target.immobilized,
    })

    const reply: MovementSpendReply = {
      requestId: request.requestId,
      tokenId: request.tokenId,
      applied: false,
      spent: 0,
      action: decision.action,
      remainingAfter: target.remaining,
    }

    if (decision.action === 'spend') {
      target.combatController.SpendMovement(decision.spend, decision.mode)
      reply.applied = true
      reply.spent = decision.spend
      reply.remainingAfter = toTrackerInt(target.statController?.getCurrent?.('speed'))
      this.lastSpentG.set(request.tokenId, {
        tokenId: request.tokenId,
        spent: decision.spend,
        mode: decision.mode,
        previousRemaining: target.remaining,
        startCorner: await this.cornerOf(request.tokenId),
        statController: target.statController,
      })
    } else if (decision.action === 'reject') {
      reply.reason = decision.reason
    }

    tokenTrackerLog('movimento', `debitei um gesto vindo de outra janela (${request.tokenId})`, {
      espacos: request.spaces,
      leg: decision.action === 'spend' ? decision.mode : '(não debitado)',
      restanteAntes: target.remaining,
      restanteDepois: reply.remainingAfter,
      acao: decision.action,
    })

    await tokenTrackerService.refreshToken(request.tokenId)
    return reply
  }

  private async cornerOf(tokenId: string): Promise<CanvasPoint> {
    const bounds = await OBR.scene.items.getItemBounds([tokenId]).catch(() => null)
    const item = (
      await OBR.scene.items.getItems([tokenId]).catch(() => [] as { position?: CanvasPoint }[])
    )[0]
    if (item?.position) return { x: item.position.x, y: item.position.y }
    return bounds?.min ?? { x: 0, y: 0 }
  }

  private canRelay(): boolean {
    return typeof this.relaySend === 'function'
  }

  /**
   * Espaços andados neste gesto.
   *
   * `getDistance` devolve **células** pela métrica da cena (em LANCER, 1 célula = 1
   * espaço). Em `EUCLIDEAN` vem fracionário e `normalizeSpaces` arredonda para cima —
   * arredondar para baixo daria movimento de graça.
   *
   * Sem o centro do fim não há medição honesta: devolve 0 (não cobra). O princípio do
   * §13.3 é preferir sobrar movimento a cobrar errado.
   */
  private async spacesOf(gesture: Gesture): Promise<number> {
    const [startCenter, bounds] = await Promise.all([
      gesture.startCenterPromise,
      OBR.scene.items.getItemBounds([gesture.tokenId]).catch(() => null),
    ])
    const endCenter = bounds?.center
    if (!endCenter) {
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: sem bounds no fim do gesto — não dá para medir, nada debitado`
      )
      return 0
    }

    const cells = await OBR.scene.grid.getDistance(startCenter, endCenter).catch(() => null)
    if (typeof cells === 'number' && Number.isFinite(cells)) {
      const spaces = normalizeSpaces(cells)
      tokenTrackerTrace('movimento', `token ${gesture.tokenId}: getDistance devolveu ${cells}`, {
        espacos: spaces,
        de: startCenter,
        para: endCenter,
      })
      return spaces
    }

    // Métrica indisponível: cai na distância em unidades de cena dividida pelo dpi,
    // que é a célula por baixo.
    const dpi = await OBR.scene.grid.getDpi().catch(() => 150)
    const raw = euclideanDistance(startCenter, endCenter)
    const spaces = normalizeSpaces(dpi > 0 ? raw / dpi : 0)
    tokenTrackerWarn(
      'movimento',
      `token ${gesture.tokenId}: getDistance indisponível; usei dpi=${dpi} e distância crua ${raw.toFixed(1)}`,
      { espacos: spaces }
    )
    return spaces
  }

  /** Calcula o deslocamento do gesto (espaços). */
  private playerId(): string {
    try {
      return OBR.player.id ?? ''
    } catch {
      return ''
    }
  }

  private isSameWindow(gesture: Gesture): boolean {
    const playerId = this.playerId()
    // V0 confirmado: `lastModifiedUserId` e `OBR.player.id` são o mesmo espaço de
    // identificadores. Na dúvida (sem id), não debita.
    if (!playerId) return false
    return gesture.movedBy === playerId
  }

  private async applyDecision(
    gesture: Gesture,
    target: MovementTarget,
    decision: MovementDecision
  ): Promise<void> {
    if (decision.action === 'spend') {
      // O motor já registra `Record('move', …)` dentro de `SpendMovement` — não
      // registrar de novo.
      target.combatController.SpendMovement(decision.spend, decision.mode)
      // Lê de volta do MESMO objeto que foi debitado: é o que prova que o débito caiu
      // onde o painel desenha (e não numa das outras cópias do mecha).
      const after = {
        current: toTrackerInt(target.statController?.getCurrent?.('speed')),
        max: toTrackerInt(target.combatController?.BoostedSpeed),
      }
      tokenTrackerLog('movimento', `token ${gesture.tokenId}: debitados ${decision.spend}`, {
        leg: decision.mode,
        restanteAntes: target.remaining,
        restanteDepois: after.current,
        capDoTurnoAgora: after.max,
      })
      this.lastSpentG.set(gesture.tokenId, {
        tokenId: gesture.tokenId,
        spent: decision.spend,
        mode: decision.mode,
        previousRemaining: target.remaining,
        startCorner: { ...gesture.startCorner },
        statController: target.statController,
      })
      await tokenTrackerService.refreshToken(gesture.tokenId)
      return
    }

    if (decision.action === 'offer-boost') {
      // Nada é debitado enquanto o jogador não escolher: é o que preserva a
      // possibilidade do Boost (§13.5). O cartão é a M2.
      this.overflows.set(gesture.tokenId, {
        tokenId: gesture.tokenId,
        spaces: decision.spend,
        overBy: decision.overBy,
        remaining: target.remaining,
        canBoost: target.canBoost,
        target,
        startCorner: { ...gesture.startCorner },
      })
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: movimento ACIMA do cap (${decision.spend} > ${target.remaining}) e nada foi debitado — falta o cartão de Boost/Desfazer (M2)`,
        { passouDoCapEm: decision.overBy, podeDarBoost: target.canBoost }
      )
      return
    }

    // Rejeições: `free` é o combinado (não debita), `involuntary` é empurrão do GM,
    // `immobilized` e `over-cap-no-boost` ficam sem débito. Nesses dois últimos o
    // token já andou; o cartão da M2 oferece Desfazer (§13.5/§13.6).
    if (decision.reason === 'immobilized' || decision.reason === 'over-cap-no-boost') {
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: gesto recusado (${decision.reason}) e o token JÁ andou — o Desfazer é a M2`,
        { restante: target.remaining }
      )
    }
    this.overflows.set(gesture.tokenId, {
      tokenId: gesture.tokenId,
      spaces: 0,
      overBy: 0,
      remaining: target.remaining,
      canBoost: false,
      target,
      startCorner: { ...gesture.startCorner },
    })
  }

  /**
   * Volta o token para onde o gesto começou (§13.6).
   *
   * Devolve em **linha reta**, não pelo caminho andado — o Owlbear não expõe o
   * traçado (§13.9). Quem chama decide se devolve o movimento também (`restore`).
   */
  public async undo(tokenId: string, restore = true): Promise<boolean> {
    const spent = this.lastSpentG.get(tokenId)
    const overflow = this.overflows.get(tokenId)
    const startCorner = spent?.startCorner ?? overflow?.startCorner
    if (!startCorner) {
      tokenTrackerWarn('movimento', `token ${tokenId}: nada para desfazer (nenhum gesto registrado)`)
      return false
    }

    // Atualiza o retrato ANTES de mover: senão o nosso próprio `updateItems` entraria
    // no diff como um gesto novo (e seria debitado de novo).
    this.lastSeen.set(tokenId, { ...startCorner })
    await OBR.scene.items
      .updateItems([tokenId], items => {
        for (const item of items) item.position = { ...startCorner }
      })
      .catch(err => {
        console.warn('[TokenTracker] Falha ao desfazer o movimento:', err)
      })

    if (restore && spent) {
      try {
        // `silent: true` de propósito: devolver movimento não é uma ação de combate,
        // não deve virar linha no log (§13.6).
        spent.statController?.setCurrentStat?.('speed', spent.previousRemaining, { silent: true })
      } catch (err) {
        console.warn('[TokenTracker] Falha ao devolver o movimento:', err)
      }
    }

    tokenTrackerLog('movimento', `token ${tokenId}: desfeito`, {
      voltouPara: startCorner,
      movimentoDevolvido: restore && spent ? `${spent.spent} (restante de volta a ${spent.previousRemaining})` : 'não',
    })

    this.lastSpentG.delete(tokenId)
    this.overflows.delete(tokenId)
    await tokenTrackerService.refreshToken(tokenId)
    return true
  }
}

export const tokenMovementCapture = new TokenMovementCaptureService()

// O serviço do painel precisa saber se há estouro pendente para pintar o badge de
// erro (§6.1). Registrado aqui (e não importado lá) para não criar ciclo de imports.
tokenTrackerService.setMovementOverflowResolver(tokenId =>
  tokenMovementCapture.getPendingOverflow(tokenId) !== null
)
