import OBR, { type Item, type Metadata } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'
import { COMPCON_METADATA_KEY } from '@/types/compcon-obr'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  LANCER_TOKEN_TRACKER_SLOTS,
  TOKEN_TRACKER_ITEM_SLOT_KEY,
  TOKEN_TRACKER_LOCAL_PREFS_ID,
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
import { layoutTokenTrackers } from '@/services/tokenTrackerLayout'
import { buildTokenTrackerItems, isTokenTrackerItem } from '@/services/tokenTrackerRender'
import {
  isTokenTracked,
  loadLocalPrefs,
  pruneWatchlist,
  saveLocalPrefs,
} from '@/services/tokenTrackerWatchlist'
import { i18n } from '@/i18n'

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

export interface TokenTrackerSource {
  /** Encontro ativo desta janela (só o GM tem). */
  instance: any | null
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

    this.prefs = await loadLocalPrefs()
    await this.reloadConfig()

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
      this.unsubscribes.push(() => window.removeEventListener(TOKEN_TRACKER_STATE_EVENT, listener))
    }

    if (await OBR.scene.isReady().catch(() => false)) {
      await this.refreshAll()
    }
  }

  /** Desliga o serviço (testes/desmontagem). */
  public stop(): void {
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
        console.warn(`[TokenTracker] Falha ao atualizar o token ${tokenId}:`, err)
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
   * `Pilots`/`Npcs` vazios, a ficha não é encontrada e o painel aparece vazio —
   * que é justamente a queixa mais provável de "sincronização com a ficha".
   */
  private async ensureLocalStoresLoaded(): Promise<void> {
    if (this.storesLoadAttempted) return
    this.storesLoadAttempted = true
    try {
      const pilotStore = this.pilotStore()
      const npcStore = this.npcStore()

      if (pilotStore && (pilotStore.Pilots?.length ?? 0) === 0 && typeof pilotStore.LoadPilots === 'function') {
        await pilotStore.LoadPilots()
      }
      if (npcStore && (npcStore.Npcs?.length ?? 0) === 0 && typeof npcStore.LoadNpcs === 'function') {
        await npcStore.LoadNpcs()
      }
    } catch (err) {
      console.warn('[TokenTracker] Falha ao carregar os rosters locais:', err)
    }
  }

  private storesLoadAttempted = false

  /** Redesenha só os tokens que apontam para uma ficha (chamado quando ela muda). */
  public async refreshTokensForSheet(sheetId: string): Promise<void> {
    const tokens = await this.getBoundTokens()
    for (const token of tokens) {
      const binding = bindingFromMetadata(token.metadata[COMPCON_METADATA_KEY])
      if (!binding) continue
      if (binding.sheetId === sheetId || binding.mechId === sheetId) {
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
      await this.clearItems(tokenId)
      this.signatures.delete(tokenId)
      return
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

    const tracked = isTokenTracked({
      tokenId,
      hasValues: merged.hasValues,
      prefs: this.getPrefs(),
    })

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
      await this.clearItems(tokenId)
      this.signatures.delete(tokenId)
      return
    }

    const bounds = await OBR.scene.items.getItemBounds([tokenId]).catch(() => null)
    if (!bounds) {
      await this.clearItems(tokenId)
      return
    }

    const { commands } = layoutTokenTrackers({
      bounds,
      values: merged.values,
      config: this.config,
    })

    const signature = [
      buildTrackerSignature(merged.values, this.config),
      [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].join(','),
    ].join('|')

    if (this.signatures.get(tokenId) === signature) return
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

  /** Aplica a diferença entre o que existe no token e o que deveria existir. */
  private async syncItems(tokenId: string, wanted: Item[]): Promise<void> {
    const existing = await OBR.scene.local.getItemAttachments([tokenId]).catch(() => [] as Item[])
    const ours = existing.filter(isTokenTrackerItem)
    const desiredById = new Map(wanted.map(item => [item.id, item]))
    const existingIds = new Set(ours.map(item => item.id))

    const toDelete = ours.filter(item => !desiredById.has(item.id)).map(item => item.id)
    const toUpdate = ours.filter(item => desiredById.has(item.id)).map(item => item.id)
    const toAdd = wanted.filter(item => !existingIds.has(item.id))

    if (toDelete.length) {
      await OBR.scene.local.deleteItems(toDelete).catch(err => {
        console.warn('[TokenTracker] Falha ao remover itens do painel:', err)
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
          console.warn('[TokenTracker] Falha ao atualizar itens do painel:', err)
        })
    }

    if (toAdd.length) {
      await OBR.scene.local.addItems(toAdd).catch(err => {
        console.warn('[TokenTracker] Falha ao criar itens do painel:', err)
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
        side: normalizeSide(storedCombatant.side),
        hiddenFromPlayers: storedCombatant.hiddenFromPlayers === true,
        readerSource: `encontro "${encounterName}" lido do storage → ${resolved.source}`,
        rank: 2,
      }
    }

    const local = this.readerFromLocalStores(binding)
    return {
      reader: local.reader,
      side: this.sideFromLocalSnapshot(binding),
      hiddenFromPlayers: false,
      readerSource: local.source,
      // Ficha do modo ativo / stores locais: é o estado FORA do combate. Se o
      // encontro ativo existir em outra janela, o resumo do token é mais confiável.
      rank: 1,
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
      console.warn('[TokenTracker] Falha ao ler os encontros ativos do storage:', err)
      this.storedEncountersCache = { at: now, instances: [] }
      return []
    }
  }

  /** Descarta o cache dos encontros (fim de refresh / encontros recarregados). */
  private invalidateStoredEncounters(): void {
    this.storedEncountersCache = null
  }

  /** Ficha local desta janela (o jogador tem a própria; o GM tem todas que foram sincronizadas). */
  private readerFromLocalStores(binding: TokenTrackerBinding): {
    reader: TokenTrackerStatReader | null
    source: string
  } {
    try {
      const pilotStore = this.pilotStore()
      const npcStore = this.npcStore()
      const sheets = this.pilotSheets()
      const activeSheet = this.activePilotSheet()
      const kind = sheetKindForBinding(binding)

      if (!pilotStore && !npcStore) {
        return { reader: null, source: 'sem acesso aos stores (setStoreAccessors não foi chamado)' }
      }

      const npcCount = npcStore?.Npcs?.length ?? 0
      const pilotCount = pilotStore?.Pilots?.length ?? 0
      const kindLabel = kind === 'npc' ? 'ficha de NPC' : kind === 'mech' ? 'ficha de MECHA' : 'ficha de PILOTO (a pé)'

      // Candidatos em ordem de prioridade, e do TIPO certo: vínculo com `mechId` lê o
      // MECHA (`ActiveMech`/`Mechs[mechId]`), vínculo sem ele lê o PRÓPRIO piloto.
      // Nunca misturar: o StatController do piloto não tem calor/estrutura/estresse de
      // mecha, e o mecha do Hangar pode estar com os máximos pela metade.
      const candidates: Array<{ reader: TokenTrackerStatReader | null; source: string }> = []
      const readerFor = (actor: unknown): TokenTrackerStatReader | null =>
        kind === 'mech' ? statReaderForActor(actor, binding).reader : statReaderOf(actor)

      if (kind === 'npc') {
        const npc = npcStore?.getNpcByID?.(binding.sheetId)
        if (npc) {
          candidates.push({ reader: readerFor(npc), source: `NpcStore(${npcCount} npcs) por sheetId` })
        }
      } else {
        if (activeSheet && sheetMatchesBinding(activeSheet, binding)) {
          candidates.push({
            reader: readerFor(activeSheet?.Pilot ?? activeSheet?.Combatant?.actor),
            source: `ficha ATIVA desta janela [${kindLabel}]`,
          })
        }

        const sheet = sheets.find((candidate: any) => sheetMatchesBinding(candidate, binding))
        if (sheet) {
          candidates.push({
            reader: readerFor(sheet?.Pilot ?? sheet?.Combatant?.actor),
            source: `PilotSheetStore(${sheets.length} fichas) [${kindLabel}]`,
          })
        }

        const pilot = pilotStore?.getPilotByID?.(binding.sheetId)
        if (pilot) {
          const resolved = statReaderForActor(pilot, binding)
          candidates.push({
            reader: readerFor(pilot),
            source:
              kind === 'mech'
                ? `PilotStore(${pilotCount} pilotos) → ${resolved.source} [${kindLabel}]`
                : `PilotStore(${pilotCount} pilotos) [${kindLabel}]`,
          })
        }
      }

      const npc = npcStore?.getNpcByID?.(binding.sheetId)
      if (npc) {
        candidates.push({ reader: readerFor(npc), source: `NpcStore(${npcCount} npcs) por fallback` })
      }

      if (!candidates.length) {
        return this.withCachedReader(binding, {
          reader: null,
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

      if (best.score > 0) {
        this.rememberReader(binding, { reader: best.reader, source: `(${best.score}) ${best.source}` })
        return { reader: best.reader, source: overview }
      }

      return this.withCachedReader(binding, {
        reader: best.reader,
        source: `${overview} (nenhuma fonte tinha valores)`,
      })
    } catch (err) {
      console.warn('[TokenTracker] Falha ao resolver a ficha local:', err)
      return { reader: null, source: `erro: ${String(err)}` }
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
    { reader: TokenTrackerStatReader; source: string; score: number }
  >()

  private bindingKey(binding: TokenTrackerBinding): string {
    return `${binding.sheetType ?? '?'}|${binding.sheetId}|${binding.mechId ?? '-'}`
  }

  private rememberReader(
    binding: TokenTrackerBinding,
    resolved: { reader: TokenTrackerStatReader | null; source: string }
  ): void {
    if (!resolved.reader) return
    const key = this.bindingKey(binding)
    const score = scoreTrackerValues(readTrackerValuesFromStats(resolved.reader))
    const previous = this.resolvedReaders.get(key)
    // Um controlador mais completo nunca é trocado por um parcial que apareceu
    // depois (o mecha do Hangar tem os máximos pela metade).
    if (previous && previous.score > score) return
    this.resolvedReaders.set(key, { reader: resolved.reader, source: resolved.source, score })
  }

  /** Usa o controlador memorizado quando a resolução fresca não achou valores. */
  private withCachedReader(
    binding: TokenTrackerBinding,
    fallback: { reader: TokenTrackerStatReader | null; source: string }
  ): { reader: TokenTrackerStatReader | null; source: string } {
    const cached = this.resolvedReaders.get(this.bindingKey(binding))
    if (!cached) return fallback

    const freshScore = scoreTrackerValues(readTrackerValuesFromStats(fallback.reader))
    if (cached.score > freshScore) {
      return {
        reader: cached.reader,
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

  /** Injetado no boot por `useTokenTrackerBridge` (mantém os specs leves). */
  public setStoreAccessors(accessors: {
    pilot: () => any
    npc: () => any
    cards: () => unknown[]
    sheets?: () => any[]
    /** A ficha do modo ativo aberta nesta janela. */
    activeSheet?: () => any
  }): void {
    this.stores = accessors
  }

  private stores: {
    pilot: () => any
    npc: () => any
    cards: () => unknown[]
    sheets?: () => any[]
    activeSheet?: () => any
  } | null = null

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
    if (!allowed || Object.keys(localValues).length === 0) return
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
