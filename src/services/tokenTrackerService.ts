import OBR, { type Item, type Metadata } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'
import { COMPCON_METADATA_KEY } from '@/types/compcon-obr'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  LANCER_TOKEN_TRACKER_SLOTS,
  TOKEN_TRACKER_ITEM_SLOT_KEY,
  TOKEN_TRACKER_LOCAL_PREFS_ID,
  TOKEN_TRACKER_MOVEMENT_KEY,
  TOKEN_TRACKER_SUMMARY_KEY,
  type TokenTrackerConfig,
  type TokenTrackerLocalPrefs,
  type TokenTrackerSide,
  type TokenTrackerSlotId,
  type TokenTrackerSummary,
  type TokenTrackerValues,
} from '@/types/token-tracker'
import {
  bindingFromMetadata,
  buildTrackerSignature,
  combatantMatchesBinding,
  evaluateTokenRender,
  mergeTrackerValues,
  readTrackerValuesFromStats,
  scoreTrackerValues,
  sheetKindForBinding,
  sheetMatchesBinding,
  sideFromCards,
  statReaderForActor,
  statReaderOf,
  toTrackerInt,
  type TokenTrackerBinding,
  type TokenTrackerRenderReason,
  type TokenTrackerStatReader,
} from '@/services/tokenTrackerModel'
import {
  isCombatantHidden,
  normalizeSide,
  sanitizeTokenTrackerConfig,
} from '@/services/tokenTrackerPolicy'
import {
  sanitizeTokenTrackerSummary,
  shouldPublishSummary,
  shouldWriteSummary,
  summaryToValues,
  summaryWriterId,
  valuesToSummary,
  writerRank,
} from '@/services/tokenTrackerSummary'
import { layoutTokenTrackers, type MovementVisualState } from '@/services/tokenTrackerLayout'
import {
  movementValueFromRecord,
  sanitizeMovementRecord,
} from '@/services/tokenMovementRecord'
import {
  dumpRawStats,
  installTokenTrackerDebugConsole,
  reportStorage,
  setTokenTrackerDumpProvider,
  summarizeBinding,
  summarizeValues,
  tokenTrackerLog,
  tokenTrackerTrace,
  tokenTrackerWarn,
} from '@/services/tokenTrackerDebug'
import { buildTokenTrackerItems, isTokenTrackerItem } from '@/services/tokenTrackerRender'
import {
  isTokenTracked,
  loadLocalPrefs,
  pruneWatchlist,
  saveLocalPrefs,
} from '@/services/tokenTrackerWatchlist'
import { i18n } from '@/i18n'
import { isSheetReadOnlySession } from '@/services/sheetReadOnlySession'

/**
 * Serviço dos token trackers (plano §6.3, §7).
 *
 * Desenha, no mapa, os stats de combate do mecha/NPC vinculado ao token — lendo a
 * ficha local quando ela existe e o resumo gravado no token (§7.6) quando não.
 *
 * Decisões que valem a pena lembrar ao mexer aqui:
 * - os itens são LOCAIS (`OBR.scene.local`): cada janela desenha o que sabe;
 * - o único dado derivado de ficha que cruza a mesa é o resumo do token, e ele
 *   carrega só os 6 números (§7.6);
 * - nada aqui faz HTTP. A regra do `AGENTS.md` vale integralmente;
 * - quem decide se o jogador vê o token é a política da sala (§7.5), nunca a
 *   disponibilidade do dado.
 */

/** Chave da config da sala (política + ajustes de desenho). */
export const TOKEN_TRACKER_ROOM_CONFIG_KEY = 'com.compcon.activemode/token_trackers'

/** Coalescência das rajadas de mudança de estado. */
export const TOKEN_TRACKER_REFRESH_DEBOUNCE_MS = 200

/** Intervalo mínimo entre duas rodadas de gravação de resumo. */
export const TOKEN_TRACKER_SUMMARY_DEBOUNCE_MS = 400

/**
 * Intervalo mínimo entre duas tentativas de recarregar as lojas locais.
 *
 * Sem isso, um token vinculado a uma ficha que realmente não está nesta janela
 * levaria uma releitura do armazenamento a cada gesto/refresh.
 */
export const STORES_RETRY_COOLDOWN_MS = 3000

export interface TokenTrackerSource {
  /** Encontro ativo desta janela (só o GM tem). */
  instance: any | null
}

/**
 * O que a captura de movimento precisa para debitar no motor (§13.3/§13.4).
 *
 * `owner` é o dono do `CombatController` (mecha ou ator): é nele que
 * `SpendMovement`/`Boost`/`HasStatus` são chamados.
 */
export interface MovementTarget {
  tokenId: string
  owner: unknown
  combatController: any
  statController: any
  /** Movimento restante agora (`getCurrent(SPEED)`). */
  remaining: number
  /** Movimento padrão da ficha (`getMax(SPEED)`, sem Boost). */
  maxSpeed: number
  boostBonus: number
  canBoost: boolean
  immobilized: boolean
  binding: TokenTrackerBinding
}

/** Estado de um token do ponto de vista do painel/lista (§7.4). */
export interface TokenTrackerTokenDescription {
  tokenId: string
  /** Nome do item na cena (ou o id da ficha, quando o token não tem nome). */
  name: string
  binding: TokenTrackerBinding
  side: TokenTrackerSide | 'unknown'
  /** Há valor desenhável (ficha local ou resumo do token)? */
  hasValues: boolean
  /** O valor vem da ficha desta janela (e não do resumo gravado no token)? */
  localValues: boolean
  /** Está na watchlist efetiva desta janela? */
  tracked: boolean
  /** O GM marcou o combatente como oculto para os jogadores? */
  hiddenForPlayers: boolean
  /** Motivo do desenho (ou da ausência dele). */
  reason: TokenTrackerRenderReason
}

interface ActorState {
  reader: TokenTrackerStatReader | null
  side: TokenTrackerSide | 'unknown'
  hiddenFromPlayers: boolean
  /** De onde saiu o leitor (texto curto, só para diagnóstico). */
  readerSource: string
  /**
   * Força da fonte: 2 = encontro ativo (onde o GM edita durante o combate),
   * 1 = ficha/stores locais (estado de fora do combate).
   *
   * O app tem mais de uma cópia do mecha, então isto decide tanto quem PODE gravar
   * o resumo quanto se o resumo do token é mais confiável que os valores locais.
   */
  rank: number
  /**
   * Dono do `CombatController` de onde saíram os valores (mecha ou ator). É nele que
   * a captura de movimento debita (§13.4).
   */
  owner: unknown
}

class TokenTrackerService {
  private started = false
  private unsubscribes: Array<() => void> = []
  private source: (() => TokenTrackerSource | null) | null = null

  /**
   * Contador reativo para a UI: muda a cada refresh concluído ou troca de
   * preferência, e é o gatilho para o painel reler a lista de tokens.
   */
  public readonly version = ref(0)

  private config: TokenTrackerConfig = DEFAULT_TOKEN_TRACKER_CONFIG
  private prefs: TokenTrackerLocalPrefs | null = null

  /** Fila por token, como no `statusMarkerService`: dois refreshes do mesmo token não correm juntos. */
  private queues = new Map<string, Promise<void>>()
  /** Assinatura do último desenho aplicado, para não tocar nos itens à toa. */
  private signatures = new Map<string, string>()

  private pendingRefresh = new Set<string>()
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  private pendingSummaries = new Map<string, { values: TokenTrackerValues; writer: string }>()
  private summaryTimer: ReturnType<typeof setTimeout> | null = null

  /////////////////////////////////////////////////////////////////////
  // Ciclo de vida
  /////////////////////////////////////////////////////////////////////

  /** Registra de onde sai o encontro ativo desta janela (o GM registra; jogador não tem). */
  public setSource(source: (() => TokenTrackerSource | null) | null): void {
    this.source = source
  }

  /** Liga o serviço nesta janela. Idempotente. */
  public async start(): Promise<void> {
    if (this.started) return
    this.started = true

    installTokenTrackerDebugConsole()
    setTokenTrackerDumpProvider(() => this.dumpDiagnostics())

    this.prefs = await loadLocalPrefs()
    await this.reloadConfig()

    tokenTrackerLog('start', 'serviço iniciado', {
      papel: this.role,
      trackersLigados: this.config.enabled,
      slotsDesligados: Object.entries(this.config.slots)
        .filter(([, on]) => on === false)
        .map(([slot]) => slot),
      distanciaDoToken: this.config.panelGap,
      politicaParaJogadores: this.config.playerVisibility,
    })

    const onItems = OBR.scene.items.onChange(items => {
      this.onSceneItemsChanged(items)
    })
    const onReady = OBR.scene.onReadyChange(isReady => {
      if (isReady) {
        void this.refreshAll()
      } else {
        this.reset()
      }
    })
    const onPlayer = OBR.player.onChange(async () => {
      await this.syncRole()
      void this.refreshAll()
    })
    const onRoomMetadata = OBR.room.onMetadataChange(metadata => {
      void this.applyRoomConfig(metadata)
    })

    this.unsubscribes.push(onItems, onReady, onPlayer, onRoomMetadata)

    if (typeof window !== 'undefined') {
      const listener = (event: Event) => this.onStateChangedEvent(event)
      window.addEventListener(TOKEN_TRACKER_STATE_EVENT, listener)

      const onPilotSynced = (e: any) => {
        const id = e?.detail?.pilotId || e?.detail?.characterId
        if (id) void this.refreshTokensForSheet(id)
        else void this.scheduleRefreshAll()
      }
      const onNpcSynced = (e: any) => {
        const id = e?.detail?.npcId || e?.detail?.characterId
        if (id) void this.refreshTokensForSheet(id)
        else void this.scheduleRefreshAll()
      }

      window.addEventListener('compcon-pilot-synced', onPilotSynced)
      window.addEventListener('compcon-npc-synced', onNpcSynced)
      window.addEventListener('compcon-pilot-join-combat', onPilotSynced)
      window.addEventListener('compcon-init-sync', onPilotSynced)

      this.unsubscribes.push(
        () => window.removeEventListener(TOKEN_TRACKER_STATE_EVENT, listener),
        () => window.removeEventListener('compcon-pilot-synced', onPilotSynced),
        () => window.removeEventListener('compcon-npc-synced', onNpcSynced),
        () => window.removeEventListener('compcon-pilot-join-combat', onPilotSynced),
        () => window.removeEventListener('compcon-init-sync', onPilotSynced)
      )
    }

    if (await OBR.scene.isReady().catch(() => false)) {
      await this.refreshAll()
    }
  }

  /**
   * Tabela de diagnóstico por token vinculado: o que o serviço vê, de onde tirou os
   * números e por que o painel (não) está desenhado.
   */
  public async dumpDiagnostics(): Promise<unknown[]> {
    if (!(await OBR.scene.isReady().catch(() => false))) {
      tokenTrackerWarn('dump', 'a cena não está pronta; nada para inspecionar')
      return []
    }

    const tokens = await this.getBoundTokens()
    const rows: unknown[] = []

    for (const token of tokens) {
      const binding = bindingFromMetadata(token.metadata?.[COMPCON_METADATA_KEY])
      if (!binding) continue
      const state = await this.resolveActorState(binding)
      const localValues = readTrackerValuesFromStats(state.reader)
      const summary = sanitizeTokenTrackerSummary(token.metadata?.[TOKEN_TRACKER_SUMMARY_KEY])
      const merged = mergeTrackerValues(localValues, summary ? summaryToValues(summary) : null)
      const description = await this.describeToken(token)
      const attachments = await OBR.scene.local
        .getItemAttachments([token.id])
        .catch(() => [] as Item[])

      rows.push({
        token: token.name || token.id,
        vinculo: summarizeBinding(binding),
        lado: state.side,
        fonteDosValores: state.readerSource,
        forcaDaFonte: state.rank,
        chavesLidas: dumpRawStats(state.reader),
        valoresLocais: summarizeValues(localValues),
        resumoNoToken: summary ? `${summarizeValues(summaryToValues(summary))} (${summary.w})` : 'nenhum',
        valoresFinais: summarizeValues(merged.values),
        naListaDestaJanela: description?.tracked,
        resultado: description?.reason,
        estadoDoMovimento: this.movementStateFor(token.id, state.owner),
        itensNoMapa: attachments.filter(isTokenTrackerItem).length,
      })
    }

    return rows
  }

  /** Desliga o serviço (testes/desmontagem). */  public stop(): void {
    for (const unsubscribe of this.unsubscribes) {
      try {
        unsubscribe()
      } catch {
        // listener já removido
      }
    }
    this.unsubscribes = []
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.summaryTimer) clearTimeout(this.summaryTimer)
    this.refreshTimer = null
    this.summaryTimer = null
    this.pendingRefresh.clear()
    this.pendingSummaries.clear()
    this.queues.clear()
    this.signatures.clear()
    this.started = false
  }

  private reset(): void {
    this.signatures.clear()
    this.queues.clear()
    this.pendingRefresh.clear()
    this.resolvedReaders.clear()
    this.storedEncountersCache = null
  }

  /////////////////////////////////////////////////////////////////////
  // Config e watchlist
  /////////////////////////////////////////////////////////////////////

  private role: 'GM' | 'PLAYER' = 'PLAYER'

  /** Papel desta janela, lido do SDK no boot (e atualizado no `player.onChange`). */
  public async syncRole(): Promise<void> {
    try {
      this.role = await OBR.player.getRole()
    } catch {
      this.role = 'PLAYER'
    }
  }

  private async reloadConfig(): Promise<void> {
    await this.syncRole()
    const metadata = await OBR.room.getMetadata().catch(() => ({}) as Metadata)
    await this.applyRoomConfig(metadata)
  }

  private async applyRoomConfig(metadata: Metadata): Promise<void> {
    const next = sanitizeTokenTrackerConfig(metadata?.[TOKEN_TRACKER_ROOM_CONFIG_KEY])
    const changed = JSON.stringify(next) !== JSON.stringify(this.config)
    this.config = next
    if (changed && this.started) this.scheduleRefreshAll()
  }

  public getConfig(): TokenTrackerConfig {
    return this.config
  }

  public getPrefs(): TokenTrackerLocalPrefs {
    return this.prefs ?? { id: TOKEN_TRACKER_LOCAL_PREFS_ID, watchlist: [], muted: [] }
  }

  /** Troca a watchlist desta janela e redesenha. */
  public async setPrefs(prefs: TokenTrackerLocalPrefs, persist = true): Promise<void> {
    this.prefs = prefs
    if (persist) await saveLocalPrefs(prefs)
    this.bumpVersion()
    this.scheduleRefreshAll()
  }

  /////////////////////////////////////////////////////////////////////
  // Refreshes
  /////////////////////////////////////////////////////////////////////

  /** Redesenha um token (enfileirado). */
  public refreshToken(tokenId: string): Promise<void> {
    const previous = this.queues.get(tokenId) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(async () => {
        await this.applyTokenTrackers(tokenId)
        this.bumpVersion()
      })
      .catch(err => {
        tokenTrackerWarn('refresh', `falha ao atualizar o token ${tokenId}`, err)
      })
      .finally(() => {
        if (this.queues.get(tokenId) === next) this.queues.delete(tokenId)
      })
    this.queues.set(tokenId, next)
    return next
  }

  /** Redesenha todos os tokens vinculados da cena. */
  public async refreshAll(): Promise<void> {
    if (!(await OBR.scene.isReady().catch(() => false))) return

    this.invalidateStoredEncounters()
    await this.ensureLocalStoresLoaded()

    const tokens = await this.getBoundTokens()
    tokenTrackerTrace('refreshAll', `${tokens.length} token(s) vinculado(s) na cena`, {
      tokens: tokens.map(token => token.name || token.id),
      papel: this.role,
    })

    await this.prunePrefs(tokens.map(token => token.id))

    for (const token of tokens) {
      await this.refreshToken(token.id)
    }
    await this.flushSummariesNow()
  }

  /**
   * Garante que os rosters locais estejam carregados.
   *
   * Sem isso, uma janela que nunca abriu o Hangar/roster de NPCs fica com
   * `Pilots`/`Npcs` vazios, a ficha não é encontrada e o painel aparece vazio.
   *
   * `LoadPilots()` também carrega as fichas do modo ativo
   * (`PilotStore().LoadPilots()` chama `PilotSheetStore().LoadPilotSheets()`), então
   * esta é a única porta que precisa ser aberta.
   *
   * **`force` existe porque a primeira tentativa pode chegar cedo demais:** se o boot
   * roda antes de o armazenamento/driver responder, `Pilots` fica 0 e — sem retry —
   * aquela janela fica sem ficha para o resto da sessão (era o "dono: nenhum" no
   * gesto de movimento). O cooldown evita tempestade quando o vazio é real.
   */
  private async ensureLocalStoresLoaded(force = false): Promise<void> {
    const now = Date.now()
    if (force) {
      if (now - this.storesLoadAt < STORES_RETRY_COOLDOWN_MS) return
    } else if (this.storesLoadAttempted) {
      if (!this.localSourcesAreEmpty() || now - this.storesLoadAt < STORES_RETRY_COOLDOWN_MS) {
        return
      }
    }

    this.storesLoadAttempted = true
    this.storesLoadAt = now
    try {
      const pilotStore = this.pilotStore()
      const npcStore = this.npcStore()
      const antes = {
        pilotos: pilotStore?.Pilots?.length ?? 0,
        fichas: this.pilotSheets().length,
        npcs: npcStore?.Npcs?.length ?? 0,
      }

      if (
        (pilotStore?.Pilots?.length ?? 0) === 0 &&
        typeof pilotStore?.LoadPilots === 'function'
      ) {
        await pilotStore.LoadPilots()
      } else if (this.pilotSheets().length === 0) {
        // Caso esquisito: pilotos carregados mas nenhuma ficha. As fichas vivem em
        // `pilot_sheets` e podem estar vazias por conta própria (o sync da sala
        // substitui a lista) — recarrega só elas.
        await this.loadPilotSheets()
      }
      if ((npcStore?.Npcs?.length ?? 0) === 0 && typeof npcStore?.LoadNpcs === 'function') {
        await npcStore.LoadNpcs()
      }

      const depois = {
        pilotos: this.pilotStore()?.Pilots?.length ?? 0,
        fichas: this.pilotSheets().length,
        npcs: this.npcStore()?.Npcs?.length ?? 0,
      }
      if (force || antes.pilotos !== depois.pilotos || antes.fichas !== depois.fichas) {
        tokenTrackerLog('stores', 'lojas locais recarregadas', { antes, depois })
      }
    } catch (err) {
      tokenTrackerWarn('stores', 'falha ao carregar os rosters locais', err)
    }
  }

  /** Nenhuma fonte local tem nada? (sinal de armazenamento/driver que não respondeu) */
  private localSourcesAreEmpty(): boolean {
    return (
      (this.pilotStore()?.Pilots?.length ?? 0) === 0 &&
      this.pilotSheets().length === 0 &&
      (this.npcStore()?.Npcs?.length ?? 0) === 0
    )
  }

  /** `PilotSheetStore().LoadPilotSheets()`, quando o store estiver acessível. */
  private async loadPilotSheets(): Promise<void> {
    try {
      const store = this.pilotSheetStore()
      if (store && typeof store.LoadPilotSheets === 'function') await store.LoadPilotSheets()
    } catch (err) {
      tokenTrackerWarn('stores', 'falha ao carregar as fichas do modo ativo', err)
    }
  }

  private storesLoadAttempted = false
  private storesLoadAt = 0
  private warnedStorageEmpty = false

  /** Redesenha só os tokens que apontam para uma ficha (chamado quando ela muda). */
  public async refreshTokensForSheet(sheetId: string): Promise<void> {
    const tokens = await this.getBoundTokens()
    const target = (sheetId || '').toLowerCase()
    for (const token of tokens) {
      const binding = bindingFromMetadata(token.metadata?.[COMPCON_METADATA_KEY])
      if (!binding) continue
      const bSheetId = (binding.sheetId || '').toLowerCase()
      const bMechId = (binding.mechId || '').toLowerCase()
      if (bSheetId === target || (bMechId && bMechId === target)) {
        await this.refreshToken(token.id)
      }
    }
    await this.flushSummariesNow()
  }

  private scheduleRefreshAll(): void {
    this.pendingRefresh.add('*')
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      const hadAll = this.pendingRefresh.has('*')
      this.pendingRefresh.clear()
      void (hadAll ? this.refreshAll() : Promise.resolve())
    }, TOKEN_TRACKER_REFRESH_DEBOUNCE_MS)
  }

  /////////////////////////////////////////////////////////////////////
  // Leitura de cena
  /////////////////////////////////////////////////////////////////////

  private async getBoundTokens(): Promise<Item[]> {
    const items = await OBR.scene.items.getItems().catch(() => [] as Item[])
    return items.filter(item => bindingFromMetadata(item.metadata?.[COMPCON_METADATA_KEY]) !== null)
  }

  private async prunePrefs(validTokenIds: string[]): Promise<void> {
    const current = this.getPrefs()
    const pruned = pruneWatchlist(current, validTokenIds)
    if (pruned !== current) await this.setPrefs(pruned)
  }

  private onSceneItemsChanged(items: Item[]): void {
    if (!this.started) return

    for (const item of items) {
      // O painel é composto de itens anexados (ATTACHMENT/TEXT): eles não disparam
      // refresh, senão o desenho realimenta a si mesmo.
      if (item.layer === 'ATTACHMENT' || item.layer === 'TEXT') continue
      const binding = bindingFromMetadata(item.metadata?.[COMPCON_METADATA_KEY])
      if (!binding) {
        // Token perdeu o vínculo (desvinculado): limpa o que sobrou.
        if (this.signatures.has(item.id)) this.pendingTokenRefresh(item.id)
        continue
      }
      this.pendingTokenRefresh(item.id)
    }

    this.schedulePendingRefresh()
  }

  private pendingTokenRefresh(tokenId: string): void {
    this.pendingRefresh.add(tokenId)
  }

  private schedulePendingRefresh(): void {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      const ids = [...this.pendingRefresh]
      this.pendingRefresh.clear()
      for (const id of ids) {
        if (id === '*') void this.refreshAll()
        else void this.refreshToken(id)
      }
    }, TOKEN_TRACKER_REFRESH_DEBOUNCE_MS)
  }

  private onStateChangedEvent(event: Event): void {
    const detail = (event as CustomEvent).detail as { sheetId?: string; tokenId?: string } | undefined
    if (detail?.tokenId) void this.refreshToken(detail.tokenId)
    else if (detail?.sheetId) void this.refreshTokensForSheet(detail.sheetId)
    else this.scheduleRefreshAll()
  }

  /////////////////////////////////////////////////////////////////////
  // Aplicação no token
  /////////////////////////////////////////////////////////////////////

  /**
   * Tudo que se sabe sobre o tracker de um token nesta janela — usado tanto para
   * desenhar quanto para a lista da UI (que precisa distinguir "sem dados aqui" de
   * "bloqueado pelo mestre").
   */
  public async describeToken(token: Item): Promise<TokenTrackerTokenDescription | null> {
    const binding = bindingFromMetadata(token.metadata?.[COMPCON_METADATA_KEY])
    if (!binding) return null

    if (this.localSourcesAreEmpty()) {
      await this.ensureLocalStoresLoaded(true)
    }

    const state = await this.resolveActorState(binding)
    const localValues = readTrackerValuesFromStats(state.reader)
    const summary = sanitizeTokenTrackerSummary(token.metadata?.[TOKEN_TRACKER_SUMMARY_KEY])
    const fromToken = summary ? summaryToValues(summary) : null
    const merged = mergeTrackerValues(localValues, fromToken)

    const tracked = isTokenTracked({
      tokenId: token.id,
      hasValues: merged.hasValues,
      prefs: this.getPrefs(),
    })

    const decision = evaluateTokenRender({
      role: this.role,
      side: state.side,
      hiddenFromPlayers: state.hiddenFromPlayers,
      combatantId: binding.combatantId ?? null,
      isTracked: tracked,
      hasValues: merged.hasValues,
      config: this.config,
    })

    const hiddenForPlayers =
      this.role === 'GM'
        ? isCombatantHidden(
            binding.combatantId ?? null,
            state.hiddenFromPlayers,
            this.config.playerVisibility
          )
        : false

    return {
      tokenId: token.id,
      name: token.name || binding.sheetId,
      binding,
      side: state.side,
      hasValues: merged.hasValues,
      localValues: Object.keys(localValues).length > 0,
      tracked,
      hiddenForPlayers,
      reason: decision.reason,
    }
  }

  /** Lista os tokens vinculados desta cena com o estado de cada um (para a UI). */
  public async describeTokens(): Promise<TokenTrackerTokenDescription[]> {
    if (!(await OBR.scene.isReady().catch(() => false))) return []
    const tokens = await this.getBoundTokens()
    const descriptions: TokenTrackerTokenDescription[] = []
    for (const token of tokens) {
      const description = await this.describeToken(token)
      if (description) descriptions.push(description)
    }
    return descriptions
  }

  private async applyTokenTrackers(tokenId: string): Promise<void> {
    if (!(await OBR.scene.isReady().catch(() => false))) return

    const token = (await OBR.scene.items.getItems([tokenId]).catch(() => [] as Item[]))[0]
    if (!token) {
      await this.clearItems(tokenId)
      this.signatures.delete(tokenId)
      return
    }

    const binding = bindingFromMetadata(token.metadata?.[COMPCON_METADATA_KEY])
    if (!binding) {
      tokenTrackerTrace('refresh', `token ${tokenId}: sem vínculo; limpando itens`)
      await this.clearItems(tokenId)
      this.signatures.delete(tokenId)
      return
    }

    if (this.localSourcesAreEmpty()) {
      await this.ensureLocalStoresLoaded(true)
    }

    const state = await this.resolveActorState(binding)
    const localValues = readTrackerValuesFromStats(state.reader)
    const summary = sanitizeTokenTrackerSummary(token.metadata?.[TOKEN_TRACKER_SUMMARY_KEY])
    const fromToken = summary ? summaryToValues(summary) : null

    // O resumo veio de uma fonte mais forte (o encontro ativo, tipicamente em outra
    // janela)? Então ele MANDA, e os valores locais — que são o estado de fora do
    // combate — não podem sobrescrevê-lo no desenho.
    const summaryWins = !!summary && writerRank(summary.w) > state.rank
    const merged = mergeTrackerValues(summaryWins ? null : localValues, fromToken)

    // O MOVIMENTO não é derivado da ficha: ele é gravado no próprio token pelo arrasto
    // (§13 — revisão da captura). Quando existe, é ele que manda no slot `speed`, em
    // qualquer janela — inclusive numa que não tenha a ficha e sem esperar o resumo.
    const movementRecord = sanitizeMovementRecord(token.metadata?.[TOKEN_TRACKER_MOVEMENT_KEY])
    if (movementRecord) {
      merged.values.speed = movementValueFromRecord(movementRecord)
      merged.origins.speed = 'token'
      merged.hasValues = true
    }

    const tracked = isTokenTracked({
      tokenId,
      hasValues: merged.hasValues,
      prefs: this.getPrefs(),
    })

    const movementState = this.movementStateFor(tokenId, state.owner)

    tokenTrackerTrace('refresh', `"${token.name || tokenId}"`, {
      vinculo: summarizeBinding(binding),
      papel: this.role,
      lado: state.side,
      fonteDosValores: state.readerSource,
      forcaDaFonte: state.rank,
      resumoDeQuem: summary ? `${summary.w}` : 'nenhum',
      desenhandoDoResumo: summaryWins,
      chavesLidas: dumpRawStats(state.reader),
      valoresLocais: summarizeValues(localValues),
      resumoNoToken: summary ? summarizeValues(summaryToValues(summary)) : 'nenhum',
      valoresFinais: summarizeValues(merged.values),
      estadoDoMovimento: movementState,
      naListaDestaJanela: tracked,
    })

    if (!merged.hasValues) {
      tokenTrackerWarn(
        'refresh',
        `"${token.name || tokenId}": NENHUM valor — nem ficha local (${state.readerSource}) nem resumo no token; o painel fica vazio`,
        { chavesLidas: dumpRawStats(state.reader) }
      )
    }

    // A escrita do resumo independe de o painel aparecer nesta janela: o número
    // precisa existir para as OUTRAS janelas desenharem. A força da fonte vai no
    // escritor para uma fonte fraca não passar por cima de uma forte.
    this.queueSummaryIfWriter(tokenId, binding, localValues, state.rank)

    const decision = evaluateTokenRender({
      role: this.role,
      side: state.side,
      hiddenFromPlayers: state.hiddenFromPlayers,
      combatantId: binding.combatantId ?? null,
      isTracked: tracked,
      hasValues: merged.hasValues,
      config: this.config,
    })

    if (!decision.render) {
      tokenTrackerTrace('refresh', `"${token.name || tokenId}": não desenha (${decision.reason})`, {
        lado: state.side,
        naLista: tracked,
        ocultoNoEncontro: state.hiddenFromPlayers,
        politica: this.config.playerVisibility,
      })
      await this.clearItems(tokenId)
      this.signatures.delete(tokenId)
      return
    }

    const bounds = await OBR.scene.items.getItemBounds([tokenId]).catch(() => null)
    if (!bounds) {
      tokenTrackerWarn('refresh', `"${token.name || tokenId}" sem bounds; nada a desenhar`)
      await this.clearItems(tokenId)
      return
    }

    const { commands } = layoutTokenTrackers({
      bounds,
      values: merged.values,
      config: this.config,
      movementState,
    })

    const signature = [
      buildTrackerSignature(merged.values, this.config),
      // O estado do movimento muda a COR do badge sem mudar valores: sem ele aqui, um
      // Boost concedido não repintaria o badge.
      movementState,
      [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].join(','),
    ].join('|')

    if (this.signatures.get(tokenId) === signature) {
      tokenTrackerTrace('refresh', `"${token.name || tokenId}": assinatura igual, itens intactos`)
      return
    }
    this.signatures.set(tokenId, signature)

    const wanted = buildTokenTrackerItems(tokenId, commands, {
      visible: token.visible,
      sceneDpi: await OBR.scene.grid.getDpi().catch(() => 150),
    })
    await this.syncItems(tokenId, wanted)
  }

  /** Avisa a UI de que os estados mudaram (a lista do painel relê). */
  private bumpVersion(): void {
    this.version.value++
  }

  /**
   * Quem sabe se um gesto está com estouro pendente (§13.5) — a captura registra.
   *
   * É um resolvedor registrado de fora, e não um `import`, para não criar ciclo entre
   * o serviço e a captura (a captura já importa o serviço).
   */
  public setMovementOverflowResolver(resolver: ((tokenId: string) => boolean) | null): void {
    this.movementOverflowResolver = resolver
  }

  private movementOverflowResolver: ((tokenId: string) => boolean) | null = null

  /**
   * Estado visual do Movimento para o badge (§6.1): estouro pendente ganha de Boost,
   * que ganha do normal.
   */
  private movementStateFor(tokenId: string, owner: unknown): MovementVisualState {
    try {
      if (this.movementOverflowResolver?.(tokenId)) return 'overflow'
    } catch {
      // resolvedor quebrado não pode derrubar o desenho
    }
    const boostBonus = toTrackerInt(
      (owner as { CombatController?: { BoostBonus?: unknown } } | null)?.CombatController?.BoostBonus
    )
    return boostBonus > 0 ? 'boosted' : 'normal'
  }

  /** Aplica a diferença entre o que existe no token e o que deveria existir. */
  private async syncItems(tokenId: string, wanted: Item[]): Promise<void> {
    // Ficha em modo leitura nesta janela: nenhum desenho de tracker no token.
    if (isSheetReadOnlySession()) return

    const existing = await OBR.scene.local.getItemAttachments([tokenId]).catch(() => [] as Item[])
    const ours = existing.filter(isTokenTrackerItem)
    const desiredById = new Map(wanted.map(item => [item.id, item]))
    const existingIds = new Set(ours.map(item => item.id))

    const toDelete = ours.filter(item => !desiredById.has(item.id)).map(item => item.id)
    const toUpdate = ours.filter(item => desiredById.has(item.id)).map(item => item.id)
    const toAdd = wanted.filter(item => !existingIds.has(item.id))

    // Contagem por slot: responde "faltam os quadrados de Estresse" sem achismo — se
    // `stress` vier 0 aqui, a linha foi descartada na montagem.
    const porSlot: Record<string, number> = {}
    for (const item of wanted) {
      const slot = String(item.metadata?.[TOKEN_TRACKER_ITEM_SLOT_KEY] ?? '?')
      porSlot[slot] = (porSlot[slot] ?? 0) + 1
    }
    tokenTrackerTrace('items', `token ${tokenId}: +${toAdd.length} ~${toUpdate.length} -${toDelete.length}`, {
      desejados: wanted.length,
      porSlot,
    })

    if (toDelete.length) {
      await OBR.scene.local.deleteItems(toDelete).catch(err => {
        tokenTrackerWarn('items', 'falha ao remover itens do painel', err)
      })
    }

    if (toUpdate.length) {
      await OBR.scene.local
        .updateItems(toUpdate, drafts => {
          for (const draft of drafts) {
            const desired = desiredById.get(draft.id)
            if (desired) Object.assign(draft, desired)
          }
        })
        .catch(err => {
          tokenTrackerWarn('items', 'falha ao atualizar itens do painel', err)
        })
    }

    if (toAdd.length) {
      await OBR.scene.local.addItems(toAdd).catch(err => {
        tokenTrackerWarn('items', 'falha ao criar itens do painel', err)
      })
    }
  }

  /** Remove todos os itens do painel deste token. */
  public async clearItems(tokenId: string): Promise<void> {
    const existing = await OBR.scene.local.getItemAttachments([tokenId]).catch(() => [] as Item[])
    const ours = existing.filter(isTokenTrackerItem).map(item => item.id)
    if (!ours.length) return
    await OBR.scene.local.deleteItems(ours).catch(() => {})
  }

  /** Limpa sobras de sessões antigas (itens do painel sem token ou órfãos). */
  public async cleanupLegacyItems(): Promise<void> {
    if (!(await OBR.scene.isReady().catch(() => false))) return
    const items = await OBR.scene.local.getItems().catch(() => [] as Item[])
    const orphans = items.filter(isTokenTrackerItem).filter(item => !item.attachedTo)
    if (!orphans.length) return
    await OBR.scene.local.deleteItems(orphans.map(item => item.id)).catch(() => {})
  }

  /////////////////////////////////////////////////////////////////////
  // Resolução de estado
  /////////////////////////////////////////////////////////////////////

  private async resolveActorState(binding: TokenTrackerBinding): Promise<ActorState> {
    const instance = this.source?.()?.instance ?? null
    const combatants: any[] = Array.isArray(instance?.Combatants) ? instance.Combatants : []
    const combatant = combatants.find(entry => combatantMatchesBinding(entry, binding))

    if (combatant) {
      const resolved = statReaderForActor(combatant.actor ?? combatant.npc, binding)
      return {
        reader: resolved.reader,
        owner: resolved.owner,
        side: normalizeSide(combatant.side),
        hiddenFromPlayers: combatant.hiddenFromPlayers === true,
        readerSource: `encontro ativo desta janela → ${resolved.source}`,
        rank: 2,
      }
    }

    // Encontro não registrado NESTA janela (típico da janela de chat/ações): lê os
    // encontros ativos do IndexedDB compartilhado. Sem isso, o GM ficava com lado
    // desconhecido e sem os atores do combate.
    const stored = await this.combatantFromStoredEncounters(binding)
    if (stored) {
      const { combatant: storedCombatant, encounterName } = stored
      const resolved = statReaderForActor(storedCombatant.actor ?? storedCombatant.npc, binding)
      return {
        reader: resolved.reader,
        owner: resolved.owner,
        side: normalizeSide(storedCombatant.side),
        hiddenFromPlayers: storedCombatant.hiddenFromPlayers === true,
        readerSource: `encontro "${encounterName}" lido do storage → ${resolved.source}`,
        rank: 2,
      }
    }

    let local = this.readerFromLocalStores(binding)
    if (!local.reader) {
      const fromStorage = await this.actorFromLocalStorage(binding)
      if (fromStorage.reader) {
        local = fromStorage
        this.rememberReader(binding, local)
      }
    }

    return {
      reader: local.reader,
      owner: local.owner,
      side: this.sideFromLocalSnapshot(binding),
      hiddenFromPlayers: false,
      readerSource: local.source,
      // Ficha do modo ativo / stores locais: é o estado FORA do combate. Se o
      // encontro ativo existir em outra janela, o resumo do token é mais confiável.
      rank: 1,
    }
  }

  /**
   * Busca a ficha diretamente no armazenamento local (IndexedDB) como salvaguarda
   * quando os stores em memória desta janela ainda não foram populados.
   */
  private async actorFromLocalStorage(binding: TokenTrackerBinding): Promise<{
    reader: TokenTrackerStatReader | null
    owner: unknown
    source: string
  }> {
    try {
      const { GetItem, GetAll } = await import('@/io/Storage')
      const targetId = (binding.sheetId || '').toLowerCase()
      const targetMechId = (binding.mechId || '').toLowerCase()
      const kind = sheetKindForBinding(binding)

      // 1. Tenta buscar em 'pilots' (caso padrão para pilotos e mechas)
      if (kind !== 'npc') {
        let rawPilot: any = await GetItem('pilots', binding.sheetId).catch(() => null)
        if (!rawPilot && targetMechId) {
          rawPilot = await GetItem('pilots', binding.mechId!).catch(() => null)
        }
        if (!rawPilot) {
          const allPilots = (await GetAll('pilots').catch(() => [])) as any[]
          rawPilot = allPilots.find((p: any) => {
            const pId = (p.id || p.ID || '').toLowerCase()
            if (pId === targetId || (targetMechId && pId === targetMechId)) return true
            if (Array.isArray(p.Mechs)) {
              return p.Mechs.some((m: any) => {
                const mId = (m.id || m.ID || '').toLowerCase()
                return mId === targetId || (targetMechId && mId === targetMechId)
              })
            }
            return false
          })
        }

        if (rawPilot) {
          const { Pilot } = await import('@/classes/pilot/Pilot')
          const pilotInstance = Pilot.Deserialize(rawPilot)
          if (pilotInstance) {
            if (!pilotInstance.ActiveMech && pilotInstance.Mechs?.length) {
              pilotInstance.ActiveMech = pilotInstance.Mechs[0]
            }
            if (typeof pilotInstance.SetStats === 'function') {
              pilotInstance.SetStats()
            }
            if (pilotInstance.ActiveMech && typeof pilotInstance.ActiveMech.SetStats === 'function') {
              pilotInstance.ActiveMech.SetStats()
            }

            const pilotStore = this.pilotStore()
            if (pilotStore && Array.isArray(pilotStore.Pilots)) {
              const existingIdx = pilotStore.Pilots.findIndex(
                (p: any) => (p.ID || p.id || '').toLowerCase() === ((pilotInstance as any).ID || (pilotInstance as any).id || '').toLowerCase()
              )
              if (existingIdx !== -1) {
                pilotStore.Pilots.splice(existingIdx, 1, pilotInstance)
              } else {
                pilotStore.Pilots.push(pilotInstance)
              }
            }

            const resolved = statReaderForActor(pilotInstance, binding)
            return {
              reader: resolved.reader,
              owner: resolved.owner,
              source: `IndexedDB(pilots) → ${resolved.source}`,
            }
          }
        }
      }

      // 2. Se não achou ou for NPC, tenta em 'npcs'
      let rawNpc: any = await GetItem('npcs', binding.sheetId).catch(() => null)
      if (!rawNpc) {
        const allNpcs = (await GetAll('npcs').catch(() => [])) as any[]
        rawNpc = allNpcs.find((n: any) => (n.id || n.ID || '').toLowerCase() === targetId)
      }

      if (rawNpc) {
        let npcInstance: any = null
        if (rawNpc.npcType === 'doodad') {
          const { Doodad } = await import('@/classes/npc/doodad/Doodad')
          npcInstance = Doodad.Deserialize(rawNpc)
        } else if (rawNpc.npcType === 'eidolon') {
          const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon')
          npcInstance = Eidolon.Deserialize(rawNpc)
        } else {
          const { Unit } = await import('@/classes/npc/unit/Unit')
          npcInstance = Unit.Deserialize(rawNpc)
        }

        if (npcInstance) {
          const npcStore = this.npcStore()
          if (npcStore && Array.isArray(npcStore.Npcs)) {
            const existingIdx = npcStore.Npcs.findIndex(
              (n: any) => (n.ID || n.id || '').toLowerCase() === (npcInstance.ID || npcInstance.id || '').toLowerCase()
            )
            if (existingIdx !== -1) {
              npcStore.Npcs.splice(existingIdx, 1, npcInstance)
            } else {
              npcStore.Npcs.push(npcInstance)
            }
          }

          return {
            reader: statReaderOf(npcInstance),
            owner: npcInstance,
            source: 'IndexedDB(npcs)',
          }
        }
      }

      // 3. Tenta em 'pilot_sheets' (fichas do modo ativo salvas)
      const allSheets = (await GetAll('pilot_sheets').catch(() => [])) as any[]
      const rawSheet = allSheets.find((s: any) => {
        const sId = (s.id || s.ID || '').toLowerCase()
        const actorId = (s.combatant?.actor?.id || s.combatant?.actor?.ID || '').toLowerCase()
        return sId === targetId || actorId === targetId
      })
      if (rawSheet) {
        const PilotSheet = (await import('@/features/pilot_management/store/PilotSheet')).default
        const sheetInstance = PilotSheet.Deserialize(rawSheet)
        if (sheetInstance) {
          const resolved = statReaderForActor(sheetInstance.Pilot ?? sheetInstance.Combatant?.actor, binding)
          return {
            reader: resolved.reader,
            owner: resolved.owner,
            source: `IndexedDB(pilot_sheets) → ${resolved.source}`,
          }
        }
      }

      return {
        reader: null,
        owner: null,
        source: 'não encontrado no IndexedDB (pilots, npcs, pilot_sheets)',
      }
    } catch (err) {
      tokenTrackerWarn('stores', 'falha ao buscar ator no IndexedDB', err)
      return {
        reader: null,
        owner: null,
        source: `erro ao consultar IndexedDB: ${String(err)}`,
      }
    }
  }

  /**
   * Procura o combatente nos encontros ativos gravados (`active_encounters`).
   *
   * Mesma ideia do `npcSheetLookup`: nenhuma janela enxerga o estado em memória da
   * outra, e o que cruza é o IndexedDB. O cache vale por um `refreshAll` e é
   * descartado quando os encontros são recarregados.
   */
  private async combatantFromStoredEncounters(
    binding: TokenTrackerBinding
  ): Promise<{ combatant: any; encounterName: string } | null> {
    const instances = await this.getStoredEncounterInstances()
    for (const instance of instances) {
      const combatants: any[] = Array.isArray(instance?.Combatants) ? instance.Combatants : []
      const combatant = combatants.find(entry => combatantMatchesBinding(entry, binding))
      if (combatant) return { combatant, encounterName: instance?.Name || instance?.ID || 'sem nome' }
    }
    return null
  }

  private storedEncountersCache: { at: number; instances: any[] } | null = null

  private async getStoredEncounterInstances(): Promise<any[]> {
    const now = Date.now()
    if (this.storedEncountersCache && now - this.storedEncountersCache.at < 5000) {
      return this.storedEncountersCache.instances
    }
    try {
      const [{ GetAll }, { EncounterInstance }] = await Promise.all([
        import('@/io/Storage'),
        import('@/classes/encounter/EncounterInstance'),
      ])
      const records = await GetAll('active_encounters')
      const instances = records
        .map(record => {
          try {
            return EncounterInstance.Deserialize(record)
          } catch {
            return null
          }
        })
        .filter(Boolean)
      this.storedEncountersCache = { at: now, instances }
      return instances
    } catch (err) {
      tokenTrackerWarn('stores', 'falha ao ler os encontros ativos do storage', err)
      this.storedEncountersCache = { at: now, instances: [] }
      return []
    }
  }

  /** Descarta o cache dos encontros (fim de refresh / encontros recarregados). */
  private invalidateStoredEncounters(): void {
    this.storedEncountersCache = null
  }

  /**
   * Tudo que a captura de movimento (§13.3) precisa saber do token: o
   * `CombatController` do dono da ficha e os números do turno.
   *
   * Devolve `null` quando o token não tem vínculo, não tem ficha resolvida nesta
   * janela, ou o dono não tem `CombatController` — nos três casos não há o que
   * debitar, e a captura prefere não tocar em nada.
   */
  public async getMovementTarget(tokenId: string): Promise<MovementTarget | null> {
    try {
      const token = (await OBR.scene.items.getItems([tokenId]).catch(() => [] as Item[]))[0]
      if (!token) {
        tokenTrackerWarn('movimento', `token ${tokenId} não existe mais na cena`)
        return null
      }

      const binding = bindingFromMetadata(token.metadata?.[COMPCON_METADATA_KEY])
      if (!binding) {
        // Esperado ao arrastar cenário: a captura já filtra isso, então chegar aqui
        // significa que o vínculo sumiu entre o gesto e o settle.
        tokenTrackerTrace(
          'movimento',
          `"${token.name || tokenId}": sem vínculo em metadata["${COMPCON_METADATA_KEY}"]`
        )
        return null
      }

      // Janela sem NENHUMA fonte (nem piloto, nem ficha, nem NPC): a tentativa de
      // carga do boot pode ter chegado antes de o armazenamento responder. Tenta de
      // novo — com cooldown — antes de concluir que a ficha não existe aqui.
      if (this.localSourcesAreEmpty()) {
        await this.ensureLocalStoresLoaded(true)
        // Continuou vazio: o problema não é timing, é esta janela não enxergar o
        // armazenamento (origem diferente ou driver em memória). Vale dizer isso uma
        // vez, com o retrato que responde a pergunta.
        if (this.localSourcesAreEmpty() && !this.warnedStorageEmpty) {
          this.warnedStorageEmpty = true
          const report = await reportStorage()
          tokenTrackerWarn(
            'stores',
            'esta janela não enxerga NENHUMA ficha: ou o token não está vinculado a uma ficha que exista aqui, ou o armazenamento/ origem desta janela é outro (compare `__ccTokenTracker.storage()` nas duas janelas)',
            report ?? undefined
          )
        }
      }

      const state = await this.resolveActorState(binding)
      const owner = state.owner as { CombatController?: any } | null
      const combat = owner?.CombatController
      if (!combat || typeof combat.SpendMovement !== 'function') {
        tokenTrackerWarn(
          'movimento',
          `"${token.name || tokenId}": ficha resolvida mas o dono não tem CombatController com SpendMovement — nada debitado`,
          {
            vinculo: summarizeBinding(binding),
            fonteDosValores: state.readerSource,
            temStatController: !!state.reader,
            dono: describeOwner(owner),
          }
        )
        return null
      }

      const values = readTrackerValuesFromStats(state.reader)
      const remaining = values.speed?.current ?? 0
      const maxSpeed = toTrackerInt(combat.StatController?.getMax?.('speed'))

      tokenTrackerTrace('movimento', `alvo de movimento de "${token.name || tokenId}"`, {
        vinculo: summarizeBinding(binding),
        fonte: state.readerSource,
        dono: describeOwner(owner),
        restante: remaining,
        capDoTurno: toTrackerInt(combat.BoostedSpeed),
        boostBonus: toTrackerInt(combat.BoostBonus),
      })

      return {
        tokenId,
        owner,
        combatController: combat,
        statController: combat.StatController ?? null,
        remaining,
        maxSpeed,
        boostBonus: toTrackerInt(combat.BoostBonus),
        canBoost: this.canBoost(combat),
        immobilized: this.hasStatus(combat, 'immobilized'),
        binding,
      }
    } catch (err) {
      tokenTrackerWarn('movimento', 'falha ao resolver o alvo de movimento', err)
      return null
    }
  }

  /** `CanActivate('boost')` do motor, sem deixar uma ficha estranha derrubar a captura. */
  private canBoost(combat: any): boolean {
    try {
      return combat?.CanActivate?.('boost') === true
    } catch {
      return false
    }
  }

  private hasStatus(combat: any, status: string): boolean {
    try {
      return combat?.HasStatus?.(status) === true
    } catch {
      return false
    }
  }

  /** Ficha local desta janela (o jogador tem a própria; o GM tem todas que foram sincronizadas). */
  private readerFromLocalStores(binding: TokenTrackerBinding): {
    reader: TokenTrackerStatReader | null
    owner: unknown
    source: string
  } {
    try {
      const pilotStore = this.pilotStore()
      const npcStore = this.npcStore()
      const sheets = this.pilotSheets()
      const activeSheet = this.activePilotSheet()
      const kind = sheetKindForBinding(binding)

      if (!pilotStore && !npcStore) {
        return {
          reader: null,
          owner: null,
          source: 'sem acesso aos stores (setStoreAccessors não foi chamado)',
        }
      }

      const npcCount = npcStore?.Npcs?.length ?? 0
      const pilotCount = pilotStore?.Pilots?.length ?? 0
      const kindLabel = kind === 'npc' ? 'ficha de NPC' : kind === 'mech' ? 'ficha de MECHA' : 'ficha de PILOTO (a pé)'

      // Candidatos em ordem de prioridade, e do TIPO certo: vínculo com `mechId` lê o
      // MECHA (`ActiveMech`/`Mechs[mechId]`), vínculo sem ele lê o PRÓPRIO piloto.
      // Nunca misturar: o StatController do piloto não tem calor/estrutura/estresse de
      // mecha, e o mecha do Hangar pode estar com os máximos pela metade.
      const candidates: Array<{
        reader: TokenTrackerStatReader | null
        owner: unknown
        source: string
      }> = []
      const readerFor = (actor: unknown): { reader: TokenTrackerStatReader | null; owner: unknown } =>
        kind === 'mech'
          ? statReaderForActor(actor, binding)
          : { reader: statReaderOf(actor), owner: actor }

      const targetId = (binding.sheetId || '').toLowerCase()
      const targetMechId = (binding.mechId || '').toLowerCase()

      if (kind === 'npc') {
        const npc =
          npcStore?.Npcs?.find((n: any) => (n.ID || n.id || '').toLowerCase() === targetId) ||
          npcStore?.getNpcByID?.(binding.sheetId)
        if (npc) {
          candidates.push({ ...readerFor(npc), source: `NpcStore(${npcCount} npcs) por sheetId` })
        }
      } else {
        if (activeSheet && sheetMatchesBinding(activeSheet, binding)) {
          candidates.push({
            ...readerFor(activeSheet?.Pilot ?? activeSheet?.Combatant?.actor),
            source: `ficha ATIVA desta janela [${kindLabel}]`,
          })
        }

        const sheet = sheets.find((candidate: any) => sheetMatchesBinding(candidate, binding))
        if (sheet) {
          candidates.push({
            ...readerFor(sheet?.Pilot ?? sheet?.Combatant?.actor),
            source: `PilotSheetStore(${sheets.length} fichas) [${kindLabel}]`,
          })
        }

        const pilot =
          pilotStore?.Pilots?.find((p: any) => {
            const pId = (p.ID || p.id || '').toLowerCase()
            if (pId === targetId || (targetMechId && pId === targetMechId)) return true
            if (Array.isArray(p.Mechs)) {
              return p.Mechs.some((m: any) => {
                const mId = (m.ID || m.id || '').toLowerCase()
                return mId === targetId || (targetMechId && mId === targetMechId)
              })
            }
            return false
          }) || pilotStore?.getPilotByID?.(binding.sheetId)

        if (pilot) {
          const resolved = statReaderForActor(pilot, binding)
          candidates.push({
            ...readerFor(pilot),
            source:
              kind === 'mech'
                ? `PilotStore(${pilotCount} pilotos) → ${resolved.source} [${kindLabel}]`
                : `PilotStore(${pilotCount} pilotos) [${kindLabel}]`,
          })
        }
      }

      const npc =
        npcStore?.Npcs?.find((n: any) => (n.ID || n.id || '').toLowerCase() === targetId) ||
        npcStore?.getNpcByID?.(binding.sheetId)
      if (npc) {
        candidates.push({ ...readerFor(npc), source: `NpcStore(${npcCount} npcs) por fallback` })
      }

      const synced = this.syncedSheets()
      if (synced) {
        const syncedMatch = Object.values(synced).find((s: any) => {
          const cId = (s.characterId || s.data?.id || s.data?.ID || '').toLowerCase()
          if (cId === targetId || (targetMechId && cId === targetMechId)) return true
          if (Array.isArray(s.data?.Mechs)) {
            return s.data.Mechs.some((m: any) => {
              const mId = (m.ID || m.id || '').toLowerCase()
              return mId === targetId || (targetMechId && mId === targetMechId)
            })
          }
          return false
        })
        if (syncedMatch?.data) {
          const resolved = statReaderForActor(syncedMatch.data, binding)
          if (resolved.reader) {
            candidates.push({
              ...readerFor(syncedMatch.data),
              source: `roomSyncedSheets → ${resolved.source} [${kindLabel}]`,
            })
          }
        }
      }

      if (!candidates.length) {
        return this.withCachedReader(binding, {
          reader: null,
          owner: null,
          source: `ficha ${binding.sheetId} não está no PilotStore(${pilotCount} pilotos), no PilotSheetStore(${sheets.length} fichas) nem no NpcStore(${npcCount} npcs)`,
        })
      }

      // A escolha é por PONTUAÇÃO (quantos stats a fonte tem preenchidos), não por
      // ordem nem por "tem algum valor": o mecha do Hangar pode ter PV e estrutura e
      // zero de estresse, e venceria a ficha do modo ativo — que é quem passou por
      // `SetStats()`. Empate fica com a primeira da ordem de prioridade.
      const scored = candidates.map(candidate => ({
        ...candidate,
        score: scoreTrackerValues(readTrackerValuesFromStats(candidate.reader)),
      }))
      const bestScore = Math.max(...scored.map(candidate => candidate.score))
      const best = scored.find(candidate => candidate.score === bestScore) ?? scored[0]

      const overview = scored
        .map(candidate =>
          candidate === best
            ? `✔ ${candidate.source} (${candidate.score})`
            : `${candidate.source}=${candidate.score}`
        )
        .join(' | ')
      tokenTrackerTrace('resolve', `disputa de fontes para ${summarizeBinding(binding)}`, {
        candidatos: scored.map(candidate => `${candidate.source}=${candidate.score}`),
        escolhida: best.source,
        pontuacao: best.score,
      })

      if (best.score > 0) {
        this.rememberReader(binding, {
          reader: best.reader,
          owner: best.owner,
          source: `(${best.score}) ${best.source}`,
        })
        return { reader: best.reader, owner: best.owner, source: overview }
      }

      return this.withCachedReader(binding, {
        reader: best.reader,
        owner: best.owner,
        source: `${overview} (nenhuma fonte tinha valores)`,
      })
    } catch (err) {
      tokenTrackerWarn('resolve', 'falha ao resolver a ficha local', err)
      return { reader: null, owner: null, source: `erro: ${String(err)}` }
    }
  }

  /**
   * Último controlador BOM visto para este vínculo, por vínculo.
   *
   * Existe porque os stores desta janela podem ser esvaziados no meio do jogo: o
   * sync da sala (`syncFromRoom`/`LoadPilots`/`LoadPilotSheets`) substitui as listas
   * e, se chegar vazia, a ficha resolvida um instante antes some — o painel piscava
   * de "com valores" para "0/0". Guardar a REFERÊNCIA do controlador certo (não os
   * números) faz o painel continuar lendo o mesmo objeto vivo da ficha.
   *
   * O cache guarda a PONTUAÇÃO junto: uma fonte mais completa (ficha do modo ativo)
   * nunca é trocada por uma parcial (mecha do Hangar) só porque a parcial apareceu
   * depois.
   */
  private resolvedReaders = new Map<
    string,
    { reader: TokenTrackerStatReader; owner: unknown; source: string; score: number }
  >()

  private bindingKey(binding: TokenTrackerBinding): string {
    return `${binding.sheetType ?? '?'}|${binding.sheetId}|${binding.mechId ?? '-'}`
  }

  private rememberReader(
    binding: TokenTrackerBinding,
    resolved: { reader: TokenTrackerStatReader | null; owner: unknown; source: string }
  ): void {
    if (!resolved.reader) return
    const key = this.bindingKey(binding)
    const score = scoreTrackerValues(readTrackerValuesFromStats(resolved.reader))
    const previous = this.resolvedReaders.get(key)
    // Um controlador mais completo nunca é trocado por um parcial que apareceu
    // depois (o mecha do Hangar tem os máximos pela metade).
    if (previous && previous.score > score) return
    this.resolvedReaders.set(key, {
      reader: resolved.reader,
      owner: resolved.owner,
      source: resolved.source,
      score,
    })
  }

  /** Usa o controlador memorizado quando a resolução fresca não achou valores. */
  private withCachedReader(
    binding: TokenTrackerBinding,
    fallback: { reader: TokenTrackerStatReader | null; owner: unknown; source: string }
  ): { reader: TokenTrackerStatReader | null; owner: unknown; source: string } {
    const cached = this.resolvedReaders.get(this.bindingKey(binding))
    if (!cached) return fallback

    const freshScore = scoreTrackerValues(readTrackerValuesFromStats(fallback.reader))
    if (cached.score > freshScore) {
      tokenTrackerLog(
        'resolve',
        'usando o controlador memorizado (as fontes desta janela esvaziaram)',
        { fonteMemorizada: cached.source, pontuacaoAtual: freshScore, pontuacaoMemorizada: cached.score }
      )
      return {
        reader: cached.reader,
        owner: cached.owner,
        source: `memorizado (${cached.source}) porque as fontes atuais têm ${freshScore} contra ${cached.score}`,
      }
    }

    return fallback
  }

  /** A ficha do modo ativo aberta nesta janela (é onde os valores de combate vivem). */
  private activePilotSheet(): any | null {
    try {
      return this.stores?.activeSheet?.() ?? null
    } catch {
      return null
    }
  }

  private sideFromLocalSnapshot(binding: TokenTrackerBinding): TokenTrackerSide | 'unknown' {
    try {
      const cards = this.trackerSyncCardList()
      return sideFromCards(cards, binding)
    } catch {
      return 'unknown'
    }
  }

  // Importações dinâmicas: os stores arrastam meio app, e este serviço é carregado
  // junto do bridge no boot.
  private pilotStore(): any {
    return this.stores?.pilot?.() ?? null
  }

  private npcStore(): any {
    return this.stores?.npc?.() ?? null
  }

  private trackerSyncCardList(): unknown[] {
    return this.stores?.cards?.() ?? []
  }

  private pilotSheets(): any[] {
    try {
      return this.stores?.sheets?.() ?? []
    } catch {
      return []
    }
  }

  /** O STORE de fichas (não a lista): é ele que sabe recarregar do armazenamento. */
  private pilotSheetStore(): any {
    try {
      return this.stores?.sheetsStore?.() ?? null
    } catch {
      return null
    }
  }

  /** Injetado no boot por `useTokenTrackerBridge` (mantém os specs leves). */
  public setStoreAccessors(accessors: {
    pilot: () => any
    npc: () => any
    cards: () => unknown[]
    sheets?: () => any[]
    /** A ficha do modo ativo aberta nesta janela. */
    activeSheet?: () => any
    /** O store de fichas, dono do `LoadPilotSheets()`. */
    sheetsStore?: () => any
    /** Fichas sincronizadas via WebSocket Go da sala. */
    syncedSheets?: () => Record<string, any>
  }): void {
    this.stores = accessors
  }

  private stores: {
    pilot: () => any
    npc: () => any
    cards: () => unknown[]
    sheets?: () => any[]
    activeSheet?: () => any
    sheetsStore?: () => any
    syncedSheets?: () => Record<string, any>
  } | null = null

  private syncedSheets(): Record<string, any> | null {
    try {
      return this.stores?.syncedSheets?.() ?? null
    } catch {
      return null
    }
  }

  /** Ids da ficha desta janela (o jogador escreve resumo só da própria). */
  public setOwnSheetIdsResolver(resolver: () => string[]): void {
    this.ownSheetIdsResolver = resolver
  }

  private ownSheetIdsResolver: (() => string[]) | null = null

  private ownSheetIds(): string[] {
    try {
      return this.ownSheetIdsResolver?.() ?? []
    } catch {
      return []
    }
  }

  /** Ids da ficha desta janela (diagnóstico e eleição de escritor do resumo). */
  public getOwnSheetIds(): string[] {
    return this.ownSheetIds()
  }

  /////////////////////////////////////////////////////////////////////
  // Resumo no metadata do token (§7.6)
  /////////////////////////////////////////////////////////////////////

  private queueSummaryIfWriter(
    tokenId: string,
    binding: TokenTrackerBinding,
    localValues: TokenTrackerValues,
    rank: number
  ): void {
    
    const ownSheetIds = this.ownSheetIds()
    const writer = summaryWriterId(
      this.role,
      rank === 2 ? 'encounter' : 'sheet',
      OBR.player.id || ''
    )
    const allowed = shouldWriteSummary({
      role: this.role,
      ownSheetIds,
      binding,
      config: this.config,
    })
    if (!allowed || Object.keys(localValues).length === 0) {
      tokenTrackerTrace('resumo', `token ${tokenId}: esta janela não grava o resumo`, {
        papel: this.role,
        trackersLigados: this.config.enabled,
        fonteEscolhida: allowed,
        valores: summarizeValues(localValues),
      })
      return
    }
    tokenTrackerTrace('resumo', `token ${tokenId}: agendado para gravar (${writer})`, {
      valores: summarizeValues(localValues),
    })
    this.pendingSummaries.set(tokenId, { values: localValues, writer })
    if (this.summaryTimer) return
    this.summaryTimer = setTimeout(() => {
      this.summaryTimer = null
      void this.flushSummaries()
    }, TOKEN_TRACKER_SUMMARY_DEBOUNCE_MS)
  }

  private writerId(): string {
    // Id curto e estável desta janela: só serve para desempatar corrida no resumo.
    return `p-${(OBR.player.id || 'local').slice(0, 8)}`
  }

  private async flushSummaries(): Promise<void> {
    if (this.pendingSummaries.size === 0) return
    const queue = [...this.pendingSummaries.entries()]
    this.pendingSummaries.clear()

    const now = Date.now()
    const tokens = await OBR.scene.items
      .getItems(queue.map(([tokenId]) => tokenId))
      .catch(() => [] as Item[])

    const byId = new Map<string, TokenTrackerSummary>()
    for (const [tokenId, entry] of queue) {
      const token = tokens.find(item => item.id === tokenId)
      if (!token) {
        continue
      }
      const next = valuesToSummary(entry.values, entry.writer, now)
      const prev = sanitizeTokenTrackerSummary(token.metadata?.[TOKEN_TRACKER_SUMMARY_KEY])
      // Sem isso, cada gravação muda o token, dispara onChange e um novo refresh (loop).
      if (!shouldPublishSummary(prev, next, now)) continue
      byId.set(tokenId, next)
    }

    if (byId.size === 0) return

    await OBR.scene.items
      .updateItems([...byId.keys()], items => {
        for (const item of items) {
          const summary = byId.get(item.id)
          if (summary) item.metadata[TOKEN_TRACKER_SUMMARY_KEY] = summary as unknown as Metadata
        }
      })
      .catch(err => {
        console.warn('[TokenTracker] Falha ao gravar o resumo do token:', err)
      })
  }

  /** Força a gravação pendente (usado no fim de um refresh completo). */
  public async flushSummariesNow(): Promise<void> {
    if (this.summaryTimer) {
      clearTimeout(this.summaryTimer)
      this.summaryTimer = null
    }
    await this.flushSummaries()
  }

  /** Remove o resumo do token (desvínculo, trackers desligados). */
  public async clearSummary(tokenId: string): Promise<void> {
    await OBR.scene.items
      .updateItems([tokenId], items => {
        for (const item of items) {
          delete item.metadata[TOKEN_TRACKER_SUMMARY_KEY]
        }
      })
      .catch(() => {})
  }
}

/** Evento de janela que anuncia mudança de estado de combate (plano §7.2). */
export const TOKEN_TRACKER_STATE_EVENT = 'compcon-token-trackers-changed'

export const tokenTrackerService = new TokenTrackerService()

/**
 * Identifica o dono do `CombatController` no log: `Mech id=…`, `Pilot id=…` ou o tipo
 * cru quando é um objeto sem constructor claro (o caso de uma cópia deserializada).
 */
function describeOwner(owner: unknown): string {
  if (!owner || typeof owner !== 'object') return String(owner ?? 'nenhum')
  const participant = owner as { ID?: unknown; Name?: unknown; constructor?: { name?: string } }
  const kind = participant.constructor?.name ?? 'objeto'
  const id = typeof participant.ID === 'string' ? participant.ID : 'sem-id'
  const name = typeof participant.Name === 'string' && participant.Name ? ` "${participant.Name}"` : ''
  return `${kind} id=${id}${name}`
}
