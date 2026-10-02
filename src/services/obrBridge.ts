import OBR, { Item } from '@owlbear-rodeo/sdk'
import type { MechCombatState, CombatRollBroadcast, TokenSheetBinding } from '@/types/compcon-obr'
import type { TableActionItem } from '@/types/table-actions'
import { SetItem } from '@/io/Storage'
import { toRaw } from 'vue'
import { dddiceService } from './dddiceService'
import { statusMarkerService } from './statusMarkerService'
import { TAB_ID } from './tabId'

export const COMPCON_METADATA_KEY = 'com.compcon.activemode'
export const COMPCON_PILOT_PREFIX = 'com.compcon.activemode/p/'
export const COMPCON_NPC_PREFIX = 'com.compcon.activemode/n/'
export const COMPCON_PILOT_INDEX_KEY = 'com.compcon.activemode/pilots_index'
export const COMPCON_NPC_INDEX_KEY = 'com.compcon.activemode/npcs_index'
export const COMPCON_PILOTS_METADATA_KEY = 'com.compcon.activemode/pilots'
export const COMPCON_NPCS_METADATA_KEY = 'com.compcon.activemode/npcs'
export const COMPCON_PILOT_ROSTER_KEY = 'com.compcon.activemode/pilot_roster'
export const COMPCON_NPC_ROSTER_KEY = 'com.compcon.activemode/npc_roster'
export const COMPCON_TABLE_ACTIONS_KEY = 'com.compcon.activemode/table_actions'
export const COMPCON_ACTIVE_ENCOUNTER_KEY = 'com.compcon.activemode/active_encounter'
export const COMPCON_BROADCAST_CHANNEL = 'com.compcon.activemode.broadcast'
export const COMPCON_ICON_URL = '/icon.svg'
export const COMPCON_ICON_DATA_URI = COMPCON_ICON_URL


class OBRBridge {
  private isReady = false
  private role: 'GM' | 'PLAYER' = 'PLAYER'
  private playerId: string = ''
  private tabId: string = TAB_ID
  private isSyncingFromRemote = false
  private isSavingToRemote = false
  private incomingChunks = new Map<string, { chunks: string[]; total: number; timestamp: number }>()
  private processedMsgIds = new Set<string>()
  private localTabChannel?: BroadcastChannel
  private broadcastUnsubscribe?: () => void
  private lastSyncBroadcastTime = 0
  private broadcastQueue: Array<{ payload: any; resolve: () => void }> = []
  private isProcessingBroadcastQueue = false
  private lastRoomPilotMetadataHash: string = ''
  private lastRoomNpcMetadataHash: string = ''
  private lastScenePilotMetadataHash: string = ''
  private lastSceneNpcMetadataHash: string = ''
  private lastRoomPilotRosterStr: string = ''
  private lastRoomNpcRosterStr: string = ''
  private cachedPilotRoster: Record<string, any> = {}
  private cachedNpcRoster: Record<string, any> = {}
  private playerSelectionUnsubscribe?: () => void

  public async init(onReadyCallback?: () => void) {
    if (this.isReady) return

    // Inicializa canal de broadcast local entre abas do mesmo navegador
    if (typeof BroadcastChannel !== 'undefined' && !this.localTabChannel) {
      try {
        this.localTabChannel = new BroadcastChannel('compcon_obr_local_tabs')
        this.localTabChannel.onmessage = async (event) => {
          if (!event.data || typeof event.data !== 'object') return
          if (event.data.senderTabId && event.data.senderTabId === this.tabId) return
          await this.handleBroadcastMessage(event.data)
        }
      } catch (e) {
        console.warn('[OBRBridge] BroadcastChannel local não suportado:', e)
      }
    }

    // Cross-window traffic, restricted to this extension's own windows. The
    // bridge must not act on messages posted by whatever page embeds or opened
    // the app, so both the origin and the envelope are required: a foreign page
    // can then neither read the broadcast payloads nor inject commands.
    if (typeof window !== 'undefined') {
      window.addEventListener('message', async (event) => {
        try {
          if (event.origin !== window.location.origin) return
          const data = event.data
          if (!data || typeof data !== 'object') return
          if (data.obrBridgeBroadcast !== true) return
          const payload = data.payload
          if (!payload || typeof payload !== 'object') return
          if (payload.senderTabId && payload.senderTabId === this.tabId) return
          if (!payload.type && !payload.action) return
          await this.handleBroadcastMessage(payload)
        } catch {
          // ignore
        }
      })
    }

    if (!OBR.isAvailable) {
      console.log('[OBRBridge] Owlbear Rodeo SDK não disponível neste ambiente.')
      return
    }

    OBR.onReady(async () => {
      this.isReady = true
      try {
        this.role = await OBR.player.getRole()
      } catch {
        this.role = 'PLAYER'
      }
      try {
        this.playerId = OBR.player.id || (await OBR.player.getName()) || 'client_' + Math.random().toString(36).slice(2, 9)
      } catch {
        this.playerId = 'client_' + Math.random().toString(36).slice(2, 9)
      }
      console.log(`[OBRBridge] Inicializado com sucesso. Role: ${this.role}, PlayerId: ${this.playerId}, TabId: ${this.tabId}`)

      const isStandaloneChat =
        typeof window !== 'undefined' &&
        (window.location.hash.includes('/table-chat') || window.location.search.includes('/table-chat'))

      this.setupBroadcastListener()
      this.setupRoomMetadataListener()

      if (!isStandaloneChat) {
        this.setupContextMenu()
        this.setupSceneMetadataListener()
        this.setupPlayerSelectionListener()

        // Carrega fichas já salvas na cena/sala do Owlbear
        await this.syncFromRoom().catch(() => {})

        // Solicita sincronização cross-scene com todos os jogadores na sala
        await this.requestSyncFromRoom().catch(() => {})

        // Limpa chaves legadas pesadas do room que estouram os 16 kB
        void this.cleanupRoomMetadata()

        // Limpa marcadores legados de status com URLs inválidas que possam ter ficado gravados na cena
        void statusMarkerService.cleanupLegacyMarkers().catch(() => {})

        // Inicializa serviço de dados 3D compartilhados (dddice)
        dddiceService.init()

        // Listener global para sincronizar marcadores de status quando fichas mudarem no COMP/CON
        if (typeof window !== 'undefined') {
          window.addEventListener('compcon-combatant-statuses-changed', async (e: any) => {
            const { combatantId, statuses } = e.detail || {}
            if (combatantId && Array.isArray(statuses)) {
              await this.syncCombatantStatusMarkers(combatantId, statuses).catch(() => {})
            }
          })
        }
      }

      if (onReadyCallback) onReadyCallback()
    })
  }

  public getIsReady(): boolean {
    return this.isReady
  }

  public getRole(): 'GM' | 'PLAYER' {
    return this.role
  }

  private setupContextMenu() {
    try {
      // Menu de contexto para vincular token à ficha
      void OBR.contextMenu.create({
        id: 'compcon-bind-token',
        icons: [
          {
            icon: COMPCON_ICON_DATA_URI,
            label: 'Vincular Ficha COMP/CON',
            filter: {
              roles: ['GM', 'PLAYER'],
              min: 1,
              max: 1,
            },
          },
        ],
        onClick: (context) => {
          const selectedIds = context.items.map((item: Item) => item.id)
          console.log('[OBRBridge] Token selecionado para vincular:', selectedIds)
          window.dispatchEvent(
            new CustomEvent('compcon-bind-token-requested', {
              detail: { tokenIds: selectedIds, token: context.items[0] },
            })
          )
        },
      }).catch((e) => {
        console.warn('[OBRBridge] Aviso ao criar menu de contexto bind-token:', e)
      })

      // Menu de contexto para abrir ficha do token no COMP/CON
      void OBR.contextMenu.create({
        id: 'compcon-open-sheet',
        icons: [
          {
            icon: COMPCON_ICON_DATA_URI,
            label: 'Abrir Ficha (Modo Ativo)',
            filter: {
              roles: ['GM', 'PLAYER'],
              min: 1,
              max: 1,
              some: [
                {
                  key: ['metadata', COMPCON_METADATA_KEY, 'sheetId'],
                  value: undefined,
                  operator: '!=',
                },
              ],
            },
          },
        ],
        onClick: (context) => {
          const item = context.items[0]
          const meta = item?.metadata[COMPCON_METADATA_KEY] as any
          if (meta && meta.sheetId) {
            console.log('[OBRBridge] Abrindo ficha para token:', meta)
            window.dispatchEvent(
              new CustomEvent('compcon-open-sheet-requested', {
                detail: { sheetType: meta.sheetType, sheetId: meta.sheetId },
              })
            )
          }
        },
      }).catch((e) => {
        console.warn('[OBRBridge] Aviso ao criar menu de contexto open-sheet:', e)
      })
    } catch (e) {
      console.warn('[OBRBridge] Erro ao registrar menus de contexto:', e)
    }
  }

  /**
   * Monitora alterações de metadados da sala para sincronização bidirecional em tempo real
   */
  private setupRoomMetadataListener() {
    OBR.room.onMetadataChange(async (metadata) => {
      if (this.isSyncingFromRemote || this.isSavingToRemote) return

      // Notifica componentes quando o roster de pilotos ou NPCs mudar
      const pilotRoster = metadata[COMPCON_PILOT_ROSTER_KEY]
      const pilotRosterStr = JSON.stringify(pilotRoster || {})
      if (this.lastRoomPilotRosterStr !== '' && pilotRosterStr !== this.lastRoomPilotRosterStr) {
        window.dispatchEvent(new CustomEvent('compcon-pilot-synced'))
      }
      this.lastRoomPilotRosterStr = pilotRosterStr

      const npcRoster = metadata[COMPCON_NPC_ROSTER_KEY]
      const npcRosterStr = JSON.stringify(npcRoster || {})
      if (this.lastRoomNpcRosterStr !== '' && npcRosterStr !== this.lastRoomNpcRosterStr) {
        window.dispatchEvent(new CustomEvent('compcon-npc-synced'))
      }
      this.lastRoomNpcRosterStr = npcRosterStr

      // Verifica se houve mudança real nas chaves de index ou dados dos pilotos/NPCs
      const pilotIndex = metadata[COMPCON_PILOT_INDEX_KEY]
      const currentPilotHash = JSON.stringify({ r: pilotRoster, i: pilotIndex })

      const npcIndex = metadata[COMPCON_NPC_INDEX_KEY]
      const currentNpcHash = JSON.stringify({ r: npcRoster, i: npcIndex })

      const pilotChanged = this.lastRoomPilotMetadataHash !== '' && currentPilotHash !== this.lastRoomPilotMetadataHash
      const npcChanged = this.lastRoomNpcMetadataHash !== '' && currentNpcHash !== this.lastRoomNpcMetadataHash

      this.lastRoomPilotMetadataHash = currentPilotHash
      this.lastRoomNpcMetadataHash = currentNpcHash

      if (pilotChanged || npcChanged) {
        await this.syncFromRoom()
      }

      if (COMPCON_TABLE_ACTIONS_KEY in metadata) {
        const raw = metadata[COMPCON_TABLE_ACTIONS_KEY]
        if (Array.isArray(raw)) {
          window.dispatchEvent(new CustomEvent('compcon-table-actions-synced', { detail: raw }))
        }
      }

      // Se houver alteração de sala dddice e auto-detect estiver ativo
      const hasDddiceChanges = Object.keys(metadata).some(k => k.toLowerCase().includes('dddice'))
      if (hasDddiceChanges && dddiceService.config.autoDetectRoom) {
        void dddiceService.detectRoomFromObr()
      }
    })
  }

  /**
   * Monitora alterações de metadados na cena ativa (limite de 25 MB)
   */
  private setupSceneMetadataListener() {
    OBR.scene.onMetadataChange(async (metadata) => {
      if (this.isSyncingFromRemote || this.isSavingToRemote) return

      const pilotIndex = metadata[COMPCON_PILOT_INDEX_KEY]
      const npcIndex = metadata[COMPCON_NPC_INDEX_KEY]
      const currentScenePilotHash = JSON.stringify(pilotIndex || [])
      const currentSceneNpcHash = JSON.stringify(npcIndex || [])

      const pilotChanged = this.lastScenePilotMetadataHash !== '' && currentScenePilotHash !== this.lastScenePilotMetadataHash
      const npcChanged = this.lastSceneNpcMetadataHash !== '' && currentSceneNpcHash !== this.lastSceneNpcMetadataHash

      this.lastScenePilotMetadataHash = currentScenePilotHash
      this.lastSceneNpcMetadataHash = currentSceneNpcHash

      if (pilotChanged || npcChanged) {
        await this.syncFromRoom()
      }

      if (COMPCON_ACTIVE_ENCOUNTER_KEY in metadata && metadata[COMPCON_ACTIVE_ENCOUNTER_KEY]) {
        await this.handleReceivedEncounter(metadata[COMPCON_ACTIVE_ENCOUNTER_KEY])
      }
    })

    OBR.scene.onReadyChange(async (ready) => {
      if (ready) {
        console.log('[OBRBridge] Nova cena ativada no Owlbear Rodeo. Sincronizando fichas cross-scene...')
        await this.syncFromRoom()
        await this.pushAllLocalPilotsToRoom()
        await this.pushAllLocalNpcsToRoom()
        void statusMarkerService.cleanupLegacyMarkers().catch(() => {})
      }
    })
  }

  /**
   * Monitora mensagens em tempo real via OBR Broadcast (independente da cena)
   */
  /**
   * Monitora mensagens em tempo real via OBR Broadcast (independente da cena)
   */
  private setupBroadcastListener() {
    if (this.broadcastUnsubscribe) {
      this.broadcastUnsubscribe()
    }

    this.broadcastUnsubscribe = OBR.broadcast.onMessage(COMPCON_BROADCAST_CHANNEL, async (event) => {
      const msg = event.data as any
      if (!msg || typeof msg !== 'object') return

      // Ignora mensagens enviadas por esta mesma aba
      if (msg.senderTabId && msg.senderTabId === this.tabId) return

      await this.handleBroadcastMessage(msg)
    })
  }

  /**
   * Trata mensagens recebidas tanto do OBR Broadcast quanto do BroadcastChannel local entre abas
   */
  private async handleBroadcastMessage(msg: any): Promise<void> {
    if (!msg || typeof msg !== 'object') return

    // Deduplicação de mensagens entre OBR broadcast e BroadcastChannel local
    if (msg.msgId) {
      if (this.processedMsgIds.has(msg.msgId)) return
      this.processedMsgIds.add(msg.msgId)
      if (this.processedMsgIds.size > 200) {
        const first = this.processedMsgIds.values().next().value
        if (first) this.processedMsgIds.delete(first)
      }
    }

    try {
      if (msg.type === 'SYNC_REQUEST' || msg.action === 'SYNC_REQUEST') {
        if (msg.senderId && msg.senderId === this.playerId) {
          // Requisição do mesmo usuário/jogador local, não precisa retransmitir no OBR broadcast
          return
        }
        await this.handleDebouncedSyncRequest()
      } else if (msg.type === 'PILOT_DATA') {
        await this.handleReceivedPilot(msg.pilotId, msg.data)
      } else if (msg.type === 'PILOT_CHUNK') {
        await this.handleIncomingChunk('pilot', msg.pilotId, msg.chunkIndex, msg.totalChunks, msg.chunkData)
      } else if (msg.type === 'PILOT_UPDATE') {
        await this.handleReceivedPilotUpdate(msg.pilotId, msg.patch)
      } else if (msg.type === 'PILOT_REMOVED') {
        console.log('[OBRBridge] Piloto removido por outro participante:', msg.pilotId)
        window.dispatchEvent(new CustomEvent('compcon-pilot-removed', { detail: { pilotId: msg.pilotId } }))
      } else if (msg.type === 'NPC_REMOVED') {
        console.log('[OBRBridge] NPC removido por outro participante:', msg.npcId)
        window.dispatchEvent(new CustomEvent('compcon-npc-removed', { detail: { npcId: msg.npcId } }))
      } else if (msg.type === 'NPC_DATA') {
        await this.handleReceivedNpc(msg.npcId, msg.data)
      } else if (msg.type === 'NPC_CHUNK') {
        await this.handleIncomingChunk('npc', msg.npcId, msg.chunkIndex, msg.totalChunks, msg.chunkData)
      } else if (msg.type === 'OPEN_TABLE_SHEETS') {
        window.dispatchEvent(new CustomEvent('compcon-open-table-sheets'))
      } else if (msg.type === 'OPEN_SHEET_REQUESTED') {
        window.dispatchEvent(
          new CustomEvent('compcon-open-sheet-requested', {
            detail: { sheetType: msg.sheetType || 'pilot', sheetId: msg.sheetId },
          })
        )
      } else if (msg.type === 'TABLE_ACTION') {
        window.dispatchEvent(new CustomEvent('compcon-table-action', { detail: msg.action }))
      } else if (msg.type === 'ENCOUNTER_DATA') {
        await this.handleReceivedEncounter(msg.data)
      } else if (msg.type === 'ENCOUNTER_STORAGE_UPDATED') {
        const { EncounterStore } = await import('@/stores')
        await EncounterStore().LoadEncounters()
        window.dispatchEvent(new CustomEvent('compcon-encounters-reloaded'))
      } else if (msg.senderName && msg.title) {
        // Evento de rolagem de combate compartilhado
        window.dispatchEvent(new CustomEvent('compcon-combat-roll', { detail: msg }))
      }
    } catch (err) {
      console.warn('[OBRBridge] Erro ao tratar mensagem de broadcast:', err)
    }
  }

  private async handleDebouncedSyncRequest() {
    const now = Date.now()
    if (now - this.lastSyncBroadcastTime < 5000) {
      return
    }
    this.lastSyncBroadcastTime = now
    console.log('[OBRBridge] Processando pedido de sincronização cross-scene...')
    await this.broadcastAllLocalPilots()
    if (this.role === 'GM') {
      await this.broadcastAllLocalNpcs()
    }
  }

  /**
   * Envia uma mensagem via BroadcastChannel local (abas locais) e via OBR.broadcast (remoto) com fila e rate limiting
   */
  public async sendBroadcastMessage(payload: any): Promise<void> {
    const fullPayload = {
      ...payload,
      msgId: `${this.tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderTabId: this.tabId,
      senderId: this.playerId,
    }

    // 1. Envia via BroadcastChannel local (sincronização instantânea entre abas no mesmo navegador)
    if (!this.localTabChannel && typeof BroadcastChannel !== 'undefined') {
      try {
        this.localTabChannel = new BroadcastChannel('compcon_obr_local_tabs')
        this.localTabChannel.onmessage = async (event) => {
          if (!event.data || typeof event.data !== 'object') return
          if (event.data.senderTabId && event.data.senderTabId === this.tabId) return
          await this.handleBroadcastMessage(event.data)
        }
      } catch (e) {
        console.warn('[OBRBridge] BroadcastChannel local não suportado:', e)
      }
    }
    if (this.localTabChannel) {
      try {
        this.localTabChannel.postMessage(fullPayload)
      } catch (e) {
        console.warn('[OBRBridge] Erro ao postar no BroadcastChannel local:', e)
      }
    }

    // 2. Sends via window.postMessage to the parent/opener or sibling windows.
    // The target origin is pinned to our own origin: only this extension's own
    // windows speak this protocol, so a cross-origin host page or opener must
    // not receive the serialized sheet payloads.
    if (typeof window !== 'undefined') {
      const envelope = { obrBridgeBroadcast: true, payload: fullPayload }
      const ownOrigin = window.location.origin
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(envelope, ownOrigin)
        }
        if (window.opener) {
          window.opener.postMessage(envelope, ownOrigin)
        }
        for (let i = 0; i < window.frames.length; i++) {
          try {
            window.frames[i].postMessage(envelope, ownOrigin)
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Envia via Owlbear Rodeo broadcast com fila sequencial e rate limiting
    if (OBR.isAvailable && this.isReady) {
      await new Promise<void>((resolve) => {
        this.broadcastQueue.push({ payload: fullPayload, resolve })
        void this.processBroadcastQueue()
      })
    }
  }

  private async processBroadcastQueue() {
    if (this.isProcessingBroadcastQueue) return
    this.isProcessingBroadcastQueue = true

    while (this.broadcastQueue.length > 0) {
      const item = this.broadcastQueue.shift()
      if (!item) break

      let sent = false
      let attempts = 0
      while (!sent && attempts < 3) {
        attempts++
        try {
          await OBR.broadcast.sendMessage(COMPCON_BROADCAST_CHANNEL, item.payload, {
            destination: 'ALL',
          })
          sent = true
        } catch (e: any) {
          const isRateLimit =
            e?.error?.name === 'RateLimitHit' ||
            e?.name === 'RateLimitHit' ||
            (typeof e?.message === 'string' && e.message.includes('RateLimit')) ||
            (e?.error && typeof e.error.message === 'string' && e.error.message.includes('Too many requests'))

          if (isRateLimit && attempts < 3) {
            console.warn(`[OBRBridge] Broadcast rate limit atingido, pausando ${600 * attempts}ms antes de retentar...`)
            await new Promise((r) => setTimeout(r, 600 * attempts))
          } else {
            console.warn('[OBRBridge] Erro ao enviar OBR broadcast:', e)
            sent = true
          }
        }
      }

      item.resolve()
      // Pausa de 80ms entre envios no OBR para respeitar a cota do SDK
      await new Promise((r) => setTimeout(r, 80))
    }

    this.isProcessingBroadcastQueue = false
  }

  private async handleIncomingChunk(
    type: 'pilot' | 'npc',
    id: string,
    chunkIndex: number,
    totalChunks: number,
    chunkData: string
  ) {
    const key = `${type}_${id}`
    let item = this.incomingChunks.get(key)
    if (!item || item.total !== totalChunks) {
      item = { chunks: new Array(totalChunks).fill(''), total: totalChunks, timestamp: Date.now() }
      this.incomingChunks.set(key, item)
    }
    item.chunks[chunkIndex] = chunkData

    const isComplete = item.chunks.every(c => typeof c === 'string' && c.length > 0)
    if (isComplete) {
      const fullCompressed = item.chunks.join('')
      this.incomingChunks.delete(key)
      if (type === 'pilot') {
        await this.handleReceivedPilot(id, fullCompressed)
      } else {
        await this.handleReceivedNpc(id, fullCompressed)
      }
    }
  }

  private async handleReceivedPilot(pilotId: string, compressedData: string): Promise<void> {
    try {
      const data = await this.decompressData(compressedData)
      if (!data || typeof data !== 'object') return

      const { PilotStore } = await import('@/features/pilot_management/store')
      const { Pilot } = await import('@/classes/pilot/Pilot')
      const { NavStore } = await import('@/stores/nav')

      const sanitized: any = {
        ...data,
        id: data.id || data.ID || pilotId,
        skills: Array.isArray(data.skills) ? data.skills : [],
        talents: Array.isArray(data.talents) ? data.talents : [],
        core_bonuses: Array.isArray(data.core_bonuses) ? data.core_bonuses : [],
        licenses: Array.isArray(data.licenses) ? data.licenses : [],
        mechs: Array.isArray(data.mechs) ? data.mechs : [],
        special_equipment: data.special_equipment || {},
        quirks: Array.isArray(data.quirks) ? data.quirks : [],
      }

      const pilot = Pilot.Deserialize(sanitized)
      const pilotStore = PilotStore()
      const existingIdx = pilotStore.Pilots.findIndex(p => p.ID === pilot.ID)
      if (existingIdx === -1) {
        pilotStore.Pilots.push(pilot)
        NavStore().updatePilotEntry(pilot)
        console.log(`[OBRBridge] Novo piloto recebido via broadcast: ${pilot.Name} (${pilot.Callsign})`)
      } else {
        pilotStore.Pilots.splice(existingIdx, 1, pilot)
        console.log(`[OBRBridge] Piloto atualizado via broadcast: ${pilot.Name} (${pilot.Callsign})`)
      }

      // Persiste no IndexedDB local de quem recebeu
      await SetItem('pilots', sanitized)

      // Garante que o piloto seja indexado no PilotGroupStore para aparecer no Hangar (Roster)
      const { PilotGroupStore } = await import('@/features/pilot_management/store/PilotGroupStore')
      const groupStore = PilotGroupStore()
      if (!groupStore.PilotGroups || groupStore.PilotGroups.length === 0) {
        await groupStore.LoadGroups()
      }
      await groupStore.ImportUngroupedPilots()
      await groupStore.SaveGroupData()

      // Dispara evento na janela para re-renderizar o Hangar imediatamente em todas as abas
      window.dispatchEvent(new CustomEvent('compcon-pilot-synced', { detail: { pilotId: pilot.ID, pilot } }))
    } catch (e) {
      console.warn('[OBRBridge] Erro ao processar piloto recebido via broadcast:', pilotId, e)
    }
  }

  private async handleReceivedPilotUpdate(pilotId: string, patch: any): Promise<void> {
    try {
      if (!patch || typeof patch !== 'object') return
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilot = PilotStore().Pilots.find(p => p.ID === pilotId)
      if (pilot && pilot.ActiveMech) {
        const mech = pilot.ActiveMech as any
        if (patch.hp && mech.CurrentHP !== undefined) {
          mech.CurrentHP = patch.hp.current ?? mech.CurrentHP
        }
        if (patch.heat && mech.CurrentHeat !== undefined) {
          mech.CurrentHeat = patch.heat.current ?? mech.CurrentHeat
        }
        if (patch.structure && mech.CurrentStructure !== undefined) {
          mech.CurrentStructure = patch.structure.current ?? mech.CurrentStructure
        }
        if (patch.stress && mech.CurrentStress !== undefined) {
          mech.CurrentStress = patch.stress.current ?? mech.CurrentStress
        }
      }
      window.dispatchEvent(new CustomEvent('compcon-pilot-patch', { detail: { pilotId, patch } }))
    } catch (e) {
      console.warn('[OBRBridge] Erro ao aplicar patch de piloto via broadcast:', pilotId, e)
    }
  }

  private async handleReceivedNpc(npcId: string, compressedData: string): Promise<void> {
    try {
      const data = await this.decompressData(compressedData)
      if (!data || typeof data !== 'object') return

      const { NpcStore } = await import('@/features/gm/store/npc_store')
      const { Unit } = await import('@/classes/npc/unit/Unit')
      const { Doodad } = await import('@/classes/npc/doodad/Doodad')
      const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon')
      const { NavStore } = await import('@/stores/nav')

      let npc: any = null
      if (data.npcType === 'unit') {
        npc = Unit.Deserialize(data)
      } else if (data.npcType === 'doodad') {
        npc = Doodad.Deserialize(data)
      } else if (data.npcType === 'eidolon') {
        npc = Eidolon.Deserialize(data)
      }

      if (npc) {
        const npcStore = NpcStore()
        const existingIdx = npcStore.Npcs.findIndex(n => n.ID === npc.ID)
        if (existingIdx === -1) {
          npcStore.Npcs.push(npc)
          NavStore().updateNpcEntry(npc)
          console.log(`[OBRBridge] Novo NPC recebido via broadcast: ${npc.Name}`)
        } else {
          npcStore.Npcs.splice(existingIdx, 1, npc)
          console.log(`[OBRBridge] NPC atualizado via broadcast: ${npc.Name}`)
        }
        await SetItem('npcs', data)
        window.dispatchEvent(new CustomEvent('compcon-npc-synced', { detail: { npcId: npc.ID, npc } }))
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao processar NPC recebido via broadcast:', npcId, e)
    }
  }

  /**
   * Solicita que todos os outros clientes na sala transmitam suas fichas
   */
  public async requestSyncFromRoom(): Promise<void> {
    await this.sendBroadcastMessage({
      type: 'SYNC_REQUEST',
      senderRole: this.role,
    })
  }

  /**
   * Transmite pilotos da mesa locais em tempo real para a sala
   */
  public async broadcastAllLocalPilots(): Promise<void> {
    try {
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilots = PilotStore().Pilots
      const roster = await this.getTablePilotRoster()
      const rosterIds = new Set(Object.keys(roster))

      if (pilots && pilots.length > 0) {
        for (const p of pilots) {
          // Só faz broadcast se o piloto constar no roster da mesa
          if (rosterIds.has(p.ID)) {
            await this.broadcastSinglePilot(p)
            await new Promise((r) => setTimeout(r, 60))
          }
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao transmitir pilotos locais via broadcast:', e)
    }
  }

  /**
   * Transmite um único piloto via broadcast (com suporte a chunks se necessário)
   */
  public async broadcastSinglePilot(pilotObj: any): Promise<void> {
    try {
      const { Pilot } = await import('@/classes/pilot/Pilot')
      const raw = toRaw(pilotObj)
      const id = raw?.ID || raw?.id
      if (!id) return

      let serialized: any = null
      if (typeof raw.Serialize === 'function') {
        serialized = raw.Serialize()
      } else if (raw.SkillsController && typeof Pilot.Serialize === 'function') {
        serialized = Pilot.Serialize(raw as any)
      } else if (typeof raw === 'object' && (raw.skills || raw.talents || raw.callsign || raw.name || raw.id)) {
        serialized = raw
      } else {
        return
      }

      const sanitized = JSON.parse(JSON.stringify(serialized))
      sanitized.id = sanitized.id || sanitized.ID || id
      sanitized.skills = Array.isArray(sanitized.skills) ? sanitized.skills : []
      sanitized.talents = Array.isArray(sanitized.talents) ? sanitized.talents : []
      sanitized.core_bonuses = Array.isArray(sanitized.core_bonuses) ? sanitized.core_bonuses : []
      sanitized.licenses = Array.isArray(sanitized.licenses) ? sanitized.licenses : []
      sanitized.mechs = Array.isArray(sanitized.mechs) ? sanitized.mechs : []
      sanitized.special_equipment = sanitized.special_equipment || {}

      const compressed = await this.compressData(sanitized)
      const MAX_BROADCAST_PAYLOAD = 12000

      if (compressed.length <= MAX_BROADCAST_PAYLOAD) {
        await this.sendBroadcastMessage({
          type: 'PILOT_DATA',
          pilotId: id,
          data: compressed,
        })
      } else {
        const chunkCount = Math.ceil(compressed.length / MAX_BROADCAST_PAYLOAD)
        for (let i = 0; i < chunkCount; i++) {
          const chunk = compressed.slice(i * MAX_BROADCAST_PAYLOAD, (i + 1) * MAX_BROADCAST_PAYLOAD)
          await this.sendBroadcastMessage({
            type: 'PILOT_CHUNK',
            pilotId: id,
            chunkIndex: i,
            totalChunks: chunkCount,
            chunkData: chunk,
          })
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Falha ao enviar broadcast de piloto:', e)
    }
  }

  /**
   * Transmite NPCs da mesa locais em tempo real para a sala
   */
  public async broadcastAllLocalNpcs(): Promise<void> {
    try {
      const { NpcStore } = await import('@/features/gm/store/npc_store')
      const npcs = NpcStore().Npcs
      const roster = await this.getTableNpcRoster()
      const rosterIds = new Set(Object.keys(roster))

      if (npcs && npcs.length > 0) {
        for (const n of npcs) {
          // Só faz broadcast se o NPC constar no roster da mesa
          if (rosterIds.has(n.ID)) {
            await this.broadcastSingleNpc(n)
            await new Promise((r) => setTimeout(r, 60))
          }
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao transmitir NPCs locais via broadcast:', e)
    }
  }

  /**
   * Transmite um único NPC via broadcast
   */
  public async broadcastSingleNpc(npcObj: any): Promise<void> {
    try {
      const raw = toRaw(npcObj)
      const id = raw?.ID || raw?.id
      if (!id) return
      const serialized = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
      const sanitized = JSON.parse(JSON.stringify(serialized))

      const compressed = await this.compressData(sanitized)
      const MAX_BROADCAST_PAYLOAD = 12000

      if (compressed.length <= MAX_BROADCAST_PAYLOAD) {
        await this.sendBroadcastMessage({
          type: 'NPC_DATA',
          npcId: id,
          data: compressed,
        })
      } else {
        const chunkCount = Math.ceil(compressed.length / MAX_BROADCAST_PAYLOAD)
        for (let i = 0; i < chunkCount; i++) {
          const chunk = compressed.slice(i * MAX_BROADCAST_PAYLOAD, (i + 1) * MAX_BROADCAST_PAYLOAD)
          await this.sendBroadcastMessage({
            type: 'NPC_CHUNK',
            npcId: id,
            chunkIndex: i,
            totalChunks: chunkCount,
            chunkData: chunk,
          })
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Falha ao enviar broadcast de NPC:', e)
    }
  }

  /**
   * Transmite atualizações parciais de combate de um piloto
   */
  public async broadcastPilotUpdate(pilotId: string, patch: any): Promise<void> {
    await this.sendBroadcastMessage({
      type: 'PILOT_UPDATE',
      pilotId,
      patch,
    })
  }

  /**
   * Transmite o encontro ativo para toda a mesa e salva nos metadados da cena
   */
  public async broadcastActiveEncounter(encounterObj: any): Promise<void> {
    try {
      const raw = encounterObj ? toRaw(encounterObj) : null

      if (!raw) {
        // Encerramento / limpeza do encontro
        await this.sendBroadcastMessage({
          type: 'ENCOUNTER_DATA',
          encounterId: null,
          data: null,
        })
        if (OBR.isAvailable && this.isReady) {
          try {
            await OBR.scene.setMetadata({
              [COMPCON_ACTIVE_ENCOUNTER_KEY]: undefined,
            })
          } catch (err) {
            console.warn('[OBRBridge] Erro ao limpar encontro da cena:', err)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('compcon-encounter-synced', { detail: { encounterId: null, instance: null } })
          )
        }
        console.log('[OBRBridge] Encontro ativo encerrado e removido da cena.')
        return
      }

      const { EncounterInstance } = await import('@/classes/encounter/EncounterInstance')

      let serialized: any = null
      if (typeof raw.Serialize === 'function') {
        serialized = raw.Serialize()
      } else if (typeof EncounterInstance.Serialize === 'function') {
        serialized = EncounterInstance.Serialize(raw as any)
      } else {
        serialized = raw
      }

      const compressed = await this.compressData(serialized)

      // Transmite via broadcast em tempo real para todos na sala
      await this.sendBroadcastMessage({
        type: 'ENCOUNTER_DATA',
        encounterId: raw.ID || raw.id,
        data: compressed,
      })

      // Se for GM e OBR Scene estiver disponível, persiste na cena para quem entrar depois
      if (OBR.isAvailable && this.isReady) {
        try {
          await OBR.scene.setMetadata({
            [COMPCON_ACTIVE_ENCOUNTER_KEY]: compressed,
          })
        } catch (err) {
          console.warn('[OBRBridge] Erro ao gravar encontro na cena:', err)
        }
      }

      console.log(`[OBRBridge] Encontro "${raw.Name || raw.id}" transmitido para a mesa com sucesso.`)
    } catch (e) {
      console.warn('[OBRBridge] Erro ao sincronizar encontro com a mesa:', e)
    }
  }

  /**
   * Trata um encontro recebido via broadcast ou metadados de cena
   */
  public async handleReceivedEncounter(compressedOrData: any): Promise<void> {
    try {
      if (!compressedOrData) {
        const { EncounterStore } = await import('@/stores')
        const store = EncounterStore()
        store.CurrentActiveID = ''
        window.dispatchEvent(
          new CustomEvent('compcon-encounter-synced', { detail: { encounterId: null, instance: null } })
        )
        return
      }

      let data = compressedOrData
      if (typeof compressedOrData === 'string') {
        data = await this.decompressData(compressedOrData)
      }
      if (!data || typeof data !== 'object') {
        const { EncounterStore } = await import('@/stores')
        const store = EncounterStore()
        store.CurrentActiveID = ''
        window.dispatchEvent(
          new CustomEvent('compcon-encounter-synced', { detail: { encounterId: null, instance: null } })
        )
        return
      }

      const { EncounterInstance } = await import('@/classes/encounter/EncounterInstance')
      const { EncounterStore } = await import('@/stores')

      const instance = EncounterInstance.Deserialize(data)
      const store = EncounterStore()
      await store.AddEncounterInstance(instance)
      await store.SetActiveEncounter(instance.ID)

      window.dispatchEvent(
        new CustomEvent('compcon-encounter-synced', { detail: { encounterId: instance.ID, instance } })
      )
      console.log(`[OBRBridge] Encontro sincronizado recebido: ${instance.Name} (Rodada ${instance.Round})`)
    } catch (e) {
      console.warn('[OBRBridge] Erro ao processar encontro recebido:', e)
    }
  }

  /**
   * Remove chaves legadas e pesadas do metadata do Room para não estourar a cota de 16 kB
   */
  public async cleanupRoomMetadata(): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      const roomMeta = await OBR.room.getMetadata()
      const toDelete: Record<string, undefined> = {}
      for (const key of Object.keys(roomMeta)) {
        if (
          key.startsWith(COMPCON_PILOT_PREFIX) ||
          key.startsWith(COMPCON_NPC_PREFIX) ||
          key === COMPCON_PILOTS_METADATA_KEY ||
          key === COMPCON_NPCS_METADATA_KEY ||
          key === COMPCON_PILOT_INDEX_KEY ||
          key === COMPCON_NPC_INDEX_KEY
        ) {
          toDelete[key] = undefined
        }
      }
      if (Object.keys(toDelete).length > 0) {
        console.log('[OBRBridge] Limpando metadados legados do room para liberar cota de 16 kB:', Object.keys(toDelete))
        await OBR.room.setMetadata(toDelete)
      }
    } catch (e) {
      console.warn('[OBRBridge] Aviso ao limpar metadados legados do room:', e)
    }
  }

  // =========================================================================
  // COMPRESSÃO & FRAGMENTAÇÃO DE DADOS (Limite de 16 kB do Owlbear Rodeo)
  // =========================================================================

  private async streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalLength = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        totalLength += value.length
      }
    }
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  private async streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        text += decoder.decode(value, { stream: true })
      }
    }
    text += decoder.decode()
    return text
  }

  private async decompressStreamWithFallback(bytes: Uint8Array): Promise<string | null> {
    if (typeof DecompressionStream === 'undefined' || bytes.length === 0) return null

    // Identifica o provável formato pelos magic bytes
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    const isDeflate = bytes.length >= 1 && bytes[0] === 0x78
    const formats: ('gzip' | 'deflate' | 'deflate-raw')[] = isGzip
      ? ['gzip', 'deflate', 'deflate-raw']
      : isDeflate
      ? ['deflate', 'gzip', 'deflate-raw']
      : ['gzip', 'deflate', 'deflate-raw']

    for (const format of formats) {
      try {
        const stream = new Blob([bytes as any]).stream().pipeThrough(new DecompressionStream(format))
        const text = await this.streamToText(stream)
        if (text && (text.startsWith('{') || text.startsWith('['))) {
          return text
        }
      } catch {
        // Tenta o próximo formato
      }
    }

    // Fallback: se os bytes eram UTF-8 puro
    try {
      const text = new TextDecoder().decode(bytes)
      if (text && (text.startsWith('{') || text.startsWith('['))) {
        return text
      }
    } catch {
      // ignore
    }

    return null
  }

  private async compressData(data: any): Promise<string> {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data)
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'))
        const bytes = await this.streamToUint8Array(stream)
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)))
        }
        return 'gz:' + btoa(binary)
      } catch (e) {
        console.warn('[OBRBridge] Falha ao comprimir com gzip, usando texto plano:', e)
      }
    }
    return jsonStr
  }

  private async decompressData(val: any): Promise<any> {
    if (!val) return null

    if (typeof val === 'string' && val.startsWith('gz:')) {
      const rawBase64 = val.slice(3).trim()
      try {
        const binary = atob(rawBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const decompressedText = await this.decompressStreamWithFallback(bytes)
        if (decompressedText) {
          return JSON.parse(decompressedText)
        }
      } catch {
        // Se atob falhou ou não é base64 válido, tenta se o conteúdo após 'gz:' era JSON puro
        try {
          return JSON.parse(rawBase64)
        } catch {
          // ignore
        }
      }
      return null
    }

    if (typeof val === 'string') {
      try {
        return JSON.parse(val)
      } catch {
        return val
      }
    }

    return val
  }

  private async encodeDataToChunks(baseKey: string, data: any): Promise<Record<string, any>> {
    const compressed = await this.compressData(data)
    const MAX_CHUNK_SIZE = 12000

    if (compressed.length <= MAX_CHUNK_SIZE) {
      return { [baseKey]: compressed }
    }

    const chunks: Record<string, any> = {}
    const chunkCount = Math.ceil(compressed.length / MAX_CHUNK_SIZE)
    chunks[baseKey] = `gz_chunked:${chunkCount}`

    for (let i = 0; i < chunkCount; i++) {
      chunks[`${baseKey}_${i}`] = compressed.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE)
    }

    return chunks
  }

  private async decodeDataFromChunks(baseKey: string, metadata: Record<string, any>): Promise<any> {
    const val = metadata[baseKey]
    if (!val) return null

    if (typeof val === 'string' && val.startsWith('gz_chunked:')) {
      const count = parseInt(val.split(':')[1], 10) || 0
      let fullCompressed = ''
      for (let i = 0; i < count; i++) {
        fullCompressed += (metadata[`${baseKey}_${i}`] || '')
      }
      return await this.decompressData(fullCompressed)
    }

    return await this.decompressData(val)
  }

  // =========================================================================
  // PERSISTÊNCIA & SINCRONIZAÇÃO DE PILOTOS (Independente da cena)
  // =========================================================================

  /**
   * Salva pilotos localmente, transmite via broadcast para a sala e atualiza roster/cache
   */
  /**
   * Salva pilotos localmente, transmite via broadcast para a sala e atualiza roster/cache
   */
  public async savePilotsToRoom(pilots: any[], forcePublish: boolean = false): Promise<void> {
    if (!this.isReady || !OBR.isAvailable || this.isSyncingFromRemote) return
    try {
      this.isSavingToRemote = true
      const { Pilot } = await import('@/classes/pilot/Pilot')

      const roomMeta = await OBR.room.getMetadata().catch(() => ({}))
      const currentRoster = { ...(((roomMeta as Record<string, any>)[COMPCON_PILOT_ROSTER_KEY] as Record<string, any>) || {}) }

      const rosterEntries: Record<string, any> = {}
      const sceneUpdates: Record<string, any> = {}

      for (const p of pilots) {
        const raw = toRaw(p)
        const id = raw?.ID || raw?.id
        if (!id) continue

        // Se forcePublish for falso, só atualiza se já constar no roster da mesa
        if (!forcePublish && !currentRoster[id]) {
          continue
        }

        let serialized: any = null
        if (typeof raw.Serialize === 'function') {
          serialized = raw.Serialize()
        } else if (raw.SkillsController && typeof Pilot.Serialize === 'function') {
          serialized = Pilot.Serialize(raw as any)
        } else if (typeof raw === 'object' && (raw.skills || raw.talents || raw.callsign || raw.name || raw.id)) {
          serialized = raw
        } else {
          continue
        }

        const sanitized = JSON.parse(JSON.stringify(serialized))
        sanitized.id = sanitized.id || sanitized.ID || id
        sanitized.skills = Array.isArray(sanitized.skills) ? sanitized.skills : []
        sanitized.talents = Array.isArray(sanitized.talents) ? sanitized.talents : []
        sanitized.core_bonuses = Array.isArray(sanitized.core_bonuses) ? sanitized.core_bonuses : []
        sanitized.licenses = Array.isArray(sanitized.licenses) ? sanitized.licenses : []
        sanitized.mechs = Array.isArray(sanitized.mechs) ? sanitized.mechs : []
        sanitized.special_equipment = sanitized.special_equipment || {}

        // 1. Persiste no IndexedDB local de quem está salvando (nunca perde dados)
        await SetItem('pilots', sanitized)

        // 2. Transmite via broadcast para os outros jogadores e GM na sala (cross-scene)
        await this.broadcastSinglePilot(sanitized)

        // 3. Monta entrada ultra-leve para o manifest global da sala (< 100 bytes)
        rosterEntries[id] = {
          id,
          name: sanitized.name || sanitized.Name || 'Piloto',
          callsign: sanitized.callsign || sanitized.Callsign || '',
          updatedAt: Date.now(),
        }

        // 4. Prepara cache para a cena caso haja cena ativa
        const key = COMPCON_PILOT_PREFIX + id
        const compressed = await this.compressData(sanitized)
        sceneUpdates[key] = compressed
      }

      if (Object.keys(rosterEntries).length > 0) {
        this.cachedPilotRoster = { ...this.cachedPilotRoster, ...currentRoster, ...rosterEntries }
        // Atualiza roster no Room metadata (sem estourar cota de 16 kB)
        try {
          await OBR.room.setMetadata({
            [COMPCON_PILOT_ROSTER_KEY]: { ...currentRoster, ...rosterEntries },
          })
        } catch (e) {
          console.warn('[OBRBridge] Falha ao atualizar roster no room:', e)
        }

        // Se houver cena ativa aberta no Owlbear, atualiza também a cena como cache adicional
        const isSceneReady = await OBR.scene.isReady().catch(() => false)
        if (isSceneReady && Object.keys(sceneUpdates).length > 0) {
          const sceneMetadata = await OBR.scene.getMetadata()
          const existingIndex: string[] = (sceneMetadata[COMPCON_PILOT_INDEX_KEY] as string[]) || []
          const indexSet = new Set<string>([...existingIndex, ...Object.keys(rosterEntries)])
          sceneUpdates[COMPCON_PILOT_INDEX_KEY] = Array.from(indexSet)
          await OBR.scene.setMetadata(sceneUpdates)
        }

        // Notifica componentes locais da janela atual imediatamente
        for (const [id, entry] of Object.entries(rosterEntries)) {
          window.dispatchEvent(new CustomEvent('compcon-pilot-synced', { detail: { pilotId: id, pilot: entry } }))
        }
      }

      // Libera chaves do metadata legado do ROOM
      void this.cleanupRoomMetadata()

      console.log(`[OBRBridge] ${Object.keys(rosterEntries).length} piloto(s) sincronizado(s) via broadcast + local.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao salvar pilotos no OBR:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Salva um único piloto na sala/broadcast (publica no roster da mesa)
   */
  public async savePilotToRoom(pilot: any, forcePublish: boolean = true): Promise<void> {
    await this.savePilotsToRoom([pilot], forcePublish)
  }

  /**
   * Remove um piloto dos metadados da sala, cena e desvincula tokens
   */
  public async removePilotFromRoom(pilotId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      this.isSavingToRemote = true

      // 1. Avisa os outros clientes via broadcast (local e remoto)
      await this.sendBroadcastMessage({
        type: 'PILOT_REMOVED',
        pilotId,
      })
      window.dispatchEvent(new CustomEvent('compcon-pilot-removed', { detail: { pilotId } }))

      // 2. Remove do Room Metadata (Roster, Index, Chaves e Chunks)
      try {
        const roomMeta = await OBR.room.getMetadata()
        const roomUpdates: Record<string, any> = {}

        // Remove do Roster
        delete this.cachedPilotRoster[pilotId]
        for (const k of Object.keys(this.cachedPilotRoster)) {
          if (k.toLowerCase() === pilotId.toLowerCase()) delete this.cachedPilotRoster[k]
        }
        const roster = { ...((roomMeta[COMPCON_PILOT_ROSTER_KEY] as Record<string, any>) || {}) }
        let rosterChanged = false
        for (const k of Object.keys(roster)) {
          if (k === pilotId || k.toLowerCase() === pilotId.toLowerCase() || roster[k]?.id === pilotId || roster[k]?.ID === pilotId) {
            delete roster[k]
            rosterChanged = true
          }
        }
        if (rosterChanged) {
          roomUpdates[COMPCON_PILOT_ROSTER_KEY] = roster
        }

        // Remove do Index
        const roomIndex: string[] = (roomMeta[COMPCON_PILOT_INDEX_KEY] as string[]) || []
        const newRoomIndex = roomIndex.filter(id => id !== pilotId && id.toLowerCase() !== pilotId.toLowerCase())
        if (newRoomIndex.length !== roomIndex.length) {
          roomUpdates[COMPCON_PILOT_INDEX_KEY] = newRoomIndex
        }

        // Remove chaves de dados do Room (incluindo possíveis chunks)
        const baseKey = COMPCON_PILOT_PREFIX + pilotId
        for (const k of Object.keys(roomMeta)) {
          if (k === baseKey || k.startsWith(baseKey + '_') || k.toLowerCase().startsWith(baseKey.toLowerCase())) {
            roomUpdates[k] = undefined
          }
        }

        // Remove de dados legados no Room se existirem
        const legacyPilots = roomMeta[COMPCON_PILOTS_METADATA_KEY] as Record<string, any> | undefined
        if (legacyPilots && (legacyPilots[pilotId] || Object.keys(legacyPilots).some(k => k.toLowerCase() === pilotId.toLowerCase()))) {
          const updatedLegacy = { ...legacyPilots }
          delete updatedLegacy[pilotId]
          for (const k of Object.keys(updatedLegacy)) {
            if (k.toLowerCase() === pilotId.toLowerCase()) delete updatedLegacy[k]
          }
          roomUpdates[COMPCON_PILOTS_METADATA_KEY] = updatedLegacy
        }

        if (Object.keys(roomUpdates).length > 0) {
          await OBR.room.setMetadata(roomUpdates)
        }
      } catch (err) {
        console.warn('[OBRBridge] Erro ao remover piloto dos metadados da sala:', err)
      }

      // 3. Remove da cena ativa se estiver pronta
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (isSceneReady) {
        try {
          const metadata = await OBR.scene.getMetadata()
          const sceneUpdates: Record<string, any> = {}

          const index: string[] = (metadata[COMPCON_PILOT_INDEX_KEY] as string[]) || []
          const newIndex = index.filter(id => id !== pilotId && id.toLowerCase() !== pilotId.toLowerCase())
          if (newIndex.length !== index.length) {
            sceneUpdates[COMPCON_PILOT_INDEX_KEY] = newIndex
          }

          const baseKey = COMPCON_PILOT_PREFIX + pilotId
          for (const k of Object.keys(metadata)) {
            if (k === baseKey || k.startsWith(baseKey + '_') || k.toLowerCase().startsWith(baseKey.toLowerCase())) {
              sceneUpdates[k] = undefined
            }
          }

          if (Object.keys(sceneUpdates).length > 0) {
            await OBR.scene.setMetadata(sceneUpdates)
          }

          // 4. Desvincula qualquer token da cena que estivesse vinculado a este piloto
          const boundTokens = await OBR.scene.items.getItems((item) => {
            const meta = item.metadata[COMPCON_METADATA_KEY] as any
            return meta && (meta.sheetId === pilotId || meta.sheetId?.toLowerCase() === pilotId.toLowerCase())
          })
          if (boundTokens.length > 0) {
            await OBR.scene.items.updateItems(boundTokens.map(i => i.id), (items) => {
              for (const it of items) {
                delete it.metadata[COMPCON_METADATA_KEY]
              }
            })
            for (const it of boundTokens) {
              await statusMarkerService.clearTokenStatusMarkers(it.id).catch(() => {})
            }
          }
        } catch (err) {
          console.warn('[OBRBridge] Erro ao limpar piloto da cena:', err)
        }
      }

      console.log(`[OBRBridge] Piloto ${pilotId} totalmente removido do OBR.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao remover piloto do OBR:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Obtém os pilotos salvos na cena do Owlbear (filtrados pelo roster ativo da mesa)
   */
  public async getRoomPilots(): Promise<Record<string, any>> {
    if (!this.isReady || !OBR.isAvailable) return {}
    const pilots: Record<string, any> = {}

    // Lê o roster do room para saber quais pilotos pertencem oficialmente à mesa
    let allowedPilotIds: Set<string> | null = null
    let roomMetadata: Record<string, any> = {}
    try {
      roomMetadata = await OBR.room.getMetadata()
      if (roomMetadata[COMPCON_PILOT_ROSTER_KEY] !== undefined) {
        const roster = (roomMetadata[COMPCON_PILOT_ROSTER_KEY] as Record<string, any>) || {}
        allowedPilotIds = new Set(Object.keys(roster))
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao ler metadados do room:', e)
    }

    // 1. Tenta carregar da Cena ativa (25 MB de limite)
    let isSceneReady = false
    try {
      isSceneReady = await OBR.scene.isReady()
    } catch {
      isSceneReady = false
    }

    if (isSceneReady) {
      try {
        const sceneMetadata = await OBR.scene.getMetadata()
        const pilotIds = new Set<string>((sceneMetadata[COMPCON_PILOT_INDEX_KEY] as string[]) || [])
        for (const key of Object.keys(sceneMetadata)) {
          if (key.startsWith(COMPCON_PILOT_PREFIX)) {
            const rest = key.slice(COMPCON_PILOT_PREFIX.length)
            if (!rest.includes('_')) {
              pilotIds.add(rest)
            }
          }
        }

        for (const id of pilotIds) {
          if (allowedPilotIds !== null && !allowedPilotIds.has(id)) {
            continue
          }
          const data = await this.decodeDataFromChunks(COMPCON_PILOT_PREFIX + id, sceneMetadata)
          if (data && typeof data === 'object' && (data.id || data.ID || data.callsign || data.name || data.skills)) {
            pilots[id] = data
          }
        }
      } catch (e) {
        console.warn('[OBRBridge] Erro ao ler pilotos da cena:', e)
      }
    }

    // 2. Fallback / migração de metadados legados do Room (16 kB de limite)
    try {
      const roomPilotIds = new Set<string>((roomMetadata[COMPCON_PILOT_INDEX_KEY] as string[]) || [])
      for (const key of Object.keys(roomMetadata)) {
        if (key.startsWith(COMPCON_PILOT_PREFIX)) {
          const rest = key.slice(COMPCON_PILOT_PREFIX.length)
          if (!rest.includes('_')) {
            roomPilotIds.add(rest)
          }
        }
      }

      for (const id of roomPilotIds) {
        if (allowedPilotIds !== null && !allowedPilotIds.has(id)) {
          continue
        }
        if (!pilots[id]) {
          const data = await this.decodeDataFromChunks(COMPCON_PILOT_PREFIX + id, roomMetadata)
          if (data && typeof data === 'object' && (data.id || data.ID || data.callsign || data.name || data.skills)) {
            pilots[id] = data
          }
        }
      }

      const legacy = roomMetadata[COMPCON_PILOTS_METADATA_KEY] as Record<string, any> | undefined
      if (legacy && typeof legacy === 'object') {
        for (const [id, data] of Object.entries(legacy)) {
          if (allowedPilotIds !== null && !allowedPilotIds.has(id)) {
            continue
          }
          if (!pilots[id] && data && typeof data === 'object' && (data.id || data.ID || data.callsign || data.name || data.skills)) {
            pilots[id] = data
          }
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao ler pilotos legados do room:', e)
    }

    return pilots
  }

  /**
   * Envia os pilotos da mesa locais via broadcast e para o cache da cena
   */
  public async pushAllLocalPilotsToRoom(): Promise<number> {
    const { PilotStore } = await import('@/features/pilot_management/store')
    const pilots = PilotStore().Pilots
    await this.savePilotsToRoom(pilots, false)
    return pilots.length
  }

  // =========================================================================
  // PERSISTÊNCIA & SINCRONIZAÇÃO DE NPCS (Independente da cena)
  // =========================================================================

  /**
   * Salva lista de NPCs localmente, transmite via broadcast e atualiza cache da cena
   */
  /**
   * Salva lista de NPCs localmente, transmite via broadcast e atualiza cache da cena
   */
  public async saveNpcsToRoom(npcs: any[], forcePublish: boolean = false): Promise<void> {
    if (!this.isReady || !OBR.isAvailable || this.isSyncingFromRemote) return
    try {
      this.isSavingToRemote = true

      const roomMeta = await OBR.room.getMetadata().catch(() => ({}))
      const currentRoster = { ...(((roomMeta as Record<string, any>)[COMPCON_NPC_ROSTER_KEY] as Record<string, any>) || {}) }

      const rosterEntries: Record<string, any> = {}
      const sceneUpdates: Record<string, any> = {}

      for (const n of npcs) {
        const raw = toRaw(n)
        const id = raw.ID || raw.id
        if (!id) continue

        // Se forcePublish for falso, só atualiza se já constar no roster da mesa
        if (!forcePublish && !currentRoster[id]) {
          continue
        }

        const serialized = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
        const sanitized = JSON.parse(JSON.stringify(serialized))

        // 1. Persiste no IndexedDB local
        await SetItem('npcs', sanitized)

        // 2. Broadcast em tempo real
        await this.broadcastSingleNpc(sanitized)

        // 3. Roster leve
        rosterEntries[id] = {
          id,
          name: sanitized.name || sanitized.Name || 'NPC',
          updatedAt: Date.now(),
        }

        // 4. Cache para cena
        const key = COMPCON_NPC_PREFIX + id
        const compressed = await this.compressData(sanitized)
        sceneUpdates[key] = compressed
      }

      if (Object.keys(rosterEntries).length > 0) {
        this.cachedNpcRoster = { ...this.cachedNpcRoster, ...currentRoster, ...rosterEntries }
        // Atualiza roster no Room metadata
        try {
          await OBR.room.setMetadata({
            [COMPCON_NPC_ROSTER_KEY]: { ...currentRoster, ...rosterEntries },
          })
        } catch (e) {
          console.warn('[OBRBridge] Falha ao atualizar roster de NPCs no room:', e)
        }

        const isSceneReady = await OBR.scene.isReady().catch(() => false)
        if (isSceneReady && Object.keys(sceneUpdates).length > 0) {
          const sceneMetadata = await OBR.scene.getMetadata()
          const existingIndex: string[] = (sceneMetadata[COMPCON_NPC_INDEX_KEY] as string[]) || []
          const indexSet = new Set<string>([...existingIndex, ...Object.keys(rosterEntries)])
          sceneUpdates[COMPCON_NPC_INDEX_KEY] = Array.from(indexSet)
          await OBR.scene.setMetadata(sceneUpdates)
        }

        // Notifica componentes locais da janela atual imediatamente
        for (const [id, entry] of Object.entries(rosterEntries)) {
          window.dispatchEvent(new CustomEvent('compcon-npc-synced', { detail: { npcId: id, npc: entry } }))
        }
      }

      void this.cleanupRoomMetadata()

      console.log(`[OBRBridge] ${Object.keys(rosterEntries).length} NPC(s) sincronizado(s) via broadcast + local.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao salvar NPCs no OBR:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Salva um único NPC na sala/broadcast (publica no roster da mesa)
   */
  public async saveNpcToRoom(npc: any, forcePublish: boolean = true): Promise<void> {
    await this.saveNpcsToRoom([npc], forcePublish)
  }

  /**
   * Remove um NPC dos metadados da sala, cena e desvincula tokens
   */
  public async removeNpcFromRoom(npcId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      this.isSavingToRemote = true

      // 1. Avisa os outros clientes via broadcast (local e remoto)
      await this.sendBroadcastMessage({
        type: 'NPC_REMOVED',
        npcId,
      })
      window.dispatchEvent(new CustomEvent('compcon-npc-removed', { detail: { npcId } }))

      // 2. Remove do Room Metadata
      try {
        const roomMeta = await OBR.room.getMetadata()
        const roomUpdates: Record<string, any> = {}

        // Remove do Roster
        delete this.cachedNpcRoster[npcId]
        for (const k of Object.keys(this.cachedNpcRoster)) {
          if (k.toLowerCase() === npcId.toLowerCase()) delete this.cachedNpcRoster[k]
        }
        const roster = { ...((roomMeta[COMPCON_NPC_ROSTER_KEY] as Record<string, any>) || {}) }
        let rosterChanged = false
        for (const k of Object.keys(roster)) {
          if (k === npcId || k.toLowerCase() === npcId.toLowerCase() || roster[k]?.id === npcId || roster[k]?.ID === npcId) {
            delete roster[k]
            rosterChanged = true
          }
        }
        if (rosterChanged) {
          roomUpdates[COMPCON_NPC_ROSTER_KEY] = roster
        }

        // Remove do Index
        const roomIndex: string[] = (roomMeta[COMPCON_NPC_INDEX_KEY] as string[]) || []
        const newRoomIndex = roomIndex.filter(id => id !== npcId && id.toLowerCase() !== npcId.toLowerCase())
        if (newRoomIndex.length !== roomIndex.length) {
          roomUpdates[COMPCON_NPC_INDEX_KEY] = newRoomIndex
        }

        // Remove chaves de dados do Room (incluindo possíveis chunks)
        const baseKey = COMPCON_NPC_PREFIX + npcId
        for (const k of Object.keys(roomMeta)) {
          if (k === baseKey || k.startsWith(baseKey + '_') || k.toLowerCase().startsWith(baseKey.toLowerCase())) {
            roomUpdates[k] = undefined
          }
        }

        // Remove de dados legados no Room se existirem
        const legacyNpcs = roomMeta[COMPCON_NPCS_METADATA_KEY] as Record<string, any> | undefined
        if (legacyNpcs && (legacyNpcs[npcId] || Object.keys(legacyNpcs).some(k => k.toLowerCase() === npcId.toLowerCase()))) {
          const updatedLegacy = { ...legacyNpcs }
          delete updatedLegacy[npcId]
          for (const k of Object.keys(updatedLegacy)) {
            if (k.toLowerCase() === npcId.toLowerCase()) delete updatedLegacy[k]
          }
          roomUpdates[COMPCON_NPCS_METADATA_KEY] = updatedLegacy
        }

        if (Object.keys(roomUpdates).length > 0) {
          await OBR.room.setMetadata(roomUpdates)
        }
      } catch (err) {
        console.warn('[OBRBridge] Erro ao remover NPC dos metadados da sala:', err)
      }

      // 3. Remove da cena ativa se estiver pronta
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (isSceneReady) {
        try {
          const metadata = await OBR.scene.getMetadata()
          const sceneUpdates: Record<string, any> = {}

          const index: string[] = (metadata[COMPCON_NPC_INDEX_KEY] as string[]) || []
          const newIndex = index.filter(id => id !== npcId && id.toLowerCase() !== npcId.toLowerCase())
          if (newIndex.length !== index.length) {
            sceneUpdates[COMPCON_NPC_INDEX_KEY] = newIndex
          }

          const baseKey = COMPCON_NPC_PREFIX + npcId
          for (const k of Object.keys(metadata)) {
            if (k === baseKey || k.startsWith(baseKey + '_') || k.toLowerCase().startsWith(baseKey.toLowerCase())) {
              sceneUpdates[k] = undefined
            }
          }

          if (Object.keys(sceneUpdates).length > 0) {
            await OBR.scene.setMetadata(sceneUpdates)
          }

          // 4. Desvincula qualquer token da cena
          const boundTokens = await OBR.scene.items.getItems((item) => {
            const meta = item.metadata[COMPCON_METADATA_KEY] as any
            return meta && (meta.sheetId === npcId || meta.sheetId?.toLowerCase() === npcId.toLowerCase())
          })
          if (boundTokens.length > 0) {
            await OBR.scene.items.updateItems(boundTokens.map(i => i.id), (items) => {
              for (const it of items) {
                delete it.metadata[COMPCON_METADATA_KEY]
              }
            })
            for (const it of boundTokens) {
              await statusMarkerService.clearTokenStatusMarkers(it.id).catch(() => {})
            }
          }
        } catch (err) {
          console.warn('[OBRBridge] Erro ao limpar NPC da cena:', err)
        }
      }

      console.log(`[OBRBridge] NPC ${npcId} totalmente removido do OBR.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao remover NPC do OBR:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Obtém os NPCs salvos na cena do Owlbear (filtrados pelo roster ativo da mesa)
   */
  public async getRoomNpcs(): Promise<Record<string, any>> {
    if (!this.isReady || !OBR.isAvailable) return {}
    const npcs: Record<string, any> = {}

    let allowedNpcIds: Set<string> | null = null
    let roomMetadata: Record<string, any> = {}
    try {
      roomMetadata = await OBR.room.getMetadata()
      if (roomMetadata[COMPCON_NPC_ROSTER_KEY] !== undefined) {
        const roster = (roomMetadata[COMPCON_NPC_ROSTER_KEY] as Record<string, any>) || {}
        allowedNpcIds = new Set(Object.keys(roster))
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao ler metadados do room:', e)
    }

    let isSceneReady = false
    try {
      isSceneReady = await OBR.scene.isReady()
    } catch {
      isSceneReady = false
    }

    if (isSceneReady) {
      try {
        const sceneMetadata = await OBR.scene.getMetadata()
        const npcIds = new Set<string>((sceneMetadata[COMPCON_NPC_INDEX_KEY] as string[]) || [])
        for (const key of Object.keys(sceneMetadata)) {
          if (key.startsWith(COMPCON_NPC_PREFIX)) {
            const rest = key.slice(COMPCON_NPC_PREFIX.length)
            if (!rest.includes('_')) {
              npcIds.add(rest)
            }
          }
        }

        for (const id of npcIds) {
          if (allowedNpcIds !== null && !allowedNpcIds.has(id)) {
            continue
          }
          const data = await this.decodeDataFromChunks(COMPCON_NPC_PREFIX + id, sceneMetadata)
          if (data && typeof data === 'object') {
            npcs[id] = data
          }
        }
      } catch (e) {
        console.warn('[OBRBridge] Erro ao ler NPCs da cena:', e)
      }
    }

    // Fallback / migração do Room
    try {
      const roomNpcIds = new Set<string>((roomMetadata[COMPCON_NPC_INDEX_KEY] as string[]) || [])
      for (const key of Object.keys(roomMetadata)) {
        if (key.startsWith(COMPCON_NPC_PREFIX)) {
          const rest = key.slice(COMPCON_NPC_PREFIX.length)
          if (!rest.includes('_')) {
            roomNpcIds.add(rest)
          }
        }
      }

      for (const id of roomNpcIds) {
        if (allowedNpcIds !== null && !allowedNpcIds.has(id)) {
          continue
        }
        if (!npcs[id]) {
          const data = await this.decodeDataFromChunks(COMPCON_NPC_PREFIX + id, roomMetadata)
          if (data) npcs[id] = data
        }
      }

      const legacy = roomMetadata[COMPCON_NPCS_METADATA_KEY] as Record<string, any> | undefined
      if (legacy && typeof legacy === 'object') {
        for (const [id, data] of Object.entries(legacy)) {
          if (allowedNpcIds !== null && !allowedNpcIds.has(id)) {
            continue
          }
          if (!npcs[id]) npcs[id] = data
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao ler NPCs legados do room:', e)
    }

    return npcs
  }

  /**
   * Envia os NPCs da mesa locais via broadcast e para o cache da cena
   */
  public async pushAllLocalNpcsToRoom(): Promise<number> {
    const { NpcStore } = await import('@/features/gm/store/npc_store')
    const npcs = NpcStore().Npcs
    await this.saveNpcsToRoom(npcs, false)
    return npcs.length
  }

  // =========================================================================
  // SINCRONIZAÇÃO DA SALA COM O COMP/CON LOCAL
  // =========================================================================

  /**
   * Baixa pilotos e NPCs salvos na sala e solicita sincronização via broadcast
   */
  public async syncFromRoom(): Promise<{ pilotsCount: number; npcsCount: number }> {
    if (!this.isReady || !OBR.isAvailable) return { pilotsCount: 0, npcsCount: 0 }

    this.isSyncingFromRemote = true
    let pilotsCount = 0
    let npcsCount = 0

    try {
      const metadata = await OBR.room.getMetadata()

      // Carrega encontro ativo salvo na cena, se houver
      try {
        const sceneMeta = await OBR.scene.getMetadata()
        if (COMPCON_ACTIVE_ENCOUNTER_KEY in sceneMeta && sceneMeta[COMPCON_ACTIVE_ENCOUNTER_KEY]) {
          await this.handleReceivedEncounter(sceneMeta[COMPCON_ACTIVE_ENCOUNTER_KEY])
        }
      } catch {
        // cena pode não estar pronta
      }

      // --- PILOTOS ---
      const roomPilots = await this.getRoomPilots()
      if (Object.keys(roomPilots).length > 0) {
        const { PilotStore } = await import('@/features/pilot_management/store')
        const { Pilot } = await import('@/classes/pilot/Pilot')
        const { NavStore } = await import('@/stores/nav')
        const pilotStore = PilotStore()

        for (const [id, rawData] of Object.entries(roomPilots)) {
          if (!rawData || typeof rawData !== 'object') continue
          try {
            const data: any = {
              ...rawData,
              id: rawData.id || rawData.ID || id,
              skills: Array.isArray(rawData.skills) ? rawData.skills : [],
              talents: Array.isArray(rawData.talents) ? rawData.talents : [],
              core_bonuses: Array.isArray(rawData.core_bonuses) ? rawData.core_bonuses : [],
              licenses: Array.isArray(rawData.licenses) ? rawData.licenses : [],
              mechs: Array.isArray(rawData.mechs) ? rawData.mechs : [],
              special_equipment: rawData.special_equipment || {},
              quirks: Array.isArray(rawData.quirks) ? rawData.quirks : [],
            }
            const pilot = Pilot.Deserialize(data)
            const existingIdx = pilotStore.Pilots.findIndex(p => p.ID === id)
            if (existingIdx === -1) {
              pilotStore.Pilots.push(pilot)
              NavStore().updatePilotEntry(pilot)
            } else {
              pilotStore.Pilots.splice(existingIdx, 1, pilot)
            }
            await SetItem('pilots', data)
            pilotsCount++
          } catch (e) {
            console.warn('[OBRBridge] Erro ao desserializar piloto da sala:', id, e)
          }
        }

        // Se havia a chave legada monolítica, remove para liberar quota de metadados
        if (metadata[COMPCON_PILOTS_METADATA_KEY] !== undefined) {
          await OBR.room.setMetadata({ [COMPCON_PILOTS_METADATA_KEY]: undefined })
        }

        // Garante que todos os pilotos carregados sejam indexados no PilotGroupStore para aparecer no Hangar (Roster)
        const { PilotGroupStore } = await import('@/features/pilot_management/store/PilotGroupStore')
        const groupStore = PilotGroupStore()
        if (!groupStore.PilotGroups || groupStore.PilotGroups.length === 0) {
          await groupStore.LoadGroups()
        }
        await groupStore.ImportUngroupedPilots()
        await groupStore.SaveGroupData()
      }

      // --- NPCS ---
      const roomNpcs = await this.getRoomNpcs()
      if (Object.keys(roomNpcs).length > 0) {
        const { NpcStore } = await import('@/features/gm/store/npc_store')
        const { Unit } = await import('@/classes/npc/unit/Unit')
        const { Doodad } = await import('@/classes/npc/doodad/Doodad')
        const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon')
        const { NavStore } = await import('@/stores/nav')
        const npcStore = NpcStore()

        for (const [id, data] of Object.entries(roomNpcs)) {
          if (!data) continue
          try {
            let npc: any = null
            if (data.npcType === 'unit') {
              npc = Unit.Deserialize(data)
            } else if (data.npcType === 'doodad') {
              npc = Doodad.Deserialize(data)
            } else if (data.npcType === 'eidolon') {
              npc = Eidolon.Deserialize(data)
            }

            if (npc) {
              const existingIdx = npcStore.Npcs.findIndex(n => n.ID === id)
              if (existingIdx === -1) {
                npcStore.Npcs.push(npc)
                NavStore().updateNpcEntry(npc)
              } else {
                npcStore.Npcs.splice(existingIdx, 1, npc)
              }
              await SetItem('npcs', data)
              npcsCount++
            }
          } catch (e) {
            console.warn('[OBRBridge] Erro ao desserializar NPC da sala:', id, e)
          }
        }

        if (metadata[COMPCON_NPCS_METADATA_KEY] !== undefined) {
          await OBR.room.setMetadata({ [COMPCON_NPCS_METADATA_KEY]: undefined })
        }
      }

      // Limpa metadados legados se houver
      void this.cleanupRoomMetadata()
    } catch (err) {
      console.error('[OBRBridge] Erro na sincronização da sala OBR:', err)
    } finally {
      this.isSyncingFromRemote = false
    }

    return { pilotsCount, npcsCount }
  }

  // =========================================================================
  // VINCULAÇÃO DE TOKENS E STATUS VISUAIS NO CANVAS
  // =========================================================================

  /**
   * Vincula um token do mapa a uma ficha de Piloto ou NPC
   */
  public async bindTokenToSheet(tokenId: string, binding: TokenSheetBinding): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        item.metadata[COMPCON_METADATA_KEY] = JSON.parse(JSON.stringify({
          ...((item.metadata[COMPCON_METADATA_KEY] as object) || {}),
          sheetType: binding.sheetType,
          sheetId: binding.sheetId,
          mechId: binding.mechId,
          name: binding.name,
          hp: binding.hp,
          heat: binding.heat,
          structure: binding.structure,
          stress: binding.stress,
          statuses: binding.statuses,
        }))
        // Atualiza o nome do token no Owlbear se desejado
        if (item.name !== binding.name) {
          item.name = binding.name
        }
      }
    })

    await OBR.notification.show(`Token vinculado com sucesso a: ${binding.name}`)

    // Sincroniza marcadores visuais no token se houver estados ativos
    if (binding.statuses && binding.statuses.length > 0) {
      await statusMarkerService.syncTokenStatusMarkers(tokenId, binding.statuses).catch(() => {})
    }
  }

  /**
   * Desvincula um token de qualquer ficha
   */
  public async unbindToken(tokenId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        delete item.metadata[COMPCON_METADATA_KEY]
      }
    })

    // Remove marcadores visuais de status anexados
    await statusMarkerService.clearTokenStatusMarkers(tokenId).catch(() => {})

    await OBR.notification.show('Ficha desvinculada do token.')
  }

  /**
   * Obtém a ficha vinculada a um token
   */
  public async getTokenBinding(tokenId: string): Promise<TokenSheetBinding | null> {
    if (!this.isReady || !OBR.isAvailable) return null
    const items = await OBR.scene.items.getItems([tokenId])
    if (!items.length) return null
    const meta = items[0].metadata[COMPCON_METADATA_KEY] as any
    if (meta && meta.sheetId) {
      return {
        sheetType: meta.sheetType,
        sheetId: meta.sheetId,
        mechId: meta.mechId,
        name: meta.name,
        hp: meta.hp,
        heat: meta.heat,
        structure: meta.structure,
        stress: meta.stress,
        statuses: meta.statuses,
      }
    }
    return null
  }

  /**
   * Atualiza os metadados visuais de combate em um token
   */
  public async updateTokenVisuals(tokenId: string, state: MechCombatState) {
    if (!this.isReady || !OBR.isAvailable) return

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        item.metadata[COMPCON_METADATA_KEY] = {
          ...((item.metadata[COMPCON_METADATA_KEY] as object) || {}),
          mechId: state.id,
          name: state.name,
          hp: state.hp,
          heat: state.heat,
          structure: state.structure,
          stress: state.stress,
          statuses: state.statuses,
        }
      }
    })

    // Atualiza marcadores visuais no canvas do Owlbear
    if (state.statuses) {
      await statusMarkerService.syncTokenStatusMarkers(tokenId, state.statuses).catch(() => {})
    }
  }

  /**
   * Atualiza todos os tokens no mapa que estão vinculados à ficha informada
   */
  public async updateTokensForCombatant(sheetId: string, state: MechCombatState) {
    if (!this.isReady || !OBR.isAvailable) return

    const items = await OBR.scene.items.getItems((item) => {
      const meta = item.metadata[COMPCON_METADATA_KEY] as any
      return meta && (meta.sheetId === sheetId || meta.mechId === sheetId)
    })

    if (items.length > 0) {
      const tokenIds = items.map((i) => i.id)
      await OBR.scene.items.updateItems(tokenIds, (sceneItems: Item[]) => {
        for (const item of sceneItems) {
          item.metadata[COMPCON_METADATA_KEY] = {
            ...((item.metadata[COMPCON_METADATA_KEY] as object) || {}),
            mechId: state.id,
            name: state.name,
            hp: state.hp,
            heat: state.heat,
            structure: state.structure,
            stress: state.stress,
            statuses: state.statuses,
          }
        }
      })

      // Atualiza marcadores visuais em cada token vinculado
      if (state.statuses) {
        for (const tid of tokenIds) {
          await statusMarkerService.syncTokenStatusMarkers(tid, state.statuses).catch(() => {})
        }
      }
    }
  }

  /**
   * Atualiza diretamente os marcadores visuais de um combatente (por ID da ficha ou mecha)
   */
  public async syncCombatantStatusMarkers(combatantId: string, statuses: string[]): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      const items = await OBR.scene.items.getItems((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        return meta && (meta.sheetId === combatantId || meta.mechId === combatantId)
      })
      for (const item of items) {
        await statusMarkerService.syncTokenStatusMarkers(item.id, statuses).catch(() => {})
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao sincronizar marcadores de status do combatente:', e)
    }
  }

  /**
   * Monitora a seleção de tokens no canvas do Owlbear e notifica o Tracker
   */
  private setupPlayerSelectionListener() {
    if (this.playerSelectionUnsubscribe) {
      this.playerSelectionUnsubscribe()
    }
    if (!OBR.isAvailable || !this.isReady) return

    this.playerSelectionUnsubscribe = OBR.player.onChange(async (player) => {
      const selection = player.selection
      if (!selection || selection.length === 0) return
      const selectedId = selection[0]
      try {
        const items = await OBR.scene.items.getItems([selectedId])
        if (items.length > 0) {
          const item = items[0]
          const meta = (item.metadata[COMPCON_METADATA_KEY] as any) || {}
          window.dispatchEvent(
            new CustomEvent('compcon-token-selected', {
              detail: {
                tokenId: selectedId,
                tokenName: item.name,
                sheetId: meta.sheetId,
                mechId: meta.mechId,
                combatantId: meta.combatantId,
              },
            })
          )
        }
      } catch {
        // ignore
      }
    })
  }

  /**
   * Encontra o token correspondente a um combatente no mapa
   */
  public async findTokenForCombatant(c: any): Promise<Item | null> {
    if (!this.isReady || !OBR.isAvailable) return null
    try {
      const items = await OBR.scene.items.getItems()
      const sheetId = c?.actor?.ID
      const mechId = c?.actor?.ActiveMech?.ID
      const combatantId = c?.id
      const name = (c?.actor?.Name || '').trim().toLowerCase()
      const combatName = (c?.actor?.CombatController?.CombatName || '').trim().toLowerCase()

      // 1. Busca por vínculo explícito de IDs nos metadados
      const exactMatch = items.find((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        if (!meta) return false
        return (
          (combatantId && meta.combatantId === combatantId) ||
          (sheetId && (meta.sheetId === sheetId || meta.mechId === sheetId)) ||
          (mechId && (meta.sheetId === mechId || meta.mechId === mechId))
        )
      })
      if (exactMatch) return exactMatch

      // 2. Busca por nome no token da cena
      const nameMatch = items.find((item) => {
        const tokenName = (item.name || '').trim().toLowerCase()
        if (!tokenName) return false
        return (
          tokenName === name ||
          tokenName === combatName ||
          (name && tokenName.includes(name)) ||
          (combatName && tokenName.includes(combatName))
        )
      })
      return nameMatch || null
    } catch (e) {
      console.warn('[OBRBridge] Erro ao buscar token para combatente:', e)
      return null
    }
  }

  /**
   * Move e centraliza a câmera do Owlbear Rodeo no token e o seleciona
   */
  public async focusToken(token: Item): Promise<void> {
    if (!this.isReady || !OBR.isAvailable || !token) return
    try {
      const scale = (await OBR.viewport.getScale().catch(() => 1)) || 1
      const width = (await OBR.viewport.getWidth().catch(() => 1920)) || 1920
      const height = (await OBR.viewport.getHeight().catch(() => 1080)) || 1080

      const targetX = token.position.x
      const targetY = token.position.y

      await OBR.viewport.animateTo({
        scale,
        position: {
          x: width / 2 - targetX * scale,
          y: height / 2 - targetY * scale,
        },
      })

      await OBR.player.select([token.id])
    } catch (e) {
      console.warn('[OBRBridge] Erro ao focar token no mapa:', e)
    }
  }

  /**
   * Localiza o token de um combatente e foca a câmera nele
   */
  public async focusAndSelectCombatant(combatant: any): Promise<boolean> {
    const token = await this.findTokenForCombatant(combatant)
    if (token) {
      await this.focusToken(token)
      return true
    }
    return false
  }

  /**
   * Vincula o token atualmente selecionado no mapa a este combatente do Tracker
   */
  public async bindSelectedTokenToCombatant(combatant: any): Promise<boolean> {
    if (!this.isReady || !OBR.isAvailable) return false
    try {
      const selection = await OBR.player.getSelection()
      if (!selection || selection.length === 0) {
        await OBR.notification.show('Selecione primeiro um token no mapa para vincular.')
        return false
      }
      const tokenId = selection[0]
      const sheetId = combatant.actor?.ID || combatant.id
      const mechId = combatant.actor?.ActiveMech?.ID || sheetId
      const name = combatant.actor?.CombatController?.CombatName || combatant.actor?.Name || 'Combatente'

      await this.bindTokenToSheet(tokenId, {
        sheetType: combatant.side === 'ally' ? 'pilot' : 'npc',
        sheetId,
        mechId,
        name,
        combatantId: combatant.id,
      } as any)

      await OBR.scene.items.updateItems([tokenId], (items) => {
        for (const item of items) {
          item.metadata[COMPCON_METADATA_KEY] = {
            ...((item.metadata[COMPCON_METADATA_KEY] as object) || {}),
            combatantId: combatant.id,
          }
        }
      })

      await OBR.notification.show(`Token vinculado com sucesso a ${name}!`)
      return true
    } catch (e) {
      console.warn('[OBRBridge] Erro ao vincular token selecionado ao combatente:', e)
      return false
    }
  }

  /**
   * Envia uma notificação e broadcast de combate para todos os jogadores na sala
   */
  public async broadcastRoll(rollData: CombatRollBroadcast) {
    if (!this.isReady || !OBR.isAvailable) return

    const rollMsg = rollData.rollResult !== undefined ? ` [Resultado: ${rollData.rollResult}]` : ''
    const cleanDetail = rollData.detail ? rollData.detail.replace(/<[^>]*>/g, '') : ''
    const detailPart = cleanDetail ? ` - ${cleanDetail}` : ''
    await OBR.notification.show(`${rollData.senderName}: ${rollData.title}${detailPart}${rollMsg}`)
    await OBR.broadcast.sendMessage(COMPCON_BROADCAST_CHANNEL, JSON.parse(JSON.stringify(rollData)))
  }

  /**
   * Envia uma ação tática ou mensagem de chat da mesa via broadcast
   */
  public async broadcastTableAction(action: TableActionItem): Promise<void> {
    await this.sendBroadcastMessage({
      type: 'TABLE_ACTION',
      action,
    })
  }

  /**
   * Obtém as ações recentes persistidas na sala do Owlbear
   */
  public async getRoomTableActions(): Promise<TableActionItem[]> {
    if (!this.isReady || !OBR.isAvailable) return []
    try {
      const metadata = await OBR.room.getMetadata()
      const data = metadata[COMPCON_TABLE_ACTIONS_KEY] as TableActionItem[]
      return Array.isArray(data) ? data : []
    } catch (e) {
      console.warn('[OBRBridge] Erro ao buscar ações da sala:', e)
      return []
    }
  }

  /**
   * Salva o buffer rotativo de ações na sala do Owlbear (máx 60 ações para manter payload leve)
   */
  public async saveRoomTableActions(actions: TableActionItem[]): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    const recent = actions.slice(-60)
    try {
      await OBR.room.setMetadata({
        [COMPCON_TABLE_ACTIONS_KEY]: JSON.parse(JSON.stringify(recent)),
      })
    } catch (e) {
      console.warn('[OBRBridge] Erro ao salvar ações na sala:', e)
    }
  }

  /**
   * Obtém os IDs dos tokens selecionados no mapa atualmente
   */
  public async getSelectedTokenIds(): Promise<string[]> {
    if (!this.isReady || !OBR.isAvailable) return []
    const selection = await OBR.player.getSelection()
    return selection || []
  }

  /**
   * Salva todo o estado do combate no Metadata da Sala do Owlbear
   */
  public async syncRoomEncounterState(encounters: Record<string, MechCombatState>) {
    if (!this.isReady || !OBR.isAvailable) return
    await OBR.room.setMetadata({
      [COMPCON_METADATA_KEY]: JSON.parse(JSON.stringify(encounters)),
    })
  }

  /**
   * Escuta atualizações de estado de combate da sala
   */
  public onRoomStateChange(callback: (encounters: Record<string, MechCombatState>) => void) {
    if (!this.isReady || !OBR.isAvailable) return
    OBR.room.onMetadataChange((metadata) => {
      const state = metadata[COMPCON_METADATA_KEY] as Record<string, MechCombatState>
      if (state) callback(state)
    })
  }

  /**
   * Obtém o catálogo/roster leve de pilotos da sala
   */
  public async getTablePilotRoster(): Promise<Record<string, any>> {
    if (!this.isReady || !OBR.isAvailable) return this.cachedPilotRoster || {}
    try {
      const roomMeta = await OBR.room.getMetadata()
      const roster = (roomMeta[COMPCON_PILOT_ROSTER_KEY] as Record<string, any>) || {}
      this.cachedPilotRoster = { ...this.cachedPilotRoster, ...roster }
      return this.cachedPilotRoster
    } catch {
      return this.cachedPilotRoster || {}
    }
  }

  /**
   * Obtém o catálogo/roster leve de NPCs da sala
   */
  public async getTableNpcRoster(): Promise<Record<string, any>> {
    if (!this.isReady || !OBR.isAvailable) return this.cachedNpcRoster || {}
    try {
      const roomMeta = await OBR.room.getMetadata()
      const roster = (roomMeta[COMPCON_NPC_ROSTER_KEY] as Record<string, any>) || {}
      this.cachedNpcRoster = { ...this.cachedNpcRoster, ...roster }
      return this.cachedNpcRoster
    } catch {
      return this.cachedNpcRoster || {}
    }
  }

  /**
   * Obtém os tokens da cena ativa que estão vinculados a fichas do COMP/CON
   */
  public async getSceneTokensWithBindings(): Promise<Array<{ tokenId: string; tokenName: string; binding: TokenSheetBinding }>> {
    if (!this.isReady || !OBR.isAvailable) return []
    try {
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (!isSceneReady) return []
      const items = await OBR.scene.items.getItems((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        return !!(meta && meta.sheetId)
      })
      return items.map((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        return {
          tokenId: item.id,
          tokenName: item.name || 'Token',
          binding: {
            sheetType: meta.sheetType,
            sheetId: meta.sheetId,
            mechId: meta.mechId,
            name: meta.name || item.name,
            hp: meta.hp,
            heat: meta.heat,
            structure: meta.structure,
            stress: meta.stress,
            statuses: meta.statuses,
          },
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Obtém todos os tokens da cena ativa (personagens, imagens e tokens posicionados na mesa)
   */
  public async getSceneTokens(): Promise<Array<{
    id: string
    name: string
    layer: string
    imageUrl: string
    binding: TokenSheetBinding | null
  }>> {
    if (!this.isReady || !OBR.isAvailable) return []
    try {
      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (!isSceneReady) return []
      const items = await OBR.scene.items.getItems((item) => {
        return (
          item.layer === 'CHARACTER' ||
          item.layer === 'MOUNT' ||
          item.layer === 'PROP' ||
          item.layer === 'ATTACHMENT' ||
          (item as any).type === 'IMAGE' ||
          !!(item as any).image?.url
        )
      })
      return items.map((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        let binding: TokenSheetBinding | null = null
        if (meta && meta.sheetId) {
          binding = {
            sheetType: meta.sheetType,
            sheetId: meta.sheetId,
            mechId: meta.mechId,
            name: meta.name || item.name,
            hp: meta.hp,
            heat: meta.heat,
            structure: meta.structure,
            stress: meta.stress,
            statuses: meta.statuses,
          }
        }
        return {
          id: item.id,
          name: item.name || (item as any).text?.plainText || 'Token sem nome',
          layer: item.layer,
          imageUrl: (item as any).image?.url || '',
          binding,
        }
      })
    } catch (e) {
      console.warn('[OBRBridge] Erro ao buscar tokens da cena:', e)
      return []
    }
  }
}

export const obrBridge = new OBRBridge()
