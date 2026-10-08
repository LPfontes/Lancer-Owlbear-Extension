import OBR, { buildImage, type Item, type KeyFilter } from '@owlbear-rodeo/sdk'
import type { MechCombatState, CombatRollBroadcast, TokenSheetBinding } from '@/types/compcon-obr'
import { COMPCON_METADATA_KEY } from '@/types/compcon-obr'
import type { TableActionItem } from '@/types/table-actions'
import type { SyncedTrackerSnapshot } from '@/types/tracker-sync'
import type { TokenTrackerConfig } from '@/types/token-tracker'
import { SetItem } from '@/io/Storage'
import { toRaw } from 'vue'
import { dddiceService } from './dddiceService'
import { tableSyncSocket, roomSyncedSheets } from './tableSyncSocket'
import { statusMarkerService } from './statusMarkerService'
import { isSheetReadOnlySession } from './sheetReadOnlySession'
import { tokenTrackerService, TOKEN_TRACKER_ROOM_CONFIG_KEY } from './tokenTrackerService'
import { tokenMovementCapture } from './tokenMovementCapture'
import { getTrackerIconUrl } from './tokenTrackerIcons'
import { i18n } from '@/i18n'
import { TOKEN_TRACKER_MOVEMENT_KEY } from '@/types/token-tracker'
import { tokenTrackerLog } from './tokenTrackerDebug'
import { sanitizeTokenTrackerConfig } from './tokenTrackerPolicy'
import { obrPlayerId, obrReady, obrRole } from './obrRuntime'
import { TAB_ID } from './tabId'
import {
  addToTableRoster,
  removeFromTableRoster,
  setTableRosterRoom,
  tableRosterEntries,
  tableRosterIds,
} from './tableRoster'

// Chaves usadas só dentro deste módulo: nenhuma delas faz parte da API do bridge.
// Chave de metadado de token/ficha quem precisa importa de `types/compcon-obr`.

/** Histórico de ações/chat da mesa gravado na sala (lido por `tableActionStore`). */
const COMPCON_TABLE_ACTIONS_KEY = 'com.compcon.activemode/table_actions'
/** Canal de broadcast da sala: fichas, rolagens e recados entre janelas. */
const COMPCON_BROADCAST_CHANNEL = 'com.compcon.activemode.broadcast'
/** Ícone dos menus de contexto registrados por esta extensão. */
const COMPCON_ICON_DATA_URI = '/icon.svg'
/** Flag local do vínculo automático de token ao abrir uma ficha. */
const COMPCON_AUTO_TOKEN_STORAGE_KEY = 'compcon_auto_token_enabled'

class OBRBridge {
  private isReady = false
  private role: 'GM' | 'PLAYER' = 'PLAYER'
  private playerId: string = ''
  private tabId: string = TAB_ID
  private isSyncingFromRemote = false
  private isSavingToRemote = false
  private processedMsgIds = new Set<string>()
  private broadcastUnsubscribe?: () => void
  private broadcastQueue: Array<{ payload: any; resolve: () => void }> = []
  private isProcessingBroadcastQueue = false
  private playerSelectionUnsubscribe?: () => void
  private messageListenerAdded = false
  private statusChangeListenerAdded = false
  private pendingStatusSyncs = new Map<string, { statuses: string[]; originId?: string }>()
  private statusSyncTimeout: ReturnType<typeof setTimeout> | null = null

  public async init(onReadyCallback?: () => void) {
    if (this.isReady) return

    // Cross-window traffic, restricted to this extension's own windows. The
    // bridge must not act on messages posted by whatever page embeds or opened
    // the app, so both the origin and the envelope are required: a foreign page
    // can then neither read the broadcast payloads nor inject commands.
    if (typeof window !== 'undefined' && !this.messageListenerAdded) {
      this.messageListenerAdded = true
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
      void tableSyncSocket.init()
      if (onReadyCallback) onReadyCallback()
      return
    }

    OBR.onReady(async () => {
      this.isReady = true
      // Publica a prontidão imediatamente: a UI reagir ao handshake não pode esperar
      // a resolução do papel abaixo.
      obrReady.value = true

      try {
        this.role = await OBR.player.getRole()
      } catch {
        this.role = 'PLAYER'
      }
      obrRole.value = this.role

      try {
        this.playerId = OBR.player.id || (await OBR.player.getName()) || 'client_' + Math.random().toString(36).slice(2, 9)
      } catch {
        this.playerId = 'client_' + Math.random().toString(36).slice(2, 9)
      }
      obrPlayerId.value = this.playerId
      // O roster da mesa é local e namespaced pela sala: nenhum registro de ficha
      // da mesa vai para os metadados do Owlbear.
      setTableRosterRoom(OBR.room.id)
      console.log(`[OBRBridge] Inicializado com sucesso. Role: ${this.role}, PlayerId: ${this.playerId}, TabId: ${this.tabId}`)

      this.setupContextMenu()
      this.setupSceneListeners()
      this.setupPlayerSelectionListener()
      this.setupBroadcastListener()
      this.setupRoomMetadataListener()

      // Solicita sincronização cross-scene com todos os jogadores na sala
      await this.requestSyncFromRoom().catch(() => { })

      // Limpa marcadores legados de status com URLs inválidas que possam ter ficado gravados na cena
      void statusMarkerService.cleanupLegacyMarkers().catch(() => { })

      // Inicializa serviço de dados 3D compartilhados (dddice) e WebSocket
      dddiceService.init()
      void tableSyncSocket.init()

      // Listener global para sincronizar marcadores de status quando fichas mudarem no COMP/CON
      if (typeof window !== 'undefined' && !this.statusChangeListenerAdded) {
        this.statusChangeListenerAdded = true
        window.addEventListener('compcon-combatant-statuses-changed', async (e: any) => {
          const { combatantId, statuses, originId } = e.detail || {}
          if (combatantId && Array.isArray(statuses)) {
            await this.syncCombatantStatusMarkers(combatantId, statuses, originId).catch(() => { })
          }
        })
      }

      // Trackers dos tokens (PV, Blindagem, Calor, Movimento, Estrutura, Estresse).
      await this.registerTokenTrackerStores()
      await tokenTrackerService
        .start()
        .then(() => tokenTrackerService.cleanupLegacyItems())
        .catch(err => console.warn('[OBRBridge] Falha ao iniciar os token trackers:', err))

      // Captura do arrasto do token → gasto de movimento (§13). Fica aqui, junto dos
      // trackers, porque depende do mesmo vínculo token↔ficha para achar o motor.
      try {
        // A decisão mora no iframe que tem o controlador VIVO (a janela da ficha);
        // a janela do mapa manda o gesto por broadcast.
        tokenMovementCapture.setRelaySend(payload => this.sendBroadcastMessage(payload))
        tokenMovementCapture.start()
      } catch (err) {
        console.warn('[OBRBridge] Falha ao iniciar a captura de movimento:', err)
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

  /** Liga/desliga o registro de movimento dos tokens selecionados (§13). */
  public async setMovementArmed(tokenIds: string[], armed: boolean): Promise<void> {
    for (const tokenId of tokenIds) {
      if (armed) {
        const ok = await tokenMovementCapture.armMovement(tokenId)
        if (!ok) {
          await OBR.notification
            .show(
              'Não deu para ativar o movimento deste token: vincule a ficha primeiro (o movimento sai do SPEED dela).'
            )
            .catch(() => { })
        } else {
          await OBR.notification.show('Movimento ativado neste token.').catch(() => { })
        }
      } else {
        await tokenMovementCapture.disarmMovement(tokenId)
        await OBR.notification.show('Movimento parado neste token.').catch(() => { })
      }
    }
  }

  private setupContextMenu() {
    try {
      // Movimento do token: ATIVAR/PARAR o registro do arrasto (§13).
      //
      // Registrar virou estado explícito — arrastar só debita quando o jogador ativou.
      // Os dois ícones convivem: o `filter` por metadata decide qual aparece, então o
      // menu mostra "ativar" no token desligado e "parar" no token ligado, sem que a
      // extensão precise recriar o menu a cada mudança.
      const armado: KeyFilter = {
        key: ['metadata', TOKEN_TRACKER_MOVEMENT_KEY, 'v'],
        value: 1,
        operator: '==',
      }
      const desarmado: KeyFilter = {
        key: ['metadata', TOKEN_TRACKER_MOVEMENT_KEY, 'v'],
        value: 1,
        operator: '!=',
      }
      void OBR.contextMenu
        .create({
          id: 'compcon-movement-arm',
          icons: [
            {
              icon: getTrackerIconUrl('movement'),
              label: i18n.global.t('active.tokenTrackers.movementArm'),
              filter: { roles: ['GM', 'PLAYER'], min: 1, max: 1, some: [desarmado] },
            },
          ],
          onClick: context => {
            void this.setMovementArmed(context.items.map((item: Item) => item.id), true)
          },
        })
        .catch(e => console.warn('[OBRBridge] Aviso ao criar o item de menu de movimento:', e))

      void OBR.contextMenu
        .create({
          id: 'compcon-movement-disarm',
          icons: [
            {
              icon: getTrackerIconUrl('movement-stop'),
              label: i18n.global.t('active.tokenTrackers.movementDisarm'),
              filter: { roles: ['GM', 'PLAYER'], min: 1, max: 1, some: [armado] },
            },
          ],
          onClick: context => {
            void this.setMovementArmed(context.items.map((item: Item) => item.id), false)
          },
        })
        .catch(e => console.warn('[OBRBridge] Aviso ao criar o item de menu de parada:', e))

      // Menu de contexto para vincular token à ficha
      void OBR.contextMenu.create({
        id: 'compcon-bind-token',
        icons: [
          {
            icon: COMPCON_ICON_DATA_URI,
            label: i18n.global.t('active.contextMenu.bindToken'),
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
            label: i18n.global.t('active.contextMenu.openSheet'),
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
   * Metadados da sala: nenhuma ficha (nem o registro de quais fichas estão na
   * mesa) é escrita ali por este fork, então sobram só as ações de mesa e a
   * detecção automática de sala do dddice.
   */
  private setupRoomMetadataListener() {
    OBR.room.onMetadataChange(async (metadata) => {
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
   * Ciclo de vida da cena: entrar numa cena nova limpa marcadores legados de status.
   * As fichas são sincronizadas em tempo real via WebSocket Go (tableSyncSocket).
   */
  private setupSceneListeners() {
    OBR.scene.onReadyChange(async (ready) => {
      if (ready) {
        console.log('[OBRBridge] Nova cena ativada no Owlbear Rodeo.')
        void statusMarkerService.cleanupLegacyMarkers().catch(() => { })
      }
    })
  }

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
   * Trata mensagens recebidas tanto do OBR Broadcast quanto do BroadcastChannel local entre abas.
   * As fichas da mesa trafegam via WebSocket Go; o broadcast cuida de rolagens, UI e ações.
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
      if (msg.type === 'RESTORE_MAIN_WINDOW') {
        // Reexibe a janela persistente da ficha (mesmo iframe, sem recarregar).
        const { restoreSheetWindow } = await import('./mainWindow')
        await restoreSheetWindow()
      } else if (msg.type === 'NAVIGATE') {
        // Navegação sem reload: outro iframe pediu para a janela persistente
        // trocar de ficha. Só a própria janela da ficha executa.
        const { isSheetWindowContext } = await import('./mainWindow')
        if (isSheetWindowContext() && msg.path) {
          window.dispatchEvent(new CustomEvent('compcon-navigate', { detail: { path: msg.path } }))
        }
      } else if (msg.type === 'OPEN_SHEET_REQUESTED') {
        window.dispatchEvent(
          new CustomEvent('compcon-open-sheet-requested', {
            detail: { sheetType: msg.sheetType || 'pilot', sheetId: msg.sheetId, npcType: msg.npcType },
          })
        )
      } else if (msg.type === 'TABLE_ACTION') {
        window.dispatchEvent(new CustomEvent('compcon-table-action', { detail: msg.action }))
      } else if (msg.type === 'TRACKER_SYNC_REQUEST') {
        // O estado do tracker NÃO trafega por aqui: quem o entrega é o servidor de
        // sincronização (`tableSyncSocket`). Só o PEDIDO de snapshot continua no
        // broadcast, porque o protocolo do servidor ainda não tem esse tipo.
        window.dispatchEvent(new CustomEvent('compcon-tracker-sync-request'))
      } else if (msg.type === 'MOVEMENT_ROUND_RESET') {
        await tokenMovementCapture.resetRoundMovements({
          broadcast: false,
          filter: (msg as { filter?: { sheetId?: string; mechId?: string } }).filter,
        })
      } else if (msg.type === 'ENCOUNTER_STORAGE_UPDATED') {
        const { EncounterStore } = await import('@/stores')
        await EncounterStore().LoadEncounters()
        window.dispatchEvent(new CustomEvent('compcon-encounters-reloaded'))
      } else if (msg.type === 'PILOT_JOIN_REQUEST') {
        window.dispatchEvent(new CustomEvent('compcon-pilot-join-request', { detail: msg }))
      } else if (msg.type === 'PILOT_JOIN_RESPONSE') {
        window.dispatchEvent(new CustomEvent('compcon-pilot-join-response', { detail: msg }))
      } else if (msg.type === 'PILOT_JOIN_CANCEL') {
        window.dispatchEvent(new CustomEvent('compcon-pilot-join-cancel', { detail: msg }))
      } else if (msg.senderName && msg.title) {
        // Evento de rolagem de combate compartilhado
        window.dispatchEvent(new CustomEvent('compcon-combat-roll', { detail: msg }))
      }
    } catch (err) {
      console.warn('[OBRBridge] Erro ao tratar mensagem de broadcast:', err)
    }
  }

  /**
   * Envia uma mensagem via BroadcastChannel local (abas locais) e via OBR.broadcast (remoto) com fila e rate limiting
   */
  public async sendBroadcastMessage(payload: any, localOnly: boolean = false): Promise<void> {
    const fullPayload = {
      ...payload,
      msgId: `${this.tabId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderTabId: this.tabId,
      senderId: this.playerId,
    }



    // 1. Envia via window.postMessage para a janela pai/opener ou janelas irmãs.
    // O destino é restrito à nossa própria origem para evitar vazamento de dados de ficha.
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

    // 2. Envia via Owlbear Rodeo broadcast com fila sequencial e rate limiting.
    // Mensagens localOnly (ex.: abrir ficha na própria janela principal) não devem
    // chegar aos outros jogadores da sala.
    if (!localOnly && OBR.isAvailable && this.isReady) {
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

  /**
   * Solicita sincronização das fichas da sala.
   * Na nova arquitetura, o estado completo das fichas ativas é entregue automaticamente
   * pelo servidor Go via INIT_SYNC ao conectar. Mantido para compatibilidade com Startup.ts.
   */
  public async requestSyncFromRoom(): Promise<void> {
    // No-op: o servidor WebSocket Go entrega o snapshot no INIT_SYNC.
  }

  /**
   * Pede sincronização das fichas da sala.
   * Mantido para compatibilidade com o fluxo de inicialização (Startup.ts).
   */
  public async syncFromRoom(): Promise<{ pilotsCount: number; npcsCount: number }> {
    await this.requestSyncFromRoom()
    return { pilotsCount: 0, npcsCount: 0 }
  }

  /**
   * Sincroniza pilotos da mesa locais via WebSocket Go.
   */
  public async broadcastAllLocalPilots(): Promise<void> {
    try {
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilots = PilotStore().Pilots
      const roster = await this.getTablePilotRoster()
      const rosterIds = new Set(Object.keys(roster))

      if (pilots && pilots.length > 0) {
        for (const p of pilots) {
          if (rosterIds.has(p.ID)) {
            await this.broadcastSinglePilot(p)
          }
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao sincronizar pilotos locais via WebSocket:', e)
    }
  }

  /**
   * Sincroniza um único piloto com a mesa via WebSocket Go.
   */
  public async broadcastSinglePilot(pilotObj: any, localOnly: boolean = false): Promise<void> {
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
      sanitized.ID = sanitized.id
      sanitized.skills = Array.isArray(sanitized.skills) ? sanitized.skills : []
      sanitized.talents = Array.isArray(sanitized.talents) ? sanitized.talents : []
      sanitized.core_bonuses = Array.isArray(sanitized.core_bonuses) ? sanitized.core_bonuses : []
      sanitized.licenses = Array.isArray(sanitized.licenses) ? sanitized.licenses : []
      sanitized.mechs = Array.isArray(sanitized.mechs) ? sanitized.mechs : []
      sanitized.special_equipment = sanitized.special_equipment || {}

      // Envia via WebSocket em tempo real se conectado (alta eficiência, sem limites de payload)
      // Não sobrescreve com dados do hangar se o piloto já estiver ativo em combate na sala
      const isAlreadyInCombat = roomSyncedSheets.value[id]?.inCombat
      if (tableSyncSocket.IsConnected && !localOnly && !isAlreadyInCombat) {
        console.log(`[OBRBridge][Sync] Sincronizando ficha do piloto "${sanitized.callsign || sanitized.name || id}" (${id}) via WebSocket...`)
        tableSyncSocket.sendSyncFullSheet(id, 'pilot', sanitized)
      }
    } catch (e) {
      console.warn('[OBRBridge] Falha ao sincronizar piloto via WebSocket:', e)
    }
  }

  /**
   * Sincroniza NPCs da mesa locais via WebSocket Go.
   */
  public async broadcastAllLocalNpcs(): Promise<void> {
    try {
      const { NpcStore } = await import('@/features/gm/store/npc_store')
      const npcs = NpcStore().Npcs
      const roster = await this.getTableNpcRoster()
      const rosterIds = new Set(Object.keys(roster))

      if (npcs && npcs.length > 0) {
        for (const n of npcs) {
          if (rosterIds.has(n.ID)) {
            await this.broadcastSingleNpc(n)
          }
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao sincronizar NPCs locais via WebSocket:', e)
    }
  }

  /**
   * Sincroniza um único NPC com a mesa via WebSocket Go.
   */
  public async broadcastSingleNpc(npcObj: any, localOnly: boolean = false): Promise<void> {
    try {
      const raw = toRaw(npcObj)
      const id = raw?.ID || raw?.id
      if (!id) return
      const serialized = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
      const sanitized = JSON.parse(JSON.stringify(serialized))
      sanitized.id = sanitized.id || sanitized.ID || id
      sanitized.ID = sanitized.id

      // Envia via WebSocket em tempo real se conectado (apenas se não estiver em combate)
      const isNpcInCombat = roomSyncedSheets.value[id]?.inCombat
      if (tableSyncSocket.IsConnected && !localOnly && !isNpcInCombat) {
        tableSyncSocket.sendSyncFullSheet(id, 'npc', sanitized)
      }
    } catch (e) {
      console.warn('[OBRBridge] Falha ao sincronizar NPC via WebSocket:', e)
    }
  }

  // =========================================================================
  // PERSISTÊNCIA & SINCRONIZAÇÃO DE PILOTOS (Independente da cena)
  // =========================================================================

  /**
   * Salva pilotos localmente (IndexedDB), transmite via broadcast para a sala e
   * registra as fichas publicadas no roster LOCAL da mesa.
   */
  public async savePilotsToRoom(pilots: any[], forcePublish: boolean = false): Promise<void> {
    if (!this.isReady || !OBR.isAvailable || this.isSyncingFromRemote) return
    try {
      this.isSavingToRemote = true
      const { Pilot } = await import('@/classes/pilot/Pilot')

      // Roster da mesa é LOCAL (namespaced pela sala): nada de ficha — nem o
      // registro dela — é gravado nos metadados do Owlbear.
      const tableIds = await tableRosterIds('pilot')
      const published: string[] = []

      for (const p of pilots) {
        const raw = toRaw(p)
        const id = raw?.ID || raw?.id
        if (!id) continue

        // Se forcePublish for falso, só publica ficha que já está na mesa
        if (!forcePublish && !tableIds.has(id)) {
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
        sanitized.ID = sanitized.id
        sanitized.skills = Array.isArray(sanitized.skills) ? sanitized.skills : []
        sanitized.talents = Array.isArray(sanitized.talents) ? sanitized.talents : []
        sanitized.core_bonuses = Array.isArray(sanitized.core_bonuses) ? sanitized.core_bonuses : []
        sanitized.licenses = Array.isArray(sanitized.licenses) ? sanitized.licenses : []
        sanitized.mechs = Array.isArray(sanitized.mechs) ? sanitized.mechs : []
        sanitized.special_equipment = sanitized.special_equipment || {}

        // 1. Persiste no IndexedDB local de quem está salvando (nunca perde dados)
        await SetItem('pilots', sanitized)

        // 2. Sincroniza via WebSocket com a mesa
        await this.broadcastSinglePilot(sanitized)

        published.push(id)
      }

      if (published.length > 0) {
        // 3. Registra na mesa apenas no roster local: quem monta a lista da mesa é
        // o armazenamento desta janela, nunca o metadata da sala.
        await addToTableRoster('pilot', published)

        // Notifica componentes locais da janela atual imediatamente
        for (const id of published) {
          window.dispatchEvent(new CustomEvent('compcon-pilot-synced', { detail: { pilotId: id } }))
        }
      }

      console.log(`[OBRBridge] ${published.length} piloto(s) sincronizado(s) via WebSocket + local.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao salvar pilotos:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Salva um único piloto na sala (publica no roster da mesa e no WebSocket)
   */
  public async savePilotToRoom(pilot: any, forcePublish: boolean = true): Promise<void> {
    await this.savePilotsToRoom([pilot], forcePublish)
  }

  /**
   * Tira o piloto do roster local da mesa, notifica via WebSocket e
   * desvincula os tokens que apontavam para ele.
   */
  public async removePilotFromRoom(pilotId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      this.isSavingToRemote = true

      // 1. Notifica o servidor de sincronização WebSocket
      tableSyncSocket.sendRemoveSheet(pilotId, 'pilot')
      window.dispatchEvent(new CustomEvent('compcon-pilot-removed', { detail: { pilotId } }))

      // 2. Sai do roster LOCAL da mesa (nada de ficha vive em metadados do Owlbear)
      await removeFromTableRoster('pilot', pilotId)

      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (isSceneReady) {
        try {
          // 3. Desvincula qualquer token da cena que estivesse vinculado a este piloto
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
              await statusMarkerService.clearTokenStatusMarkers(it.id).catch(() => { })
              await tokenTrackerService.clearItems(it.id).catch(() => { })
              await tokenTrackerService.clearSummary(it.id).catch(() => { })
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
  public async saveNpcsToRoom(npcs: any[], forcePublish: boolean = false): Promise<void> {
    if (!this.isReady || !OBR.isAvailable || this.isSyncingFromRemote) return
    try {
      this.isSavingToRemote = true

      // Roster da mesa é LOCAL (namespaced pela sala): nada de ficha — nem o
      // registro dela — é gravado nos metadados do Owlbear.
      const tableIds = await tableRosterIds('npc')
      const published: string[] = []

      for (const n of npcs) {
        const raw = toRaw(n)
        const id = raw.ID || raw.id
        if (!id) continue

        // Se forcePublish for falso, só publica ficha que já está na mesa
        if (!forcePublish && !tableIds.has(id)) {
          continue
        }

        const serialized = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
        const sanitized = JSON.parse(JSON.stringify(serialized))
        sanitized.id = sanitized.id || sanitized.ID || id
        sanitized.ID = sanitized.id

        // 1. Persiste no IndexedDB local
        await SetItem('npcs', sanitized)

        // 2. Sincroniza via WebSocket com a mesa
        await this.broadcastSingleNpc(sanitized)

        published.push(id)
      }

      if (published.length > 0) {
        // 3. Registra na mesa apenas no roster local desta janela
        await addToTableRoster('npc', published)

        // Notifica componentes locais da janela atual imediatamente
        for (const id of published) {
          window.dispatchEvent(new CustomEvent('compcon-npc-synced', { detail: { npcId: id } }))
        }
      }

      console.log(`[OBRBridge] ${published.length} NPC(s) sincronizado(s) via WebSocket + local.`)
    } catch (err) {
      console.error('[OBRBridge] Erro ao salvar NPCs:', err)
    } finally {
      this.isSavingToRemote = false
    }
  }

  /**
   * Salva um único NPC na sala (registra no roster local da mesa e no WebSocket)
   */
  public async saveNpcToRoom(npc: any, forcePublish: boolean = true): Promise<void> {
    await this.saveNpcsToRoom([npc], forcePublish)
  }

  /**
   * Tira o NPC do roster local da mesa, notifica via WebSocket e
   * desvincula os tokens que apontavam para ele.
   */
  public async removeNpcFromRoom(npcId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    try {
      this.isSavingToRemote = true

      // 1. Notifica o servidor de sincronização WebSocket
      tableSyncSocket.sendRemoveSheet(npcId, 'npc')
      window.dispatchEvent(new CustomEvent('compcon-npc-removed', { detail: { npcId } }))

      // 2. Sai do roster LOCAL da mesa (nada de ficha vive em metadados do Owlbear)
      await removeFromTableRoster('npc', npcId)

      const isSceneReady = await OBR.scene.isReady().catch(() => false)
      if (isSceneReady) {
        try {
          // 3. Desvincula qualquer token da cena
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
              await statusMarkerService.clearTokenStatusMarkers(it.id).catch(() => { })
              await tokenTrackerService.clearItems(it.id).catch(() => { })
              await tokenTrackerService.clearSummary(it.id).catch(() => { })
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
   * Envia os NPCs da mesa locais via broadcast (roster local)
   */
  public async pushAllLocalNpcsToRoom(): Promise<number> {
    const { NpcStore } = await import('@/features/gm/store/npc_store')
    const npcs = NpcStore().Npcs
    await this.saveNpcsToRoom(npcs, false)
    return npcs.length
  }

  // =========================================================================
  // CRIAÇÃO AUTOMÁTICA DE TOKENS A PARTIR DE FICHAS
  // =========================================================================

  /**
   * Verifica se a criação automática de token ao abrir uma ficha está habilitada.
   * Padrão: habilitada.
   */
  public isAutoCreateTokenEnabled(): boolean {
    try {
      const raw = localStorage.getItem(COMPCON_AUTO_TOKEN_STORAGE_KEY)
      if (raw === null) return true
      return raw !== 'false' && raw !== '0'
    } catch {
      return true
    }
  }

  /**
   * Habilita/desabilita a criação automática de token ao abrir uma ficha.
   */
  public setAutoCreateTokenEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(COMPCON_AUTO_TOKEN_STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
      // ignore
    }
  }

  /**
   * Cria um token na cena do Owlbear Rodeo para uma ficha de Piloto ou NPC,
   * caso ainda não exista um token vinculado a ela.
   * Usa o retrato da ficha quando há uma URL HTTP(S) válida; caso contrário
   * usa a imagem padrão (nodata) correspondente ao tipo.
   */
  public async createTokenForSheet(sheet: any, type: 'pilot' | 'npc'): Promise<string | null> {
    if (!this.isReady || !OBR.isAvailable) return null
    const sheetId = sheet?.ID || sheet?.id
    if (!sheet || !sheetId) return null
    // Modo leitura nunca gera token no mapa.
    if (isSheetReadOnlySession()) return null
    if (!this.isAutoCreateTokenEnabled()) return null

    try {
      const sceneReady = await OBR.scene.isReady().catch(() => false)
      if (!sceneReady) return null

      const mechId = type === 'pilot' ? (sheet.ActiveMech?.ID || sheet.ActiveMech?.id) : undefined

      // Evita duplicar: já existe token vinculado a esta ficha (ou ao mecha ativo)?
      const existing = await OBR.scene.items.getItems((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        if (!meta) return false
        if (meta.sheetId === sheetId) return true
        if (mechId && meta.mechId === mechId) return true
        return false
      })
      if (existing.length > 0) return existing[0].id

      // Para pilotos, usa a imagem do mecha ativo (arte do frame/retrato do mecha);
      // para NPCs (e pilotos sem mecha), usa o retrato da própria ficha.
      const portraitSource = type === 'pilot' ? (sheet.ActiveMech || sheet) : sheet
      const portrait = typeof portraitSource.Portrait === 'string' ? portraitSource.Portrait : ''

      // O Owlbear Rodeo carrega a imagem do token via fetch() (não <img>), o que exige CORS.
      // Hosts sabidamente sem CORS (ex.: CloudFront do COMP/CON) passam direto pelo nosso
      // proxy (/api/image) para evitar poluir o console do navegador com erros de CORS.
      let imageUrl = this.resolveTokenImageUrl(portrait, type)
      let tokenUrl = imageUrl
      let fetched: { ok: boolean; blob?: Blob } = { ok: false }

      if (this.isKnownNoCorsHost(imageUrl)) {
        const proxied = this.proxyImageUrl(imageUrl)
        if (proxied) {
          tokenUrl = proxied
          fetched = await this.fetchImageBlob(proxied)
        }
      } else {
        fetched = await this.fetchImageBlob(imageUrl)
        if (!fetched.ok) {
          const proxied = this.proxyImageUrl(imageUrl)
          if (proxied) {
            tokenUrl = proxied
            fetched = await this.fetchImageBlob(proxied)
          }
        }
      }

      if (!fetched.ok) {
        imageUrl = this.defaultTokenUrl(type)
        tokenUrl = imageUrl
        fetched = await this.fetchImageBlob(imageUrl)
      }

      const dims = fetched.ok && fetched.blob
        ? await this.getBlobDimensions(fetched.blob)
        : { width: 512, height: 512 }
      const mime = (fetched.ok && fetched.blob && fetched.blob.type) || this.inferMime(imageUrl)

      const size = this.getSheetSize(sheet, type)
      const dpi = (await OBR.scene.grid.getDpi().catch(() => 150)) || 150
      const name = this.resolveSheetName(sheet, type)

      const w = dims.width || 512
      const h = dims.height || 512
      // Escala uniforme para o token ocupar `size` células de grid na largura.
      const s = (size * dpi) / w

      const token = buildImage(
        { width: w, height: h, mime, url: tokenUrl },
        { offset: { x: w / 2, y: h / 2 }, dpi }
      )
        .name(name)
        .position(await this.viewportCenter())
        .scale({ x: s, y: s })
        .layer('CHARACTER')
        .metadata({
          [COMPCON_METADATA_KEY]: {
            sheetType: type,
            sheetId: sheetId,
            ...(mechId ? { mechId } : {}),
          },
        })
        .build()

      await OBR.scene.items.addItems([token])
      await OBR.notification.show(`Token criado: ${name}`).catch(() => { })
      return token.id
    } catch (e) {
      console.warn('[OBRBridge] Erro ao criar token para ficha:', e)
      return null
    }
  }

  /**
   * Identifica se a URL pertence a um host que sabidamente não envia cabeçalhos CORS
   * (como o CloudFront do COMP/CON). Fazer fetch direto pelo navegador nesses hosts
   * faz o engine do browser disparar erros vermelhos de CORS no console antes do try/catch.
   */
  private isKnownNoCorsHost(url: string): boolean {
    try {
      const u = new URL(url)
      const host = u.hostname.toLowerCase()
      return host.endsWith('cloudfront.net') || host.endsWith('compcon.app')
    } catch {
      return false
    }
  }

  /**
   * Resolve uma URL HTTP(S) válida e absoluta para o token a partir do retrato da ficha.
   * URLs `data:`/`blob:` e caminhos inválidos são rejeitados pelo loader do Owlbear Rodeo
   * e, nesses casos, retorna a imagem padrão.
   */
  private resolveTokenImageUrl(portrait: string | undefined | null, type: 'pilot' | 'npc'): string {
    const raw = typeof portrait === 'string' ? portrait.trim() : ''
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return this.defaultTokenUrl(type)
    }
    try {
      const u = new URL(raw, window.location.origin)
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    } catch {
      // URL inválida
    }
    if (raw.startsWith('/')) return window.location.origin + raw
    return this.defaultTokenUrl(type)
  }

  /**
   * URL absoluta da imagem padrão usada quando a ficha não tem retrato utilizável.
   */
  private defaultTokenUrl(type: 'pilot' | 'npc'): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const path = type === 'pilot' ? '/img/pilot/nodata.webp' : '/img/npc/nodata.webp'
    return origin + path
  }

  /**
   * Reescreve a URL da imagem para passar pelo nosso proxy (/api/image), que baixa
   * a imagem no servidor e devolve com `Access-Control-Allow-Origin: *`. Retorna null
   * para URLs já na nossa origem ou que não sejam http(s).
   */
  private proxyImageUrl(url: string): string | null {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      if (!origin) return null
      const u = new URL(url)
      if (u.origin === origin) return null
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      return `${origin}/api/image?url=${encodeURIComponent(url)}`
    } catch {
      return null
    }
  }

  /**
   * Infere o MIME type a partir da extensão do arquivo da imagem.
   */
  private inferMime(url: string): string {
    const clean = url.split(/[?#]/)[0].toLowerCase()
    if (clean.endsWith('.svg')) return 'image/svg+xml'
    if (clean.endsWith('.png')) return 'image/png'
    if (clean.endsWith('.webp')) return 'image/webp'
    if (clean.endsWith('.gif')) return 'image/gif'
    if (clean.endsWith('.avif')) return 'image/avif'
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg'
    return 'image/png'
  }

  /**
   * Busca a imagem via fetch em modo CORS — exatamente como o Owlbear Rodeo faz
   * ao carregar o item. Retorna `ok: false` quando a origem não permite CORS
   * (ex.: o CloudFront da COMP/CON) ou a imagem não existe.
   */
  private async fetchImageBlob(url: string): Promise<{ ok: boolean; blob?: Blob }> {
    try {
      const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(6000)
        : undefined
      const res = await fetch(url, { method: 'GET', mode: 'cors', redirect: 'follow', signal })
      if (!res.ok) return { ok: false }
      const blob = await res.blob()
      return { ok: true, blob }
    } catch {
      return { ok: false }
    }
  }

  /**
   * Obtém as dimensões naturais da imagem a partir do blob (mesma origem após o fetch),
   * para manter a proporção ao escalar. Fallback para 512x512.
   */
  private getBlobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const fallback = { width: 512, height: 512 }
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        resolve(fallback)
        return
      }
      let settled = false
      const done = (width: number, height: number) => {
        if (!settled) {
          settled = true
          resolve({ width: width || 512, height: height || 512 })
        }
      }
      try {
        const objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        const timer = setTimeout(() => {
          URL.revokeObjectURL(objectUrl)
          done(512, 512)
        }, 4000)
        img.onload = () => {
          clearTimeout(timer)
          URL.revokeObjectURL(objectUrl)
          done(img.naturalWidth || 512, img.naturalHeight || 512)
        }
        img.onerror = () => {
          clearTimeout(timer)
          URL.revokeObjectURL(objectUrl)
          done(512, 512)
        }
        img.src = objectUrl
      } catch {
        done(512, 512)
      }
    })
  }

  /**
   * Obtém o SIZE (tamanho em células de grid) da ficha: SIZE do mecha ativo
   * para pilotos, SIZE do NPC para NPCs.
   */
  private getSheetSize(sheet: any, type: 'pilot' | 'npc'): number {
    try {
      if (type === 'pilot') {
        const mech = sheet?.ActiveMech
        const size = mech?.Frame?.Size ?? mech?.StatController?.getMax?.('size')
        if (size) return Math.max(1, Number(size) || 1)
      } else {
        const size = sheet?.StatController?.getMax?.('size')
        if (size) return Math.max(1, Number(size) || 1)
      }
    } catch {
      // ignore
    }
    return 1
  }

  /**
   * Nome de exibição do token: nome do mecha/callsign para pilotos, nome para NPCs.
   */
  private resolveSheetName(sheet: any, type: 'pilot' | 'npc'): string {
    if (type === 'pilot') {
      return sheet.ActiveMech?.Name || sheet.Callsign || sheet.Name || 'Piloto'
    }
    return sheet.Name || 'NPC'
  }

  /**
   * Centro do viewport em coordenadas de cena (para posicionar o token no local visível).
   */
  private async viewportCenter(): Promise<{ x: number; y: number }> {
    try {
      const [pos, scale, width, height] = await Promise.all([
        OBR.viewport.getPosition(),
        OBR.viewport.getScale(),
        OBR.viewport.getWidth(),
        OBR.viewport.getHeight(),
      ])
      const s = scale || 1
      return { x: (width / 2 - pos.x) / s, y: (height / 2 - pos.y) / s }
    } catch {
      return { x: 0, y: 0 }
    }
  }

  // =========================================================================
  // VINCULAÇÃO DE TOKENS E STATUS VISUAIS NO CANVAS
  // =========================================================================

  /**
   * Vincula um token do mapa a uma ficha de Piloto ou NPC.
   *
   * O token recebe APENAS o link (`sheetType`, `sheetId` e, quando houver, os IDs
   * de mecha/combatente). Nenhum dado da ficha — nome, HP, heat, estrutura,
   * stress ou condições — é gravado nos metadados do token: o estado de combate
   * é lido da ficha no armazenamento local, então não há cópia para divergir
   * nem payload para estourar a cota do Owlbear.
   */
  public async bindTokenToSheet(tokenId: string, binding: TokenSheetBinding): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    if (isSheetReadOnlySession()) {
      console.log('[OBRBridge] Ficha em modo leitura: vínculo de token ignorado.')
      return
    }

    const link: Record<string, any> = {
      sheetType: binding.sheetType,
      sheetId: binding.sheetId,
    }
    if (binding.mechId) link.mechId = binding.mechId
    if (binding.combatantId) link.combatantId = binding.combatantId

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        item.metadata[COMPCON_METADATA_KEY] = { ...link }
      }
    })

    const label = binding.name || binding.sheetId
    await OBR.notification.show(`Token vinculado com sucesso a: ${label}`)

    // Marcadores visuais são derivados do estado atual da ficha, não do vínculo.
    if (binding.statuses && binding.statuses.length > 0) {
      await statusMarkerService.syncTokenStatusMarkers(tokenId, binding.statuses).catch(() => { })
    }

    // Trackers: o painel é derivado do estado da ficha, então redesenha já.
    await tokenTrackerService.refreshToken(tokenId).catch(() => { })
  }

  /**
   * Desvincula um token de qualquer ficha
   */
  public async unbindToken(tokenId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    if (isSheetReadOnlySession()) return

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        delete item.metadata[COMPCON_METADATA_KEY]
      }
    })

    // Remove marcadores visuais de status anexados
    await statusMarkerService.clearTokenStatusMarkers(tokenId).catch(() => { })

    // Sem vínculo não há tracker: apaga o painel E o resumo (um resumo órfão
    // continuaria mentindo sobre um token que já não aponta para ficha nenhuma).
    await tokenTrackerService.clearItems(tokenId).catch(() => { })
    await tokenTrackerService.clearSummary(tokenId).catch(() => { })

    await OBR.notification.show('Ficha desvinculada do token.')
  }

  /**
   * Obtém o vínculo (apenas IDs) de ficha de um token
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
        combatantId: meta.combatantId,
      }
    }
    return null
  }

  /**
   * Aplica os marcadores visuais de status nos tokens vinculados a um mecha.
   *
   * O estado de combate (HP/heat/estrutura/stress) NÃO é copiado para o token:
   * ele é lido da ficha. Aqui só sincronizamos os ícones de status, que são
   * itens próprios da cena, e apenas para o token que pediu a atualização.
   */
  public async updateTokenVisuals(tokenId: string, state: MechCombatState) {
    if (!this.isReady || !OBR.isAvailable) return
    if (isSheetReadOnlySession()) return
    if (state.statuses) {
      await statusMarkerService.syncTokenStatusMarkers(tokenId, state.statuses).catch(() => { })
    }
  }

  /**
   * Sincroniza os marcadores de status de todos os tokens vinculados à ficha.
   *
   * O vínculo é resolvido pelos IDs no metadata do token (`sheetId`/`mechId`);
   * nada de estado de combate é persistido no token.
   */
  public async updateTokensForCombatant(sheetId: string, state: MechCombatState) {
    if (!this.isReady || !OBR.isAvailable) return
    if (isSheetReadOnlySession()) return

    const items = await OBR.scene.items.getItems((item) => {
      const meta = item.metadata[COMPCON_METADATA_KEY] as any
      return meta && (meta.sheetId === sheetId || meta.mechId === sheetId)
    })

    if (items.length > 0 && state.statuses) {
      for (const item of items) {
        await statusMarkerService.syncTokenStatusMarkers(item.id, state.statuses).catch(() => { })
      }
    }
  }

  /**
   * Atualiza diretamente os marcadores visuais de um combatente (por ID da ficha ou mecha).
   * Coalesce requisições em rajada para evitar chamadas de cena repetidas.
   */
  public async syncCombatantStatusMarkers(
    combatantId: string,
    statuses: string[],
    originId?: string
  ): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    // Ficha aberta em modo leitura nesta janela: nada é escrito no token.
    if (isSheetReadOnlySession()) {
      console.log('[OBRBridge] Ficha em modo leitura: marcadores de token não sincronizados.')
      return
    }

    this.pendingStatusSyncs.set(combatantId, { statuses, originId })
    if (this.statusSyncTimeout !== null) {
      clearTimeout(this.statusSyncTimeout)
    }

    await new Promise<void>((resolve) => {
      this.statusSyncTimeout = setTimeout(async () => {
        this.statusSyncTimeout = null
        await this.flushPendingStatusSyncs()
        resolve()
      }, 50)
    })
  }

  private async flushPendingStatusSyncs(): Promise<void> {
    if (this.pendingStatusSyncs.size === 0) return
    const entries = Array.from(this.pendingStatusSyncs.entries())
    this.pendingStatusSyncs.clear()

    try {
      const items = await OBR.scene.items.getItems((item) => {
        const meta = item.metadata[COMPCON_METADATA_KEY] as any
        return !!(meta && meta.sheetId)
      })

      for (const [combatantId, { statuses, originId }] of entries) {
        const ids = [combatantId, originId].filter(Boolean) as string[]
        const matching = items.filter((item) => {
          const meta = item.metadata[COMPCON_METADATA_KEY] as any
          if (!meta) return false
          return ids.some(id => meta.sheetId === id || meta.mechId === id || meta.combatantId === id)
        })
        for (const it of matching) {
          await statusMarkerService.syncTokenStatusMarkers(it.id, statuses).catch(() => { })
        }
      }
    } catch (e) {
      console.warn('[OBRBridge] Erro ao sincronizar marcadores de status coalescidos:', e)
    }
  }

  // =========================================================================
  // TOKEN TRACKERS (PV, Blindagem, Calor, Movimento, Estrutura, Estresse)
  // =========================================================================

  /**
   * Liga o serviço de trackers aos stores desta janela.
   *
   * Os stores entram por import dinâmico: eles arrastam dependências do app (classes, content,
   * i18n) e o bridge inicializa no boot de toda janela persistente.
   */
  private async registerTokenTrackerStores(): Promise<void> {
    try {
      const [{ PilotStore }, { NpcStore }, { useTrackerSyncStore }, { PilotSheetStore }, { roomSyncedSheets }] =
        await Promise.all([
          import('@/features/pilot_management/store'),
          import('@/features/gm/store/npc_store'),
          import('@/stores/trackerSyncStore'),
          import('@/features/pilot_management/store/PilotSheetStore'),
          import('@/services/tableSyncSocket'),
        ])

      tokenTrackerService.setStoreAccessors({
        pilot: () => PilotStore(),
        npc: () => NpcStore(),
        cards: () => useTrackerSyncStore().cards,
        // Fichas do MODO ATIVO moram aqui, não em `pilots`.
        sheets: () => PilotSheetStore().PilotSheets,
        // A ficha aberta nesta janela é a fonte mais viva: é nela que o combate escreve.
        activeSheet: () => PilotSheetStore().GetActiveSheet(),
        // O STORE (não a lista): é ele que sabe recarregar do armazenamento quando a
        // janela começa vazia (boot antes de o storage responder).
        sheetsStore: () => PilotSheetStore(),
        // Fichas sincronizadas via WebSocket Go
        syncedSheets: () => roomSyncedSheets.value,
      })

      // "A ficha desta janela": é ela que autoriza este cliente a gravar o resumo
      // do token quando não há GM na sala (§7.6).
      tokenTrackerService.setOwnSheetIdsResolver(() => {
        const sheet: any = PilotSheetStore().GetActiveSheet()
        if (!sheet) return []
        const actor = sheet.Combatant?.actor
        return [sheet.ID, actor?.ID, actor?.ActiveMech?.ID].filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        )
      })

      tokenTrackerLog('bridge', 'stores registrados para os trackers', {
        pilotos: PilotStore().Pilots?.length ?? 0,
        npcs: NpcStore().Npcs?.length ?? 0,
        fichasDaLojaPilotSheet: PilotSheetStore().PilotSheets?.length ?? 0,
        papel: this.role,
      })
    } catch (e) {
      console.warn('[OBRBridge] Falha ao registrar os stores dos token trackers:', e)
    }
  }

  /** Redesenha o painel de um token (ou de todos, sem argumento). */
  public async refreshTokenTrackers(tokenId?: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    if (tokenId) await tokenTrackerService.refreshToken(tokenId)
    else await tokenTrackerService.refreshAll()
  }

  /** Redesenha os tokens que apontam para uma ficha (ela mudou de estado). */
  public async refreshTokenTrackersForSheet(sheetId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    await tokenTrackerService.refreshTokensForSheet(sheetId)
  }

  /** Apaga o painel e o resumo de um token. */
  public async clearTokenTrackers(tokenId: string): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    await tokenTrackerService.clearItems(tokenId)
    await tokenTrackerService.clearSummary(tokenId)
  }

  /** Limpa itens do painel que ficaram órfãos na cena. */
  public async cleanupLegacyTokenTrackers(): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    await tokenTrackerService.cleanupLegacyItems()
  }

  /** Config dos trackers desta sala (sanitizada; nunca lança). */
  public async getRoomTokenTrackerConfig(): Promise<TokenTrackerConfig> {
    if (!this.isReady || !OBR.isAvailable) return sanitizeTokenTrackerConfig(undefined)
    try {
      const metadata = await OBR.room.getMetadata()
      return sanitizeTokenTrackerConfig(metadata?.[TOKEN_TRACKER_ROOM_CONFIG_KEY])
    } catch {
      return sanitizeTokenTrackerConfig(undefined)
    }
  }

  /**
   * Grava a config dos trackers na sala.
   *
   * Só o GM escreve, e só em AÇÃO de UI — nunca disparado por estado de combate.
   */
  public async saveRoomTokenTrackerConfig(config: TokenTrackerConfig): Promise<void> {
    if (!this.isReady || !OBR.isAvailable) return
    if (this.role !== 'GM') return
    try {
      await OBR.room.setMetadata({
        [TOKEN_TRACKER_ROOM_CONFIG_KEY]: sanitizeTokenTrackerConfig(config),
      })
    } catch (e) {
      console.warn('[OBRBridge] Falha ao gravar a config dos token trackers:', e)
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
      const sheetId = c?.actor?.ID || c?.actor?.id || c?.sheetId
      const mechId = c?.actor?.ActiveMech?.ID || c?.actor?.ActiveMech?.id || c?.mechId
      const combatantId = c?.id || c?.combatantId
      const name = (c?.actor?.Name || c?.actor?.name || c?.name || '').trim().toLowerCase()
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
      })
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
    await this.sendBroadcastMessage(JSON.parse(JSON.stringify(rollData)))
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
   * Transmite o snapshot leve do tracker de iniciativa para os jogadores.
   * Sem dados de ficha: só cards de iniciativa, ativações e turno atual.
   *
   * O transporte é o servidor de sincronização: ele entrega o snapshot em tempo real
   * para quem já está na sala e guarda o "encontro salvo" que vai no `INIT_SYNC` de
   * quem abrir a janela depois. O broadcast da sala NÃO carrega mais o tracker.
   */
  public async sendTrackerSync(snapshot: SyncedTrackerSnapshot): Promise<void> {
    tableSyncSocket.sendTrackerSync(JSON.parse(JSON.stringify(snapshot)))
  }

  /**
   * Pede ao Mestre um snapshot atualizado do tracker (usado por quem entra depois).
   *
   * Continua no broadcast da sala: o protocolo do servidor de sincronização não tem
   * um tipo de "pedido de snapshot" (o estado salvo chega no `INIT_SYNC` da conexão).
   */
  public async sendTrackerSyncRequest(): Promise<void> {
    await this.sendBroadcastMessage({ type: 'TRACKER_SYNC_REQUEST' })
  }

  /**
   * Avisa os jogadores que o combate terminou e o tracker não está mais ativo.
   * Também limpa o snapshot guardado no servidor de sincronização, senão quem entrar
   * depois receberia o combate antigo pelo `INIT_SYNC`.
   */
  public async sendTrackerSyncClear(payload?: { encounterId?: string; reason?: string }): Promise<void> {
    tableSyncSocket.sendTrackerClear()
    tableSyncSocket.sendEndEncounter(payload)
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
   * Roster local de pilotos da mesa (`{ [id]: { id, updatedAt } }`).
   *
   * Não vem dos metadados do Owlbear: é o registro que ESTA janela mantém das
   * fichas que publicou ou recebeu na sala atual (ver `services/tableRoster`).
   */
  public async getTablePilotRoster(): Promise<Record<string, any>> {
    return tableRosterEntries('pilot')
  }

  /**
   * Roster local de NPCs da mesa (`{ [id]: { id, updatedAt } }`).
   */
  public async getTableNpcRoster(): Promise<Record<string, any>> {
    return tableRosterEntries('npc')
  }

  /**
   * Obtém os tokens da cena ativa que estão vinculados a fichas do COMP/CON.
   * Retorna apenas o LINK (IDs); o conteúdo da ficha é lido do storage local.
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
            combatantId: meta.combatantId,
            name: meta.name || item.name,
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
            combatantId: meta.combatantId,
            name: meta.name || item.name,
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
