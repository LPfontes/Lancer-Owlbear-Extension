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
import {
  collectMovementRecords,
  fullMovementRecord,
  movementRecordChanged,
  movementRecordFromStats,
  sanitizeMovementRecord,
  spendFromMovementRecord,
} from '@/services/tokenMovementRecord'
import { TOKEN_TRACKER_MOVEMENT_KEY } from '@/types/token-tracker'
import type { TokenTrackerMovementRecord } from '@/types/token-tracker'
import type { MovementDecision } from '@/types/token-movement'

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

/**
 * Teto de duração de um gesto.
 *
 * O settle é adiado a cada mudança real de posição. Num arrasto contínuo o SDK pode
 * emitir eventos com intervalo MAIOR que o settle (aí cada passo vira um gesto — o
 * total continua certo, mas o log vira uma parede) ou MENOR (aí o settle nunca
 * chega e nada é debitado até o arrasto parar, ou nunca). Este teto garante que um
 * gesto sempre liquide, mesmo em arrasto longo.
 */
export const MOVEMENT_MAX_GESTURE_MS = 2000

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
  /** Quando este gesto abriu (para o teto de duração). */
  startedAt: number
}

/** Estouro de cap aguardando a escolha do jogador (o cartão da M2 lê isto). */
export interface PendingOverflow {
  tokenId: string
  spaces: number
  overBy: number
  remaining: number
  canBoost: boolean
  /** Ausente quando esta janela não resolve a ficha (só o registro do token). */
  target?: MovementTarget
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
  /** Último registro de movimento visto por token (para reconciliar só o que mudou). */
  private lastRecords = new Map<string, TokenTrackerMovementRecord>()
  /** Tokens já avisados por não terem vínculo (avisa uma vez, não a cada arrasto). */
  private warnedUnbound = new Set<string>()
  /** Tokens já avisados por mudarem sem retrato anterior (uma vez cada). */
  private warnedNoSnapshot = new Set<string>()

  /**
   * Liga o envio por broadcast. O bridge registra isto no boot (a captura não importa
   * o bridge para não criar ciclo: o bridge já importa a captura).
   */
  public setRelaySend(send: RelaySend | null): void {
    this.relaySend = send
  }

  public start(): void {
    if (this.started) return
    // A captura roda SÓ na janela da ficha (`windowType=floating`).
    //
    // As outras janelas veem o mesmo `items.onChange`, então manter a captura nelas
    // significava: o mesmo arrasto aberto em dois lugares, duas idas ao SDK por gesto,
    // duas linhas de log por passo e uma eleição de escritor para desempatar. Com a
    // captura só aqui, o escritor é único por construção — e é esta janela que tem o
    // controlador vivo, o único lugar onde o débito chega ao motor de regras.
    if (!isSheetWindowContext()) {
      tokenTrackerTrace(
        'movimento',
        'captura de movimento não roda aqui: só na janela da ficha (windowType=floating)'
      )
      return
    }

    this.started = true
    this.unsubscribe = OBR.scene.items.onChange(items => {
      void this.onItems(items)
    })
    tokenTrackerLog('movimento', 'captura de arrasto ligada (settle de 250 ms)')
    // Semeia o retrato JÁ: sem isto o primeiro arrasto era engolido. O diff só conta
    // token que tem posição anterior, e a anterior só nascia de um `onChange` — se o
    // SDK entrega um único evento por arrasto (no soltar), o primeiro arrasto de cada
    // sessão não tinha com o que comparar e nada acontecia.
    void this.seedSnapshot()
  }

  /** Fotografa a posição atual de todos os tokens (uma vez, no start). */
  private async seedSnapshot(): Promise<void> {
    try {
      const items = await OBR.scene.items.getItems()
      this.lastSeen = collectTokenPositions(items)
      tokenTrackerLog('movimento', `retrato inicial: ${this.lastSeen.size} token(s)`, {
        comVinculo: collectBoundTokenIds(items, COMPCON_METADATA_KEY).size,
      })
    } catch (err) {
      tokenTrackerWarn('movimento', 'falha ao tirar o retrato inicial dos tokens', err)
    }
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
    this.warnedUnbound.clear()
    this.warnedNoSnapshot.clear()
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

  /**
   * Alinha o `SPEED` desta janela ao movimento GRAVADO no token.
   *
   * Só a janela da ficha tem o controlador vivo; nas outras o `SPEED` é cópia
   * deserializada e escrever nela não chega a lugar nenhum. Aqui rodamos a cada
   * mudança de metadata (o `items` do `onChange` já traz o registro), então o custo é
   * uma comparação por token — nenhuma ida extra ao SDK.
   */
  private reconcileRecords(
    records: Map<string, TokenTrackerMovementRecord>,
    next: Map<string, CanvasPoint>
  ): void {
    if (!isSheetWindowContext()) return

    for (const [tokenId, record] of records) {
      const previous = this.lastRecords.get(tokenId)
      this.lastRecords.set(tokenId, record)
      if (!movementRecordChanged(previous, record)) continue
      if (!next.has(tokenId)) continue
      void this.alignSpeedWithRecord(tokenId, record)
    }
  }

  private async alignSpeedWithRecord(
    tokenId: string,
    record: TokenTrackerMovementRecord
  ): Promise<void> {
    const target = await tokenTrackerService.getMovementTarget(tokenId)
    if (!target) return

    const atual = toTrackerInt(target.statController?.getCurrent?.('speed'))
    if (atual === record.current) return

    try {
      // `silent: true`: alinhar não é uma ação de combate, não vira linha no log.
      target.statController?.setCurrentStat?.('speed', record.current, { silent: true })
      tokenTrackerLog(
        'movimento',
        `token ${tokenId}: alinhei o SPEED da ficha ao movimento do token`,
        { antes: atual, agora: record.current, registroDe: record.w ?? '(sem autor)' }
      )
      await tokenTrackerService.refreshToken(tokenId)
    } catch (err) {
      tokenTrackerWarn('movimento', `falha ao alinhar o SPEED de ${tokenId} ao token`, err)
    }
  }

  private async onItems(items: unknown[]): Promise<void> {
    if (!this.started) return

    const next = collectTokenPositions(items)
    // Os registros de movimento de todos os tokens vêm no MESMO `items` do onChange —
    // então tanto a reconciliação quanto o log de posição saem de graça.
    const records = collectMovementRecords(items, TOKEN_TRACKER_MOVEMENT_KEY)

    // Reconciliação do motor com o registro do token: quem tem o controlador vivo é a
    // janela da ficha, e o registro é a fonte do número. Sem isto, o arrasto feito
    // noutra janela deixaria o HUD da ficha mostrando o movimento antigo.
    this.reconcileRecords(records, next)

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
        // LOG DE POSIÇÃO: o sinal cru de que o token se mexeu, com tudo que decide o
        // que acontece depois. É a linha que responde "eu movi e não registrou" —
        // basta ver qual campo está faltando (vínculo, movimento ativado, retrato).
        //
        // Só a janela ESCRITORA fala no nível padrão: as duas veem o mesmo arrasto, e
        // o console do Chrome agrega os iframes — sem isto, cada passo saía duas vezes.
        const de = this.lastSeen.get(tokenId)
        const para = next.get(tokenId)
        const escreveAqui = this.writerHint()
        ;(escreveAqui ? tokenTrackerLog : tokenTrackerTrace)(
          'posicao',
          `"${this.nameOf(items, tokenId)}" mudou de lugar`,
          {
            tokenId,
            de,
            para,
            distânciaEmUnidades:
              de && para ? Number(euclideanDistance(de, para).toFixed(1)) : undefined,
            temVinculo: bound.has(tokenId),
            movimentoAtivado: records.has(tokenId),
            quemMexeu: String(movedBy.get(tokenId)),
            estaJanela: this.playerId(),
            gesto: this.gestures.has(tokenId) ? 'continuando' : 'novo',
            janelaDaFicha: isSheetWindowContext(),
            escritor: escreveAqui ? 'esta janela' : 'a janela da ficha',
          }
        )

        if (!bound.has(tokenId)) {
          // Uma vez por token (e no nível padrão): "movi o token e nada aconteceu" é
          // quase sempre isto, e o silêncio era o pior sintoma possível.
          if (!this.warnedUnbound.has(tokenId)) {
            this.warnedUnbound.add(tokenId)
            tokenTrackerWarn(
              'movimento',
              `token ${tokenId}: arrastado, mas NÃO tem vínculo de ficha em metadata["${COMPCON_METADATA_KEY}"] — nada a debitar. Vincule o token (menu de contexto → Vincular Ficha COMP/CON)`,
              { nome: this.nameOf(items, tokenId) }
            )
          }
          continue
        }
        // Sem posição anterior não há gesto: acontece com token criado no meio da
        // sessão (e antes era o caso do PRIMEIRO arrasto, que sumia em silêncio).
        const start = this.lastSeen.get(tokenId)
        const end = next.get(tokenId)
        if (!start || !end) {
          if (!this.warnedNoSnapshot.has(tokenId)) {
            this.warnedNoSnapshot.add(tokenId)
            tokenTrackerWarn(
              'movimento',
              `token ${tokenId}: mudou de posição mas não havia retrato anterior — este movimento NÃO foi medido`,
              { nome: this.nameOf(items, tokenId) }
            )
          }
          continue
        }

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
            startedAt: Date.now(),
          })
          // Um gesto pode abrir VÁRIAS vezes num arrasto lento (o SDK manda um evento
          // por passo e o settle fecha entre eles): isto é traço, não decisão. A linha
          // que importa é a do settle, que traz espaços e decisão.
          tokenTrackerTrace(
            'movimento',
            `gesto aberto em "${this.nameOf(items, tokenId)}" (${tokenId})`,
            {
              de: start,
              para: end,
              quemMexeu: String(movedBy.get(tokenId)),
              estaJanela: this.playerId(),
              temVinculo: true,
            }
          )
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

  private nameOf(items: unknown[], tokenId: string): string {
    for (const raw of items) {
      const item = raw as { id?: unknown; name?: unknown }
      if (item?.id === tokenId && typeof item.name === 'string') return item.name
    }
    return '(sem nome)'
  }

  private restartSettle(tokenId: string): void {
    const existing = this.settleTimers.get(tokenId)
    if (existing) clearTimeout(existing)

    // O settle normal, encurtado pelo que ainda cabe no teto do gesto — assim um
    // arrasto contínuo liquida em blocos de no máximo `MOVEMENT_MAX_GESTURE_MS`.
    const gesture = this.gestures.get(tokenId)
    const decorrido = gesture ? Date.now() - gesture.startedAt : 0
    const restante = Math.max(0, MOVEMENT_MAX_GESTURE_MS - decorrido)
    const delay = Math.min(MOVEMENT_SETTLE_MS, restante)

    this.settleTimers.set(
      tokenId,
      setTimeout(() => {
        this.settleTimers.delete(tokenId)
        void this.settle(tokenId)
      }, delay)
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
    // ELEIÇÃO PRIMEIRO. Esta é a única checagem que é barata (cache de 2 s) e é ela que
    // decide se o resto do trabalho acontece aqui: sem isto, a janela que só observa
    // pagava `getItemBounds` + `getItems` do registro antes de descobrir que não era
    // ela quem debita.
    //
    // Repare no que NÃO precisa de ficha: nem a eleição, nem os espaços, nem o registro
    // do token. A ficha entra só nas travas do motor e no `StatController`.
    if (!(await this.isMovementWriter())) {
      // `trace`: isto é o NORMAL quando a ficha está aberta (a janela do mapa só
      // observa). No nível padrão sairia uma linha por gesto sem nada de novo — o
      // campo `escritor` do log de posição já diz quem debita.
      tokenTrackerTrace(
        'movimento',
        `token ${gesture.tokenId}: gesto observado nesta janela, mas quem debita é a janela da ficha`
      )
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

    // O registro do token vem ANTES da ficha: os números do gasto vivem nele, e a
    // janela que arrasta pode não ter ficha nenhuma resolvida.
    const gravado = await this.readMovementRecord(gesture.tokenId)
    if (!gravado) {
      // Nível padrão: "movi e não registrou" quase sempre é isto depois da ativação
      // explícita — e uma linha por gesto não incomoda.
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: gesto de ${spaces} espaço(s) ignorado — o movimento NÃO está ativado neste token (menu de contexto → Ativar movimento)`
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

    // Um arrasto é visto por TODAS as janelas do cliente (o `onChange` dispara em
    // cada uma e `lastModifiedUserId` é do usuário, não da janela). Se todas
    // escrevessem o registro, o mesmo arrasto seria debitado duas vezes — daí o
    // escritor ser eleito: a janela da ficha quando ela existe, senão esta.
    if (!(await this.isMovementWriter())) {
      // `trace`: isto é o NORMAL quando a ficha está aberta (a janela do mapa só
      // observa). No nível padrão sairia uma linha por gesto sem nada de novo — o
      // campo `escritor` do log de posição já diz quem debita.
      tokenTrackerTrace(
        'movimento',
        `token ${gesture.tokenId}: gesto observado nesta janela, mas quem debita é a janela da ficha`
      )
      return
    }

    // A ficha entra só para as travas do MOTOR e para escrever no `StatController` —
    // os números do gasto já vieram do registro do token. Sem ficha resolvida nesta
    // janela o gesto AINDA é registrado (é o caso da janela do mapa sem a ficha).
    const target = await tokenTrackerService.getMovementTarget(gesture.tokenId)

    const base = gravado
    // Sem restante e sem máximo não há o que debitar nem o que desenhar.
    if (base.current <= 0 && base.max <= 0) {
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: movimento zerado (restante 0 e máximo 0) — o gesto NÃO é registrado. Confira a ficha (SPEED) ou reinicie o turno`,
        { fonte: 'registro do token', resteanteNaFicha: target?.remaining }
      )
      return
    }

    const decision = decideMovement({
      spaces,
      remaining: base.current,
      boostBonus: base.boost,
      maxSpeed: base.max,
      // Sem ficha nesta janela não dá para confirmar legalidade de Boost nem status:
      // assume o conservador (não oferece Boost) — o excedente fica pendente e o cartão
      // da M2 resolve com a ficha na mão.
      canBoost: target?.canBoost ?? false,
      kind,
      immobilized: target?.immobilized ?? false,
    })

    tokenTrackerLog('movimento', `token ${gesture.tokenId}: gesto de ${spaces} espaço(s)`, {
      classificacao: kind,
      atribuicao: sameWindow
        ? 'esta janela mexeu no token'
        : `outra janela mexeu (lastModifiedUserId=${String(gesture.movedBy)} ≠ ${this.playerId() || '?'})`,
      livreArmadoConsumido: wasFree,
      movimentoNoToken: `${base.current}/${base.max + base.boost}`,
      origemDoRegistro: 'registro do token',
      boostBonus: base.boost,
      temFichaNestaJanela: !!target,
      podeDarBoost: target?.canBoost ?? '(ficha não resolvida aqui)',
      imobilizado: target?.immobilized ?? '(ficha não resolvida aqui)',
      janelaDaFicha: isSheetWindowContext(),
      decisao: decision.action,
      ...(decision.action === 'spend'
        ? { gasto: decision.spend, leg: decision.mode }
        : decision.action === 'offer-boost'
          ? { passouDoCapEm: decision.overBy, nota: 'aguardando Boost/Desfazer (nada debitado)' }
          : { motivo: decision.reason }),
    })

    if (decision.action === 'spend') {
      await this.commitSpend(gesture, target, base, decision)
      return
    }

    if (decision.action === 'offer-boost') {
      // Nada é debitado enquanto o jogador não escolher: é o que preserva a
      // possibilidade do Boost (§13.5). O cartão é a M2.
      this.overflows.set(gesture.tokenId, {
        tokenId: gesture.tokenId,
        spaces: decision.spend,
        overBy: decision.overBy,
        remaining: base.current,
        canBoost: target?.canBoost ?? false,
        target: target ?? undefined,
        startCorner: { ...gesture.startCorner },
      })
      tokenTrackerWarn(
        'movimento',
        `token ${gesture.tokenId}: movimento ACIMA do cap (${decision.spend} > ${base.current} no token) e nada foi debitado — falta o cartão de Boost/Desfazer (M2)`,
        { passouDoCapEm: decision.overBy, podeDarBoost: target?.canBoost ?? false }
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
        { restanteNoToken: base.current }
      )
    }
    this.overflows.set(gesture.tokenId, {
      tokenId: gesture.tokenId,
      spaces: 0,
      overBy: 0,
      remaining: base.current,
      canBoost: false,
      target: target ?? undefined,
      startCorner: { ...gesture.startCorner },
    })
  }

  /**
   * Debita de verdade: escreve o registro NO TOKEN e, quando esta janela tem o
   * controlador vivo (a da ficha), gasta também no motor para o HUD da ficha bater.
   *
   * A ordem importa: o token primeiro. Se o motor falhar depois, o número que a mesa
   * vê continua correto — e a janela da ficha reconcilia no próximo evento.
   */
  private async commitSpend(
    gesture: Gesture,
    target: MovementTarget | null,
    base: TokenTrackerMovementRecord,
    decision: Extract<MovementDecision, { action: 'spend' }>
  ): Promise<void> {
    const { record } = spendFromMovementRecord(base, decision.spend, this.writerId())

    try {
      await this.writeMovementRecord(gesture.tokenId, record)
    } catch (err) {
      tokenTrackerWarn('movimento', `falha ao gravar o movimento no token ${gesture.tokenId}`, err)
    }

    // Só a janela da ficha tem o controlador vivo; nas outras o `SPEED` é uma cópia
    // deserializada, e escrever nela não chega a lugar nenhum. Sem `target` não há
    // motor para tocar — o registro do token já é o que a mesa desenha.
    if (isSheetWindowContext() && target) {
      try {
        // `SpendMovement` também registra `Record('move', …)` no log de combate.
        target.combatController.SpendMovement(decision.spend, decision.mode)
      } catch (err) {
        tokenTrackerWarn('movimento', 'falha ao debitar no motor da ficha', err)
      }
    }

    this.lastSpentG.set(gesture.tokenId, {
      tokenId: gesture.tokenId,
      spent: decision.spend,
      mode: decision.mode,
      previousRemaining: base.current,
      startCorner: { ...gesture.startCorner },
      statController: target?.statController ?? null,
    })
    this.lastRecords.set(gesture.tokenId, record)

    tokenTrackerLog(
      'movimento',
      `token ${gesture.tokenId}: debitados ${decision.spend} (${record.current} restantes no token)`,
      { leg: decision.mode, como: isSheetWindowContext() ? 'token + motor' : 'só o token' }
    )

    await tokenTrackerService.refreshToken(gesture.tokenId)
  }

  /** Registro de movimento gravado neste token, se houver. */
  private async readMovementRecord(tokenId: string): Promise<TokenTrackerMovementRecord | null> {
    try {
      const item = (await OBR.scene.items.getItems([tokenId]))[0]
      return sanitizeMovementRecord(item?.metadata?.[TOKEN_TRACKER_MOVEMENT_KEY])
    } catch {
      return null
    }
  }

  /**
   * ATIVA o registro de movimento deste token (menu de contexto → ícone de play).
   *
   * A partir daqui os arrastos do token são medidos e debitados no próprio token. Antes
   * disso, arrastar não registra nada — é o que tira a ambiguidade de "às vezes não
   * registra": registrar passa a ser um estado explícito, com um dono claro (quem
   * ativou) e sem adivinhação.
   *
   * O registro nasce do estado vivo do motor (restante, padrão e Boost) e é ele que o
   * badge passa a desenhar.
   */
  public async armMovement(tokenId: string): Promise<boolean> {
    const target = await tokenTrackerService.getMovementTarget(tokenId)
    if (!target) {
      tokenTrackerWarn(
        'movimento',
        `não ativei o movimento do token ${tokenId}: sem vínculo de ficha resolvido nesta janela`
      )
      return false
    }

    const record = movementRecordFromStats(
      {
        remaining: target.remaining,
        maxSpeed: target.maxSpeed,
        boostBonus: target.boostBonus,
      },
      this.writerId()
    )

    if (record.current <= 0 && record.max <= 0) {
      tokenTrackerWarn(
        'movimento',
        `não ativei o movimento do token ${tokenId}: a ficha está com SPEED 0 (restante 0 e máximo 0)`,
        { vinculo: target.binding.sheetId }
      )
      return false
    }

    await this.writeMovementRecord(tokenId, record)
    this.lastRecords.set(tokenId, record)
    tokenTrackerLog(
      'movimento',
      `movimento ATIVADO no token ${tokenId}: ${record.current}/${record.max + record.boost}`,
      { vinculo: target.binding.sheetId, por: this.writerId() }
    )
    await tokenTrackerService.refreshToken(tokenId)
    return true
  }

  /** PARA o registro: apaga o registro do token (o badge volta a ler a ficha). */
  public async disarmMovement(tokenId: string): Promise<void> {
    try {
      await OBR.scene.items.updateItems([tokenId], items => {
        for (const item of items) delete item.metadata[TOKEN_TRACKER_MOVEMENT_KEY]
      })
    } catch (err) {
      tokenTrackerWarn('movimento', `falha ao parar o movimento do token ${tokenId}`, err)
    }
    this.lastRecords.delete(tokenId)
    this.overflows.delete(tokenId)
    this.lastSpentG.delete(tokenId)
    this.forgetGesture(tokenId)
    tokenTrackerLog('movimento', `movimento PARADO no token ${tokenId}`)
    await tokenTrackerService.refreshToken(tokenId)
  }

  /** O token está com o registro de movimento ativo? */
  public async isMovementArmed(tokenId: string): Promise<boolean> {
    return (await this.readMovementRecord(tokenId)) !== null
  }

  private async writeMovementRecord(
    tokenId: string,
    record: TokenTrackerMovementRecord
  ): Promise<void> {
    await OBR.scene.items
      .updateItems([tokenId], items => {
        for (const item of items) {
          item.metadata[TOKEN_TRACKER_MOVEMENT_KEY] = record as unknown as never
        }
      })
      .catch(err => {
        tokenTrackerWarn('movimento', `falha ao gravar o movimento no token ${tokenId}`, err)
      })
  }

  private writerId(): string {
    return `${isSheetWindowContext() ? 'ficha' : 'mapa'}:${(this.playerId() || 'local').slice(0, 8)}`
  }

  /**
   * Esta janela é quem grava o movimento?
   *
   * Só a janela da ficha captura (ver `start()`), então aqui a resposta é sempre sim
   * quando a captura está de pé — o método existe para deixar a intenção explícita no
   * fluxo do settle.
   */
  private async isMovementWriter(): Promise<boolean> {
    return isSheetWindowContext()
  }

  /** Dica síncrona para o log de posição: quem está falando é quem escreve. */
  private writerHint(): boolean {
    return isSheetWindowContext()
  }

  /**
   * Reinicia o movimento de TODOS os tokens vinculados da cena (§13.8) e avisa as
   * outras janelas.
   *
   * O motor **não** faz isso no fim da rodada: `EndRoundFlow` mexe em ativações, usos
   * e status, e quem devolve o movimento é `CombatController.Reset()`
   * (`ClearBoost()` + `SPEED = getMax(SPEED)`). Então o fim de rodada precisa pedir.
   *
   * Diferente do GASTO, aqui **cada janela reinicia a própria cópia** de propósito:
   * `SPEED = max` e `ClearBoost()` são idempotentes (não somam nada), então escrever
   * em todas as cópias deixa os badges coerentes em vez de divergentes.
   */
  public async resetRoundMovements(
    options: { broadcast?: boolean; filter?: { sheetId?: string; mechId?: string } } = {}
  ): Promise<void> {
    const broadcast = options.broadcast !== false
    // Nada de gesto sobrevive ao fim da rodada: um arrasto a meio caminho não pode
    // liquidar depois e debitar movimento já reiniciado.
    for (const timer of this.settleTimers.values()) clearTimeout(timer)
    this.settleTimers.clear()
    this.gestures.clear()
    this.overflows.clear()
    this.lastSpentG.clear()

    let tokenIds: string[] = []
    try {
      const items = await OBR.scene.items.getItems()
      tokenIds = [...collectBoundTokenIds(items, COMPCON_METADATA_KEY)]
    } catch (err) {
      tokenTrackerWarn('movimento', 'falha ao listar os tokens para reiniciar o movimento', err)
    }

    const filtro = options.filter
    let reiniciados = 0
    let semAlvo = 0
    let foraDoFiltro = 0
    for (const tokenId of tokenIds) {
      const target = await tokenTrackerService.getMovementTarget(tokenId)
      if (!target) {
        semAlvo += 1
        continue
      }
      // "Encerrar turno" no pilot-runner reinicia só a ficha DELE; a rodada do GM
      // reinicia todos.
      if (filtro) {
        const ids = [target.binding.sheetId, target.binding.mechId].filter(Boolean)
        const casa = [filtro.sheetId, filtro.mechId].filter(Boolean).some(id => ids.includes(id!))
        if (!casa) {
          foraDoFiltro += 1
          continue
        }
      }
      try {
        // Espelha o `Reset()` do motor para o movimento: larga o Boost e devolve o
        // movimento padrão do turno.
        target.combatController.ClearBoost?.()
        const max = toTrackerInt(target.combatController?.StatController?.getMax?.('speed'))
        target.statController?.setCurrentStat?.('speed', max, { silent: true })

        // E o TOKEN também: é ele que as outras janelas desenham, e é dele que a
        // janela da ficha vai reconciliar o `SPEED` quando abrir.
        const gravado = await this.readMovementRecord(tokenId)
        const cheio = fullMovementRecord(
          gravado ?? movementRecordFromStats({ remaining: max, maxSpeed: max, boostBonus: 0 }),
          this.writerId()
        )
        await OBR.scene.items.updateItems([tokenId], items => {
          for (const item of items) {
            item.metadata[TOKEN_TRACKER_MOVEMENT_KEY] = cheio as unknown as never
          }
        })
        this.lastRecords.set(tokenId, cheio)

        reiniciados += 1
        await tokenTrackerService.refreshToken(tokenId)
      } catch (err) {
        tokenTrackerWarn('movimento', `falha ao reiniciar o movimento de ${tokenId}`, err)
      }
    }

    tokenTrackerLog(
      'movimento',
      `movimento reiniciado em ${reiniciados} token(s)${filtro ? ' (só desta ficha)' : ' (rodada)'}`,
      { tokensNaCena: tokenIds.length, semAlvo, foraDoFiltro, aviseiAsOutrasJanelas: broadcast }
    )

    if (broadcast) {
      try {
        await this.relaySend?.({ type: 'MOVEMENT_ROUND_RESET', filter: filtro })
      } catch (err) {
        tokenTrackerWarn('movimento', 'falha ao avisar as outras janelas do fim de rodada', err)
      }
    }
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
