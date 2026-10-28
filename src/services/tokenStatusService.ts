import OBR, { type Item } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'
import { COMPCON_METADATA_KEY, type TokenSheetBinding as CompconTokenMetadata } from '@/types/compcon-obr'
import {
  sortStatusMarkers,
  toggleStatus,
  setCover,
  normalizeStatusId,
  parseCustomStatusMarkerId,
  parseBurnMarkerId,
  burnStatusMarkerId,
} from './statusIcons'
import { statusMarkerService } from './statusMarkerService'
import { isSheetReadOnlySession } from './sheetReadOnlySession'
import { tableSyncSocket, roomSyncedSheets } from './tableSyncSocket'
import {
  activeMechIndex,
  mechBracedPath,
  mechCoverPath,
  mechCustomStatusesPath,
  mechStatsPath,
  mechStatusesPath,
} from './sheetSyncPaths'

export const TOKEN_STATUS_METADATA_KEY = 'com.compcon.status_markers/active'
export const LEGACY_TOKEN_STATUS_METADATA_KEY = 'com.lancer.status_markers/active'

export interface TokenStatusItemMetadata {
  v: 1
  statuses: string[]
  updatedAt: number
  updatedBy?: string
}

export interface SelectedTokenInfo {
  id: string
  name: string
  statuses: string[]
  isBoundToSheet: boolean
  sheetType?: 'pilot' | 'npc'
  sheetId?: string
  actorName?: string
}

class TokenStatusService {
  public readonly isReady = ref(false)
  public readonly selectedTokens = ref<SelectedTokenInfo[]>([])
  public readonly statusDialogOpen = ref(false)

  private initialized = false
  private lastSyncedSignatures = new Map<string, string>()
  private lastSyncedBounds = new Map<string, string>()

  public init(): void {
    if (this.initialized) return
    this.initialized = true

    if (typeof window !== 'undefined') {
      window.addEventListener('compcon-combatant-statuses-changed', (e: Event) => {
        const detail = (e as CustomEvent).detail
        if (detail?.combatantId && Array.isArray(detail?.statuses)) {
          void this.onCombatantStatusesChanged(detail.combatantId, detail.statuses)
        }
      })
      window.addEventListener('compcon-patch-field', () => {
        void this.refreshSelectedTokens()
      })
      window.addEventListener('compcon-sync-full-sheet', () => {
        void this.refreshSelectedTokens()
      })
    }

    if (!OBR.isAvailable) return

    OBR.onReady(async () => {
      this.isReady.value = true
      await this.refreshSelectedTokens()

      OBR.player.onChange(async () => {
        await this.refreshSelectedTokens()
      })

      OBR.scene.items.onChange(async items => {
        await this.onSceneItemsChanged(items)
        await this.refreshSelectedTokens(items)
      })
    })
  }

  public isSelectableTokenItem(item: Item): boolean {
    if (!item) return false
    if (item.id.startsWith('cc_st_') || item.id.startsWith('ls_st_')) return false
    if (
      item.metadata?.['com.compcon.status_markers/marker'] ||
      item.metadata?.['com.lancer.status_markers/marker'] ||
      item.metadata?.['com.compcon.activemode/tracker_slot']
    ) {
      return false
    }
    return true
  }

  /**
   * Resolve todos os CombatControllers locais vinculados a um token (Encontro Ativo,
   * PilotSheetStore, PilotStore e NpcStore).
   */
  public async resolveBoundControllers(meta: CompconTokenMetadata): Promise<{
    controllers: any[]
    primaryController: any | null
    characterId: string
    characterType: 'pilot' | 'npc'
    mechIndex: number
    actorName?: string
    saveCallbacks: Array<() => void>
  }> {
    const controllers: any[] = []
    const saveCallbacks: Array<() => void> = []
    const sheetId = meta.sheetId || ''
    const mechId = meta.mechId || ''
    const combatantId = meta.combatantId || ''
    const characterType: 'pilot' | 'npc' = meta.sheetType === 'npc' ? 'npc' : 'pilot'
    let characterId = sheetId
    let mechIndex = -1
    let actorName: string | undefined

    const addController = (cc: any) => {
      if (cc && !controllers.includes(cc)) {
        controllers.push(cc)
      }
    }

    const matchesId = (id: string | undefined | null) =>
      Boolean(id && (id === sheetId || id === mechId || id === combatantId))

    try {
      const { EncounterStore } = await import('@/stores')
      const encStore = EncounterStore()
      const activeEnc = encStore.getActiveEncounter(encStore.CurrentActiveID)
      if (activeEnc && Array.isArray(activeEnc.Combatants)) {
        const combatant = activeEnc.Combatants.find(
          (c: any) =>
            matchesId(c?.id) ||
            matchesId(c?.actor?.ID) ||
            matchesId(c?.actor?.OriginId) ||
            matchesId(c?.actor?.ActiveMech?.ID)
        )
        if (combatant?.actor) {
          const actor = combatant.actor
          actorName = actor.Callsign || actor.Name || actorName
          if (actor.ID && characterType === 'pilot') characterId = actor.ID
          if (actor.ActiveMech?.CombatController) {
            addController(actor.ActiveMech.CombatController)
            if (mechIndex < 0) mechIndex = activeMechIndex(actor)
          }
          if (actor.CombatController) {
            addController(actor.CombatController)
          }
          saveCallbacks.push(() => {
            void activeEnc.Save?.()
          })
        }
      }
    } catch {}

    if (characterType === 'pilot') {
      try {
        const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
        const sheetStore = PilotSheetStore()
        const sheets = (sheetStore.PilotSheets as any[]) || []
        const matchedSheet = sheets.find(
          (ps: any) =>
            !ps?.SaveController?.IsDeleted &&
            (matchesId(ps?.ID) ||
              matchesId(ps?.PilotID) ||
              matchesId(ps?.Pilot?.ID) ||
              matchesId(ps?.Pilot?.ActiveMech?.ID))
        )
        if (matchedSheet?.Pilot) {
          const p = matchedSheet.Pilot
          actorName = p.Callsign || p.Name || actorName
          if (p.ID) characterId = p.ID
          if (mechIndex < 0) mechIndex = activeMechIndex(p)
          if (p.ActiveMech?.CombatController) {
            addController(p.ActiveMech.CombatController)
          } else if (p.CombatController) {
            addController(p.CombatController)
          }
          saveCallbacks.push(() => {
            matchedSheet.Save?.()
          })
        }
      } catch {}

      try {
        const { PilotStore } = await import('@/features/pilot_management/store')
        const pilotStore = PilotStore()
        const pilots = (pilotStore.Pilots as any[]) || []
        const matchedPilot = pilots.find(
          (p: any) =>
            matchesId(p?.ID) ||
            matchesId(p?.OriginId) ||
            matchesId(p?.ActiveMech?.ID) ||
            (Array.isArray(p?.Mechs) && p.Mechs.some((m: any) => matchesId(m?.ID)))
        )
        if (matchedPilot) {
          actorName = matchedPilot.Callsign || matchedPilot.Name || actorName
          if (matchedPilot.ID) characterId = matchedPilot.ID
          if (mechIndex < 0) mechIndex = activeMechIndex(matchedPilot)
          if (matchedPilot.ActiveMech?.CombatController) {
            addController(matchedPilot.ActiveMech.CombatController)
          } else if (matchedPilot.CombatController) {
            addController(matchedPilot.CombatController)
          }
        }
      } catch {}
    } else {
      try {
        const { NpcStore } = await import('@/stores')
        const npcStore = NpcStore()
        const npcs = (npcStore.Npcs as any[]) || []
        const matchedNpc = npcs.find(
          (n: any) => matchesId(n?.ID) || matchesId(n?.OriginId)
        )
        if (matchedNpc?.CombatController) {
          actorName = matchedNpc.Name || actorName
          if (matchedNpc.ID) characterId = matchedNpc.ID
          addController(matchedNpc.CombatController)
          saveCallbacks.push(() => {
            void matchedNpc.Save?.()
          })
        }
      } catch {}
    }

    return {
      controllers,
      primaryController: controllers[0] ?? null,
      characterId: characterId || sheetId,
      characterType,
      mechIndex,
      actorName,
      saveCallbacks,
    }
  }

  /**
   * Extrai os marcadores de status a partir do JSON sincronizado da sala (`roomSyncedSheets`),
   * usado como fallback quando a ficha não está instanciada nos stores locais desta janela.
   */
  private extractStatusesFromRoomData(meta: CompconTokenMetadata): string[] | null {
    const sheetEntry = roomSyncedSheets.value?.[meta.sheetId]
    const data = sheetEntry?.data
    if (!data || typeof data !== 'object') return null

    let combatNode: any = data
    if (meta.sheetType === 'pilot' && Array.isArray(data.mechs) && data.mechs.length > 0) {
      combatNode =
        data.mechs.find((m: any) => m?.id === meta.mechId || m?.ID === meta.mechId) ||
        data.mechs[0]
    }
    if (!combatNode) return null

    const list: string[] = []
    if (Array.isArray(combatNode.statuses)) {
      for (const s of combatNode.statuses) {
        const id =
          s?.status?.ID ||
          s?.status?.id ||
          (typeof s?.status === 'string' ? s.status : null) ||
          (typeof s === 'string' ? s : null)
        if (id) list.push(String(id))
      }
    }
    if (combatNode.braced) list.push('braced')
    const burnVal = Number(combatNode.stats?.current?.burn ?? 0)
    if (burnVal > 0) list.push(burnStatusMarkerId(burnVal))
    if (combatNode.cover === 'soft') list.unshift('softcover')
    else if (combatNode.cover === 'hard') list.unshift('hardcover')
    if (Array.isArray(combatNode.customStatuses)) {
      for (const cs of combatNode.customStatuses) {
        const name = cs?.status?.attribute || cs?.status?.Attribute || (typeof cs?.status === 'string' ? cs.status : null)
        if (name && String(name).trim()) {
          list.push(`custom:${String(name).trim()}`)
        }
      }
    }
    return sortStatusMarkers(list)
  }

  public getItemMetadataStatuses(item: Item): string[] | null {
    const nativeMeta = item?.metadata?.[TOKEN_STATUS_METADATA_KEY] as TokenStatusItemMetadata | undefined
    if (nativeMeta && Array.isArray(nativeMeta.statuses)) {
      return sortStatusMarkers(nativeMeta.statuses)
    }
    const legacyMeta = item?.metadata?.[LEGACY_TOKEN_STATUS_METADATA_KEY] as TokenStatusItemMetadata | undefined
    if (legacyMeta && Array.isArray(legacyMeta.statuses)) {
      return sortStatusMarkers(legacyMeta.statuses)
    }
    return null
  }

  /**
   * Obtém a lista de status ativos de um item de token, priorizando a ficha vinculada
   * (se existir localmente) e caindo para o metadado do token.
   */
  public async resolveTokenStatuses(item: Item): Promise<{
    statuses: string[]
    isBoundToSheet: boolean
    sheetType?: 'pilot' | 'npc'
    sheetId?: string
    actorName?: string
  }> {
    const ccMeta = item?.metadata?.[COMPCON_METADATA_KEY] as CompconTokenMetadata | undefined
    if (ccMeta && ccMeta.sheetId) {
      const resolved = await this.resolveBoundControllers(ccMeta)
      if (resolved.primaryController?.StatusController?.MarkerStatusIds) {
        const fromController = sortStatusMarkers(
          resolved.primaryController.StatusController.MarkerStatusIds(resolved.primaryController)
        )
        return {
          statuses: fromController,
          isBoundToSheet: true,
          sheetType: ccMeta.sheetType,
          sheetId: resolved.characterId || ccMeta.sheetId,
          actorName: resolved.actorName,
        }
      }

      const fromTokenMeta = this.getItemMetadataStatuses(item)
      if (fromTokenMeta !== null) {
        return {
          statuses: fromTokenMeta,
          isBoundToSheet: true,
          sheetType: ccMeta.sheetType,
          sheetId: ccMeta.sheetId,
          actorName: resolved.actorName,
        }
      }

      const fromRoom = this.extractStatusesFromRoomData(ccMeta)
      if (fromRoom !== null) {
        return {
          statuses: fromRoom,
          isBoundToSheet: true,
          sheetType: ccMeta.sheetType,
          sheetId: ccMeta.sheetId,
          actorName: resolved.actorName,
        }
      }

      return {
        statuses: [],
        isBoundToSheet: true,
        sheetType: ccMeta.sheetType,
        sheetId: ccMeta.sheetId,
        actorName: resolved.actorName,
      }
    }

    return {
      statuses: this.getItemMetadataStatuses(item) ?? [],
      isBoundToSheet: false,
    }
  }

  public async getTokenStatuses(tokenId: string): Promise<string[]> {
    if (!OBR.isAvailable) return []
    try {
      const items = await OBR.scene.items.getItems([tokenId])
      if (!items.length) return []
      const res = await this.resolveTokenStatuses(items[0])
      return res.statuses
    } catch {
      return []
    }
  }

  public async selectContextItems(items: Item[]): Promise<void> {
    const validItems = (items || []).filter(i => this.isSelectableTokenItem(i))
    const infos: SelectedTokenInfo[] = []
    for (const item of validItems) {
      const resolved = await this.resolveTokenStatuses(item)
      const textObj = (item as any).text
      const plainName = textObj?.plainText?.trim() || item.name || 'Token'
      infos.push({
        id: item.id,
        name: resolved.actorName ? `${plainName} (${resolved.actorName})` : plainName,
        statuses: resolved.statuses,
        isBoundToSheet: resolved.isBoundToSheet,
        sheetType: resolved.sheetType,
        sheetId: resolved.sheetId,
        actorName: resolved.actorName,
      })
    }
    if (infos.length > 0) {
      this.selectedTokens.value = infos
    }
  }

  public async refreshSelectedTokens(sceneItems?: Item[]): Promise<void> {
    if (!OBR.isAvailable) return
    try {
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (!isSceneReady) {
        this.selectedTokens.value = []
        return
      }
      const selection = await OBR.player.getSelection()
      let targetIds = selection && selection.length > 0 ? selection : []
      if (targetIds.length === 0 && this.selectedTokens.value.length > 0) {
        targetIds = this.selectedTokens.value.map(t => t.id)
      }
      if (targetIds.length === 0) {
        this.selectedTokens.value = []
        return
      }
      const items = sceneItems
        ? sceneItems.filter(i => targetIds.includes(i.id))
        : await OBR.scene.items.getItems(targetIds)

      const validItems = items.filter(i => this.isSelectableTokenItem(i))
      const infos: SelectedTokenInfo[] = []
      for (const item of validItems) {
        const resolved = await this.resolveTokenStatuses(item)
        const textObj = (item as any).text
        const plainName = textObj?.plainText?.trim() || item.name || 'Token'
        infos.push({
          id: item.id,
          name: resolved.actorName ? `${plainName} (${resolved.actorName})` : plainName,
          statuses: resolved.statuses,
          isBoundToSheet: resolved.isBoundToSheet,
          sheetType: resolved.sheetType,
          sheetId: resolved.sheetId,
          actorName: resolved.actorName,
        })
      }
      this.selectedTokens.value = infos
    } catch (err) {
      console.warn('[TokenStatusService] Erro ao atualizar seleção de tokens:', err)
    }
  }

  /**
   * Propaga uma lista de marcadores de status para a ficha vinculada (local + mesa de sincronização)
   * garantindo ausência total de conflitos de versão ou ecos.
   */
  private async syncBoundSheetStatuses(
    meta: CompconTokenMetadata,
    cleanStatuses: string[]
  ): Promise<void> {
    if (isSheetReadOnlySession()) return

    const resolved = await this.resolveBoundControllers(meta)
    const { controllers, primaryController, characterId, characterType, mechIndex, saveCallbacks } =
      resolved

    // Captura estado anterior para enviar apenas deltas reais à mesa de sincronização
    const prevStatusesJson = primaryController?.StatusController?.SerializeStatuses
      ? JSON.stringify(primaryController.StatusController.SerializeStatuses())
      : undefined
    const prevCustomJson = primaryController?.StatusController?.SerializeCustomStatuses
      ? JSON.stringify(primaryController.StatusController.SerializeCustomStatuses())
      : undefined
    const prevCover = primaryController?.Cover
    const prevBraced = primaryController?.Braced
    const prevBurn = Number(primaryController?.StatController?.getCurrent?.('burn') ?? 0)

    // 1. Aplica nos CombatControllers locais
    for (const cc of controllers) {
      if (typeof cc?.StatusController?.ApplyMarkerStatusIds === 'function') {
        cc.StatusController.ApplyMarkerStatusIds(cleanStatuses)
      }
    }

    // Persiste nos stores locais (PilotSheet, EncounterInstance, Npc)
    for (const save of saveCallbacks) {
      try {
        save()
      } catch {}
    }

    // 2. Despacha PATCH_FIELD para a mesa de sincronização e alinha o PilotRunner local
    if (!characterId) return

    const nextVersion = (): number => {
      const currentVer = Number(roomSyncedSheets.value?.[characterId]?.version ?? 0)
      return Math.max(1, currentVer + 1)
    }

    const dispatchPatchAndAlign = (field: string, value: any) => {
      const version = nextVersion()
      tableSyncSocket.sendPatchField(characterId, characterType, field, value, version)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('compcon-patch-field', {
            detail: {
              characterId,
              characterType,
              field,
              value,
              version,
            },
          })
        )
      }
    }

    const isPilotMech = characterType === 'pilot' && mechIndex >= 0

    if (primaryController) {
      const nextStatuses = primaryController.StatusController?.SerializeStatuses?.() ?? []
      const nextStatusesJson = JSON.stringify(nextStatuses)
      if (nextStatusesJson !== prevStatusesJson) {
        const field = isPilotMech ? mechStatusesPath(mechIndex) : 'statuses'
        dispatchPatchAndAlign(field, nextStatuses)
      }

      const nextCustom = primaryController.StatusController?.SerializeCustomStatuses?.() ?? []
      const nextCustomJson = JSON.stringify(nextCustom)
      if (nextCustomJson !== prevCustomJson) {
        const field = isPilotMech ? mechCustomStatusesPath(mechIndex) : 'customStatuses'
        dispatchPatchAndAlign(field, nextCustom)
      }

      const nextCover = primaryController.Cover || 'none'
      if (nextCover !== prevCover) {
        const field = isPilotMech ? mechCoverPath(mechIndex) : 'cover'
        dispatchPatchAndAlign(field, nextCover)
      }

      const nextBraced = Boolean(primaryController.Braced)
      if (nextBraced !== Boolean(prevBraced)) {
        const field = isPilotMech ? mechBracedPath(mechIndex) : 'braced'
        dispatchPatchAndAlign(field, nextBraced)
      }

      const nextBurn = Number(primaryController.StatController?.getCurrent?.('burn') ?? 0)
      if (nextBurn !== prevBurn) {
        const field = isPilotMech ? mechStatsPath(mechIndex, 'burn') : 'stats.current.burn'
        dispatchPatchAndAlign(field, nextBurn)
      }
    } else if (roomSyncedSheets.value?.[characterId]) {
      // Caso a ficha esteja apenas na sala (ex.: GM editando token de jogador sem ficha aberta localmente)
      const standardStatuses: { status: string; expires: null; selfInflicted: boolean }[] = []
      const customStatuses: { status: { attribute: string; detail: string }; expires: string }[] = []
      let desiredCover: 'none' | 'soft' | 'hard' = 'none'
      let wantsBraced = false
      let desiredBurn = 0

      for (const raw of cleanStatuses) {
        const customName = parseCustomStatusMarkerId(raw)
        if (customName) {
          customStatuses.push({
            status: { attribute: customName, detail: '' },
            expires: '',
          })
          continue
        }
        const burnInfo = parseBurnMarkerId(raw)
        if (burnInfo !== null) {
          desiredBurn = Math.max(0, burnInfo.amount)
          continue
        }
        const norm = normalizeStatusId(raw)
        if (!norm) continue
        if (norm === 'hardcover') desiredCover = 'hard'
        else if (norm === 'softcover' && desiredCover !== 'hard') desiredCover = 'soft'
        else if (norm === 'braced') wantsBraced = true
        else if (norm === 'burn') desiredBurn = desiredBurn > 0 ? desiredBurn : 1
        else {
          standardStatuses.push({ status: norm, expires: null, selfInflicted: false })
        }
      }

      const mIdx = characterType === 'pilot' ? 0 : -1
      dispatchPatchAndAlign(mIdx >= 0 ? mechStatusesPath(mIdx) : 'statuses', standardStatuses)
      dispatchPatchAndAlign(mIdx >= 0 ? mechCustomStatusesPath(mIdx) : 'customStatuses', customStatuses)
      dispatchPatchAndAlign(mIdx >= 0 ? mechCoverPath(mIdx) : 'cover', desiredCover)
      dispatchPatchAndAlign(mIdx >= 0 ? mechBracedPath(mIdx) : 'braced', wantsBraced)
      dispatchPatchAndAlign(
        mIdx >= 0 ? mechStatsPath(mIdx, 'burn') : 'stats.current.burn',
        desiredBurn
      )
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: characterId } })
      )
    }
  }

  /**
   * Aplica uma lista de status em múltiplos tokens (atualizando metadados do token,
   * badges visuais e, se o token estiver vinculado a uma ficha, a ficha e a mesa de sync).
   */
  public async setTokensStatus(tokenIds: string[], statuses: string[]): Promise<void> {
    if (!tokenIds.length || isSheetReadOnlySession()) return
    const cleanStatuses = sortStatusMarkers(statuses)
    const sig = cleanStatuses.join('|')

    for (const id of tokenIds) {
      this.lastSyncedSignatures.set(id, sig)
    }

    let items: Item[] = []
    if (OBR.isAvailable) {
      try {
        const playerId = await OBR.player.getId().catch(() => undefined)
        const now = Date.now()
        items = await OBR.scene.items.getItems(tokenIds)

        await OBR.scene.items.updateItems(tokenIds, draftItems => {
          for (const item of draftItems) {
            const payload: TokenStatusItemMetadata = {
              v: 1,
              statuses: cleanStatuses,
              updatedAt: now,
              updatedBy: playerId,
            }
            item.metadata[TOKEN_STATUS_METADATA_KEY] = payload
            if (item.metadata[LEGACY_TOKEN_STATUS_METADATA_KEY] !== undefined) {
              item.metadata[LEGACY_TOKEN_STATUS_METADATA_KEY] = payload
            }
          }
        })
      } catch (err) {
        console.error('[TokenStatusService] Erro ao atualizar metadados de status do token:', err)
      }
    }

    await Promise.all(
      tokenIds.map(id => statusMarkerService.syncTokenStatusMarkers(id, cleanStatuses))
    )

    // Para cada token vinculado a uma ficha, sincroniza ficha local + mesa
    const processedSheets = new Set<string>()
    for (const item of items) {
      const ccMeta = item.metadata?.[COMPCON_METADATA_KEY] as CompconTokenMetadata | undefined
      if (ccMeta && ccMeta.sheetId) {
        const key = `${ccMeta.sheetType}:${ccMeta.sheetId}:${ccMeta.mechId || ''}`
        if (!processedSheets.has(key)) {
          processedSheets.add(key)
          await this.syncBoundSheetStatuses(ccMeta, cleanStatuses)
        }
      }
    }

    await this.refreshSelectedTokens()
  }

  /**
   * Alterna um status individual nos tokens informados.
   */
  public async toggleTokenStatus(tokenIds: string[], statusId: string): Promise<void> {
    if (!tokenIds.length || isSheetReadOnlySession()) return

    if (tokenIds.length === 1) {
      const current = await this.getTokenStatuses(tokenIds[0])
      const next = toggleStatus(current, statusId)
      await this.setTokensStatus(tokenIds, next)
      return
    }

    // Para múltiplos tokens: se todos já possuem o status, remove de todos; caso contrário, aplica em todos
    const statusLists = await Promise.all(tokenIds.map(id => this.getTokenStatuses(id)))
    const normTarget = parseCustomStatusMarkerId(statusId)
      ? statusId.trim()
      : normalizeStatusId(statusId) || statusId.trim()

    const allHave = statusLists.every(list =>
      list.some(s => (parseCustomStatusMarkerId(s) ? s.trim() : normalizeStatusId(s)) === normTarget)
    )

    for (let i = 0; i < tokenIds.length; i++) {
      const current = statusLists[i]
      const hasIt = current.some(
        s => (parseCustomStatusMarkerId(s) ? s.trim() : normalizeStatusId(s)) === normTarget
      )
      if (allHave && hasIt) {
        await this.setTokensStatus([tokenIds[i]], toggleStatus(current, statusId))
      } else if (!allHave && !hasIt) {
        await this.setTokensStatus([tokenIds[i]], toggleStatus(current, statusId))
      }
    }
  }

  /**
   * Define a cobertura nos tokens selecionados ('none' | 'softcover' | 'hardcover')
   */
  public async setTokensCover(
    tokenIds: string[],
    cover: 'none' | 'softcover' | 'hardcover'
  ): Promise<void> {
    if (!tokenIds.length || isSheetReadOnlySession()) return
    for (const tokenId of tokenIds) {
      const current = await this.getTokenStatuses(tokenId)
      const next = setCover(current, cover)
      await this.setTokensStatus([tokenId], next)
    }
  }

  /**
   * Limpa todos os status dos tokens informados.
   */
  public async clearTokensStatus(tokenIds: string[]): Promise<void> {
    if (!tokenIds.length || isSheetReadOnlySession()) return
    await this.setTokensStatus(tokenIds, [])
  }

  /**
   * Quando um status muda na ficha (StatusController.NotifyStatusChange),
   * sincroniza o metadado do token para que jogadores sem a ficha aberta e o menu de token
   * enxerguem exatamente o mesmo estado.
   */
  private async onCombatantStatusesChanged(
    combatantId: string,
    rawStatuses: string[]
  ): Promise<void> {
    if (!OBR.isAvailable || isSheetReadOnlySession()) return
    try {
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (!isSceneReady) return

      const cleanStatuses = sortStatusMarkers(rawStatuses)
      const sig = cleanStatuses.join('|')

      const items = await OBR.scene.items.getItems(item => {
        const meta = item.metadata?.[COMPCON_METADATA_KEY] as CompconTokenMetadata | undefined
        if (!meta) return false
        return (
          meta.sheetId === combatantId ||
          meta.mechId === combatantId ||
          meta.combatantId === combatantId
        )
      })

      if (!items.length) return

      const toUpdateIds: string[] = []
      for (const item of items) {
        const currentMetaStatuses = this.getItemMetadataStatuses(item)
        const currentSig = currentMetaStatuses ? currentMetaStatuses.join('|') : ''
        this.lastSyncedSignatures.set(item.id, sig)
        if (currentSig !== sig) {
          toUpdateIds.push(item.id)
        }
      }

      if (toUpdateIds.length > 0) {
        const now = Date.now()
        await OBR.scene.items.updateItems(toUpdateIds, draftItems => {
          for (const draft of draftItems) {
            draft.metadata[TOKEN_STATUS_METADATA_KEY] = {
              v: 1,
              statuses: cleanStatuses,
              updatedAt: now,
            }
          }
        })
      }

      await this.refreshSelectedTokens()
    } catch (err) {
      console.warn('[TokenStatusService] Erro ao espelhar status da ficha no metadado do token:', err)
    }
  }

  /**
   * Observa mudanças nos itens da cena (ex.: outro jogador alterou o status de um token
   * ou redimensionou o token) e reconcilia os marcadores visuais e a ficha local.
   */
  private async onSceneItemsChanged(items: Item[]): Promise<void> {
    if (isSheetReadOnlySession()) return

    for (const item of items) {
      if (item.id.startsWith('cc_st_') || item.id.startsWith('ls_st_')) continue

      const metaStatuses = this.getItemMetadataStatuses(item)
      const ccMeta = item.metadata?.[COMPCON_METADATA_KEY] as CompconTokenMetadata | undefined

      if (metaStatuses !== null) {
        const sig = metaStatuses.join('|')
        const boundsKey = `${Math.round(item.position.x)},${Math.round(item.position.y)},${item.scale.x.toFixed(2)},${item.scale.y.toFixed(2)}`
        const prevSig = this.lastSyncedSignatures.get(item.id)
        const prevBounds = this.lastSyncedBounds.get(item.id)

        if (prevSig !== sig || prevBounds !== boundsKey) {
          this.lastSyncedSignatures.set(item.id, sig)
          this.lastSyncedBounds.set(item.id, boundsKey)
          void statusMarkerService.syncTokenStatusMarkers(item.id, metaStatuses)

          // Se a mudança veio de outro cliente no metadado de um token vinculado a uma ficha local:
          if (prevSig !== sig && ccMeta?.sheetId) {
            const resolved = await this.resolveBoundControllers(ccMeta)
            for (const cc of resolved.controllers) {
              if (typeof cc?.StatusController?.ApplyMarkerStatusIds === 'function') {
                cc.StatusController.ApplyMarkerStatusIds(metaStatuses)
              }
            }
            for (const save of resolved.saveCallbacks) {
              try {
                save()
              } catch {}
            }
          }
        }
      }
    }
  }

  /**
   * Re-sincroniza todos os tokens da cena (ex.: quando o tamanho, lado ou URL de ícone customizado muda).
   */
  public async reconcileAllSceneTokens(): Promise<void> {
    if (!OBR.isAvailable || isSheetReadOnlySession()) return
    try {
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (!isSceneReady) return

      this.lastSyncedSignatures.clear()
      this.lastSyncedBounds.clear()

      const items = await OBR.scene.items.getItems(item => this.isSelectableTokenItem(item))
      for (const item of items) {
        const resolved = await this.resolveTokenStatuses(item)
        if (resolved.statuses.length > 0) {
          await statusMarkerService.syncTokenStatusMarkers(item.id, resolved.statuses)
        }
      }
    } catch (err) {
      console.warn('[TokenStatusService] Erro ao reconciliar tokens da cena:', err)
    }
  }
}

export const tokenStatusService = new TokenStatusService()

