import type {
  SyncEnvelope,
  SyncMessageType,
  PilotJoinCombatPayload,
  PatchFieldPayload,
  FullSheetPayload,
  RemoveSheetPayload,
  InitSyncPayload,
  SocketConnectionStatus,
  SheetStateEntry,
  EndEncounterPayload,
} from '@/types/sync-protocol'
import { ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import { obrPlayerId, obrRole } from './obrRuntime'
import {
  applySerializedCurrentStats,
  isDamagePatchPath,
  patchFieldKey,
  patchFieldTarget,
} from './sheetSyncPaths'
import { equipmentPatchTarget, resolveEquipmentByPath } from './sheetEquipmentPaths'

export const tableSyncStatus = ref<SocketConnectionStatus>('disconnected')
export const roomSyncedSheets = ref<Record<string, SheetStateEntry>>({})

/**
 * Último snapshot do tracker (o "encontro salvo" da mesa) recebido da sala.
 *
 * Fica em um `ref` de módulo — e não só no evento — porque o painel de chat monta
 * DEPOIS do `INIT_SYNC` na maioria dos boots: quem chega tarde lê o snapshot aqui em
 * vez de esperar um novo `TRACKER_SYNC`. `null` = a sala não tem combate publicado.
 */
export const roomSyncedTracker = ref<any>(null)

class TableSyncSocket {
  private ws: WebSocket | null = null
  private status: SocketConnectionStatus = 'disconnected'
  private offlineQueue: SyncEnvelope[] = []
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private customWsUrl: string | null = null
  private activeRoomId: string = ''
  private activePlayerId: string = ''
  private activeRole: 'GM' | 'PLAYER' = 'PLAYER'
  private lastAnnouncedPilotPayload: PilotJoinCombatPayload | null = null
  private hasSyncedRoom = false

  public get Status(): SocketConnectionStatus {
    return this.status
  }

  /**
   * Já recebemos o `INIT_SYNC` desta conexão? Enquanto for `false`, a sala é
   * desconhecida: quem depende do estado dela (ex.: decidir se anuncia a ficha ativa)
   * precisa esperar, senão anuncia por cima de um estado que ainda não chegou.
   */
  public get HasSyncedRoom(): boolean {
    return this.hasSyncedRoom
  }

  public get IsConnected(): boolean {
    return this.status === 'connected' && this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Conecta ao servidor WebSocket da mesa. Sem `wsUrl`, usa `VITE_SYNC_SERVER_URL` ou o
   * padrão `ws://localhost:8080/ws`.
   */
  public async init(options: { wsUrl?: string } = {}): Promise<void> {
    if (options.wsUrl) this.customWsUrl = options.wsUrl

    try {
      if (OBR.isAvailable) {
        this.activeRoomId = OBR.room.id || 'default_room'
        this.activePlayerId = obrPlayerId.value || (await OBR.player.getId().catch(() => 'client_' + Math.random().toString(36).slice(2, 8)))
        this.activeRole = (obrRole.value as 'GM' | 'PLAYER') || 'PLAYER'
      } else {
        this.activeRoomId = 'local_room'
        this.activePlayerId = 'client_' + Math.random().toString(36).slice(2, 8)
        this.activeRole = 'PLAYER'
      }
    } catch {
      this.activeRoomId = 'default_room'
      this.activePlayerId = 'client_' + Math.random().toString(36).slice(2, 8)
      this.activeRole = 'PLAYER'
    }

    this.connect()
  }

  private resolveWsUrl(): string {
    if (this.customWsUrl) return this.customWsUrl

    // 1. Variável de ambiente do Vite
    const envUrl = import.meta.env.VITE_SYNC_SERVER_URL
    if (envUrl) return envUrl

    // 2. Se rodando no navegador, constrói URL relativa ou fallback para localhost:8080
    if (typeof window !== 'undefined') {
      const loc = window.location
      if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        return `ws://localhost:8080/ws`
      }
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${proto}//${loc.host}/ws`
    }

    return 'ws://localhost:8080/ws'
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const baseUrl = this.resolveWsUrl()
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    url.searchParams.set('roomId', this.activeRoomId)
    url.searchParams.set('playerId', this.activePlayerId)
    url.searchParams.set('role', this.activeRole)

    try {
      this.ws = new WebSocket(url.toString())
      this.setupHandlers()
    } catch (err) {
      console.warn('[TableSyncSocket] Falha ao abrir WebSocket:', err)
      this.scheduleReconnect()
    }
  }

  private setStatus(newStatus: SocketConnectionStatus): void {
    this.status = newStatus
    tableSyncStatus.value = newStatus
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('compcon-ws-status', { detail: { status: newStatus } }))
    }
  }

  private setupHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log(`[TableSyncSocket] Conectado ao servidor de sincronização (Sala: ${this.activeRoomId}, Role: ${this.activeRole})`)
      this.setStatus('connected')
      this.reconnectAttempt = 0
      this.startHeartbeat()
      this.flushOfflineQueue()

      // Se é jogador e já havia entrado em combate antes de conectar, re-anuncia
      if (this.activeRole !== 'GM' && this.lastAnnouncedPilotPayload) {
        this.sendPilotJoinCombat(this.lastAnnouncedPilotPayload)
      }
    }

    this.ws.onmessage = async (event: MessageEvent) => {
      try {
        const text = typeof event.data === 'string' ? event.data : ''
        if (!text) return

        // Pode vir mais de uma mensagem separada por \n
        const lines = text.split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          const envelope: SyncEnvelope = JSON.parse(line)
          await this.handleEnvelope(envelope)
        }
      } catch (e) {
        console.warn('[TableSyncSocket] Erro ao processar mensagem recebida:', e)
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.setStatus('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      console.warn('[TableSyncSocket] Erro no socket:', err)
      // onclose será disparado em seguida pelo navegador
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    this.reconnectAttempt++
    // Backoff exponencial com jitter aleatório (máximo 10s)
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempt), 10000)
    const jitter = Math.random() * 1000
    const delay = baseDelay + jitter

    this.setStatus('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.IsConnected) {
        this.sendRaw({
          type: 'PING',
          roomId: this.activeRoomId,
          senderId: this.activePlayerId,
          timestamp: Date.now(),
        })
      }
    }, 45000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private async handleEnvelope(env: SyncEnvelope): Promise<void> {
    switch (env.type) {
      case 'INIT_SYNC': {
        const payload: InitSyncPayload = env.payload
        this.hasSyncedRoom = true
        if (payload?.sheets) {
          roomSyncedSheets.value = { ...payload.sheets }
          try {
            for (const sheet of Object.values(payload.sheets)) {
              if (sheet.characterType === 'pilot' && sheet.data) {
                void this.registerSyncedPilotToStore(sheet.data, sheet.characterId)
              } else if (sheet.characterType === 'npc' && sheet.data) {
                void this.registerSyncedNpcToStore(sheet.data, sheet.characterId)
              }
            }
          } catch (_) {}
        }
        // Combate salvo na sala (`activeTracker`): é o "encontro salvo" que o Combat
        // Tracker deve mostrar já no boot do iframe. Entra pelo MESMO evento do
        // `TRACKER_SYNC` vivo e fica em `roomSyncedTracker` para quem montar depois.
        if (payload?.activeTracker) {
          roomSyncedTracker.value = payload.activeTracker
          window.dispatchEvent(new CustomEvent('compcon-tracker-sync', { detail: payload.activeTracker }))
        }

        window.dispatchEvent(new CustomEvent('compcon-init-sync', { detail: payload }))

        // Se o GM acabou de se conectar/reconectar, executa a reconciliação (Salvaguarda
        // Camada 2). O painel somente-leitura também reconcilia: é o encontro contínuo
        // dele que vira a iniciativa publicada na mesa.
        if (this.activeRole === 'GM' && payload?.sheets) {
          await this.reconcileGmSheets(payload.sheets)
        }
        break
      }

      case 'PILOT_JOIN_COMBAT': {
        const payload: PilotJoinCombatPayload = env.payload
        console.log(`[TableSyncSocket][RECEBIDO] ⬅ PILOT_JOIN_COMBAT recebido da sala para piloto "${payload?.pilotId}" (Mech: "${payload?.activeMechId || 'nenhum'}")`)
        if (payload?.pilotId && payload?.pilotData) {
          roomSyncedSheets.value = {
            ...roomSyncedSheets.value,
            [payload.pilotId]: {
              characterId: payload.pilotId,
              characterType: 'pilot',
              data: payload.pilotData,
              inCombat: true,
              version: payload.version || 1,
              updatedAt: Date.now(),
            },
          }
          void this.registerSyncedPilotToStore(payload.pilotData, payload.pilotId)
        }
        window.dispatchEvent(new CustomEvent('compcon-pilot-join-combat', { detail: payload }))

        // GM insere automaticamente o piloto no encontro contínuo. Vale também para a
        // janela somente-leitura que PUBLICA o tracker (painel de chat): o encontro
        // contínuo é a fonte da iniciativa que essa janela manda para a mesa, e sem os
        // pilotos ela publicava um combate vazio ("Encontro Vazio" para todo mundo).
        // Todos os iframes do mesmo navegador compartilham `active_encounters`, então
        // reconciliar aqui é idempotente com a janela de jogo.
        if (this.activeRole === 'GM' && payload?.pilotId && payload?.pilotData) {
          const { EncounterStore } = await import('@/stores')
          await EncounterStore().reconcilePilotCombatant(payload.pilotId, payload.pilotData)
        }
        break
      }

      case 'PATCH_FIELD': {
        const payload: PatchFieldPayload = env.payload
        console.log(`[TableSyncSocket][RECEBIDO] ⬅ PATCH_FIELD recebido da sala: ${payload?.characterType} "${payload?.characterId}": ${payload?.field} = ${payload?.value} (v${payload?.version})`)
        window.dispatchEvent(new CustomEvent('compcon-patch-field', { detail: payload }))

        // A cópia da sala nesta janela acompanha a versão mesmo em somente-leitura: é ela
        // que numera o próximo patch (uma versão atrasada faz o servidor descartar).
        const known = roomSyncedSheets.value?.[payload?.characterId]
        if (known && Number(payload?.version) > Number(known.version)) {
          roomSyncedSheets.value = {
            ...roomSyncedSheets.value,
            [payload.characterId]: { ...known, version: payload.version, updatedAt: Date.now() },
          }
        }

        await this.applyReceivedPatch(payload)
        break
      }

      case 'TRACKER_SYNC': {
        roomSyncedTracker.value = env.payload ?? null
        window.dispatchEvent(new CustomEvent('compcon-tracker-sync', { detail: env.payload }))
        break
      }

      case 'TRACKER_CLEAR': {
        this.lastAnnouncedPilotPayload = null
        roomSyncedTracker.value = null
        window.dispatchEvent(new CustomEvent('compcon-tracker-clear'))
        break
      }

      case 'END_ENCOUNTER': {
        const payload = env.payload as EndEncounterPayload | undefined
        console.log('[TableSyncSocket][RECEBIDO] ⬅ END_ENCOUNTER recebido da sala', payload)
        this.lastAnnouncedPilotPayload = null
        roomSyncedTracker.value = null

        const nextSheets: Record<string, SheetStateEntry> = {}
        for (const [id, sheet] of Object.entries(roomSyncedSheets.value)) {
          if (sheet.characterType === 'pilot') {
            nextSheets[id] = {
              ...sheet,
              inCombat: false,
              updatedAt: Date.now(),
            }
          }
        }
        roomSyncedSheets.value = nextSheets

        window.dispatchEvent(new CustomEvent('compcon-tracker-clear'))
        window.dispatchEvent(new CustomEvent('compcon-end-encounter', { detail: payload }))
        break
      }

      case 'TABLE_ACTION': {
        window.dispatchEvent(new CustomEvent('compcon-table-action', { detail: env.payload }))
        break
      }

      case 'GM_ONLINE': {
        window.dispatchEvent(new CustomEvent('compcon-gm-online'))
        // Salvaguarda Camada 3: Se o GM ficou online e este jogador já está em combate,
        // re-anuncia o piloto para garantir que o GM o tenha no encontro
        if (this.activeRole !== 'GM' && this.lastAnnouncedPilotPayload) {
          this.sendPilotJoinCombat(this.lastAnnouncedPilotPayload)
        }
        break
      }

      case 'SYNC_FULL_SHEET': {
        const payload: FullSheetPayload = env.payload
        console.log(`[TableSyncSocket][RECEBIDO] ⬅ SYNC_FULL_SHEET recebido da sala para ${payload?.characterType} "${payload?.characterId}" (v${payload?.version})`)
        if (payload?.characterId && payload?.data) {
          roomSyncedSheets.value = {
            ...roomSyncedSheets.value,
            [payload.characterId]: {
              characterId: payload.characterId,
              characterType: payload.characterType,
              data: payload.data,
              inCombat: roomSyncedSheets.value[payload.characterId]?.inCombat ?? false,
              version: payload.version || 1,
              updatedAt: Date.now(),
            },
          }
        }
        window.dispatchEvent(new CustomEvent('compcon-sync-full-sheet', { detail: payload }))
        if (payload?.characterType === 'pilot' && payload.data) {
          void this.registerSyncedPilotToStore(payload.data, payload.characterId)

          // Reconcilia com o encontro ativo — só na janela de jogo: em somente-leitura
          // (painel de chat) o encontro contínuo desta janela não deve ser sobrescrito.
          try {
            const { EncounterStore } = await import('@/stores')
            const encStore = EncounterStore()
            const activeEnc = encStore.getActiveEncounter(encStore.CurrentActiveID)
            if (activeEnc) {
              const combatant = activeEnc.Combatants.find(
                (c: any) => c.id === payload.characterId || c.actor?.ID === payload.characterId
              )
              if (combatant && !(await this.isOwnActiveSheet(payload.characterId))) {
                const { Pilot } = await import('@/classes/pilot/Pilot')
                const updated = Pilot.Deserialize(payload.data)
                combatant.actor = updated
                if (updated.ActiveMech) {
                  updated.ActiveMech.CombatController.CombatLogVersion++
                }
                void activeEnc.Save?.()
              } else if (combatant) {
                console.log(`[TableSyncSocket] Ignorando o eco da própria ficha ativa "${payload.characterId}" para não sobrescrever o estado local.`)
              }
            }
          } catch (e) {
            console.warn('[TableSyncSocket] Falha ao atualizar encontro com SYNC_FULL_SHEET:', e)
          }

          window.dispatchEvent(new CustomEvent('compcon-pilot-synced', { detail: { pilotId: payload.characterId } }))
          window.dispatchEvent(new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: payload.characterId } }))
        } else if (payload?.characterType === 'npc' && payload.data) {
          void this.registerSyncedNpcToStore(payload.data, payload.characterId)
          window.dispatchEvent(new CustomEvent('compcon-npc-synced', { detail: { npcId: payload.characterId } }))
          window.dispatchEvent(new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: payload.characterId } }))
        }
        break
      }

      case 'REMOVE_SHEET': {
        const payload: RemoveSheetPayload = env.payload
        if (payload?.characterId) {
          const next = { ...roomSyncedSheets.value }
          delete next[payload.characterId]
          roomSyncedSheets.value = next
          const kind = payload.characterType === 'npc' ? 'npc' : 'pilot'
          const { removeFromTableRoster } = await import('@/services/tableRoster')
          await removeFromTableRoster(kind, payload.characterId)
          if (kind === 'npc') {
            window.dispatchEvent(new CustomEvent('compcon-npc-removed', { detail: { npcId: payload.characterId } }))
          } else {
            window.dispatchEvent(new CustomEvent('compcon-pilot-removed', { detail: { pilotId: payload.characterId } }))
          }
        }
        window.dispatchEvent(new CustomEvent('compcon-remove-sheet', { detail: payload }))
        break
      }

      case 'PONG':
        // Heartbeat ack
        break
    }
  }

  /**
   * Esta janela é quem está jogando a ficha? Então a cópia local manda: ela é a origem
   * dos deltas e do autosave, e substituí-la pela cópia da sala (que pode estar atrás,
   * ou vir de um servidor reiniciado) era o que apagava PV/calor/estrutura no reload.
   */
  private async isOwnActiveSheet(pilotId: string): Promise<boolean> {
    try {
      const { getActivePinia } = await import('pinia')
      if (!getActivePinia()) return false

      const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
      const activeSheet = PilotSheetStore().GetActiveSheet()
      if (!activeSheet) return false

      return activeSheet.Pilot?.ID === pilotId || (activeSheet as any).PilotID === pilotId
    } catch {
      return false
    }
  }

  /**
   * Reconcilia no GM as fichas com inCombat = true vindas do INIT_SYNC.
   *
   * A janela somente-leitura que publica o tracker (painel de chat) entra aqui também: é
   * o encontro contínuo dela que alimenta a iniciativa publicada na mesa.
   */
  private async reconcileGmSheets(sheets: Record<string, SheetStateEntry>): Promise<void> {
    try {
      const { EncounterStore } = await import('@/stores')
      const store = EncounterStore()
      for (const [id, sheet] of Object.entries(sheets)) {
        if (sheet.characterType === 'pilot' && sheet.inCombat && sheet.data) {
          await store.reconcilePilotCombatant(id, sheet.data)
        }
      }
    } catch (err) {
      console.warn('[TableSyncSocket] Falha na reconciliação de fichas do GM:', err)
    }
  }

  /**
   * Aplica um PATCH_FIELD recebido diretamente no StatController do combatente
   */
  private async applyReceivedPatch(patch: PatchFieldPayload): Promise<void> {
    // O caminho pode vir absoluto ("mechs.0.statuses") ou relativo ("statuses").
    const fieldTarget = patchFieldTarget(patch.field)

    // Equipamento destruído e poder de núcleo não são stats: têm tratamento próprio
    // (o caminho aponta para um nó do JSON, não para o StatController).
    if (equipmentPatchTarget(patch.field) !== 'other') {
      await this.applyMechFlagToTargets(patch)
      return
    }

    try {
      if (patch.characterType === 'pilot') {
        const { PilotStore } = await import('@/features/pilot_management/store')
        const pilot = PilotStore().getPilotByID(patch.characterId)
        if (pilot) {
          // O caminho diz de quem é o stat: `mechs.<i>.…` é o mecha; `stats.current.…` é a
          // ficha do PRÓPRIO piloto (desmontado) — ela não herda nada do mecha.
          const isMechPath = String(patch.field).startsWith('mechs.')
          const statTarget: any = isMechPath ? pilot.ActiveMech : pilot
          const statController = statTarget?.CombatController?.StatController
          if (statController) {
            console.log(`[TableSyncSocket][PATCH_FIELD] Aplicando ${patch.field} em "${pilot.Callsign || pilot.Name}" (${patch.characterId})`)
            if (fieldTarget === 'combatActions' && patch.value) {
              statTarget.CombatController.CombatActions = { ...patch.value }
              statTarget.CombatController.CombatLogVersion++
            } else if (fieldTarget === 'statuses' && Array.isArray(patch.value)) {
              statTarget.CombatController.Statuses = [...patch.value]
              statTarget.CombatController.CombatLogVersion++
            } else {
              this.applyStatDelta(statController, patch.field, patch.value)
            }
          }
        }
      }

      // Se for no encontro ativo do GM ou no Runner do encontro:
      const { EncounterStore } = await import('@/stores')
      const encStore = EncounterStore()
      const activeEnc = encStore.getActiveEncounter(encStore.CurrentActiveID)
      if (activeEnc) {
        const combatant = activeEnc.Combatants.find(c => c.id === patch.characterId || c.actor?.ID === patch.characterId)
        if (combatant?.actor) {
          const targetMech = combatant.actor.ActiveMech
          const targetSc = targetMech?.StatController ?? combatant.actor.CombatController?.StatController
          console.log(`[TableSyncSocket][PATCH_FIELD] Aplicando ${patch.field} no combatente do encontro "${combatant.actor.Callsign || combatant.actor.Name || patch.characterId}"`)
          if (fieldTarget === 'combatActions' && patch.value) {
            if (targetMech?.CombatController) {
              targetMech.CombatController.CombatActions = { ...patch.value }
              targetMech.CombatController.CombatLogVersion++
            }
            if (combatant.actor.CombatController) {
              combatant.actor.CombatController.CombatActions = { ...patch.value }
              combatant.actor.CombatController.CombatLogVersion++
            }
          } else if (fieldTarget === 'statuses' && Array.isArray(patch.value)) {
            if (targetMech?.CombatController) {
              targetMech.CombatController.Statuses = [ ...patch.value ]
              targetMech.CombatController.CombatLogVersion++
            }
            if (combatant.actor.CombatController) {
              combatant.actor.CombatController.Statuses = [ ...patch.value ]
              combatant.actor.CombatController.CombatLogVersion++
            }
          } else if (targetSc) {
            this.applyStatDelta(targetSc, patch.field, patch.value)
            if (targetMech?.CombatController) {
              targetMech.CombatController.CombatLogVersion++
            } else if (combatant.actor.CombatController) {
              combatant.actor.CombatController.CombatLogVersion++
            }
          }
          void activeEnc.Save?.()
        }
      }

      // Atualiza também na ficha ativa do PilotSheetStore se for o piloto atual
      try {
        const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
        const sheetStore = PilotSheetStore()
        const activeSheet = sheetStore.GetActiveSheet()
        if (activeSheet && (activeSheet.Pilot?.ID === patch.characterId || activeSheet.ID === patch.characterId)) {
          const sheetMech = activeSheet.Pilot?.ActiveMech
          const sheetSc = sheetMech?.StatController ?? activeSheet.Pilot?.CombatController?.StatController
          if (fieldTarget === 'combatActions' && patch.value && sheetMech?.CombatController) {
            sheetMech.CombatController.CombatActions = { ...patch.value }
            sheetMech.CombatController.CombatLogVersion++
          } else if (fieldTarget === 'statuses' && Array.isArray(patch.value) && sheetMech?.CombatController) {
            sheetMech.CombatController.Statuses = [ ...patch.value ]
            sheetMech.CombatController.CombatLogVersion++
          } else if (sheetSc) {
            this.applyStatDelta(sheetSc, patch.field, patch.value)
            if (sheetMech?.CombatController) sheetMech.CombatController.CombatLogVersion++
          }
          activeSheet.Save()
        }
      } catch {}

      // Dispara atualização para os Token Trackers do mapa
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: patch.characterId } }))
      }
    } catch (e) {
      console.warn('[TableSyncSocket] Erro ao aplicar patch granular:', e)
    }
  }

  /**
   * Aplica um flag do mech que não é stat — equipamento destruído ou poder de núcleo —
   * em todas as cópias do dono nesta janela (PilotStore, combatente do encontro ativo e
   * ficha ativa), que é o mesmo conjunto que o caminho de stats já atualiza.
   */
  private async applyMechFlagToTargets(patch: PatchFieldPayload): Promise<void> {
    const targets: any[] = []
    let activeSheet: any = null

    try {
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilot = PilotStore().getPilotByID(patch.characterId)
      if (pilot) targets.push(pilot)
    } catch {}

    try {
      const { EncounterStore } = await import('@/stores')
      const encStore = EncounterStore()
      const activeEnc = encStore.getActiveEncounter(encStore.CurrentActiveID)
      const combatant = activeEnc?.Combatants.find(
        (c: any) => c.id === patch.characterId || c.actor?.ID === patch.characterId
      )
      if (combatant?.actor) targets.push(combatant.actor)
    } catch {}

    try {
      const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
      const sheet = PilotSheetStore().GetActiveSheet()
      if (sheet?.Pilot && (sheet.Pilot.ID === patch.characterId || sheet.ID === patch.characterId)) {
        targets.push(sheet.Pilot)
        activeSheet = sheet
      }
    } catch {}

    let applied = 0
    for (const target of targets) {
      if (this.applyMechFlag(target, patch.field, patch.value)) applied++
    }

    if (applied === 0) {
      console.warn(`[TableSyncSocket][PATCH_FIELD] Não foi possível aplicar "${patch.field}" em ${patch.characterId} (item não encontrado nesta cópia).`)
      return
    }

    console.log(`[TableSyncSocket][PATCH_FIELD] ${patch.field} = ${patch.value} aplicado em ${applied} cópia(s) de ${patch.characterId}.`)
    activeSheet?.Save()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: patch.characterId } })
      )
    }
  }

  /** Aplica o flag em UM ator; devolve `false` quando o item/caminho não existe nele. */
  private applyMechFlag(actor: any, field: string, value: any): boolean {
    const target = equipmentPatchTarget(field)
    if (target === 'other' || !actor) return false

    const mechIndex = Number(String(field).split('.')[1])
    const mech =
      actor.Mechs?.[Number.isFinite(mechIndex) && mechIndex >= 0 ? mechIndex : 0] ?? actor.ActiveMech
    if (!mech) return false

    if (target === 'equipmentDestroyed') {
      const resolved = resolveEquipmentByPath(actor, field)
      if (!resolved) return false

      resolved.item.Destroyed = !!value
      // O flag não passa pelo StatController: sem isto o autosave/UI não veem a mudança.
      if (mech.CombatController) mech.CombatController.CombatLogVersion++
      return true
    }

    const cc = mech.CombatController
    if (!cc) return false

    if (target === 'corePower') cc.CorePower = !!value
    else cc.CoreActive = !!value
    cc.CombatLogVersion++
    return true
  }

  private applyStatDelta(statController: any, field: string, value: any): void {
    if (!statController) return
    // Aceita "mechs.0.stats.current.hp" (atual), "stats.current.hp" (legado) ou "hp".
    const key = patchFieldKey(field)
    if (typeof statController.setCurrentStat === 'function') {
      if (key === 'heat' || key === 'heatcap') {
        statController.setCurrentStat('heat', Number(value), { silent: true })
        statController.setCurrentStat('heatcap', Number(value), { silent: true })
      } else {
        statController.setCurrentStat(key, Number(value), { silent: true })
      }
    }
  }

  /**
   * Tipos que uma janela somente-leitura AINDA pode enviar.
   *
   * O que não pode sair daqui é **ficha** (anúncio, patch, ficha completa, remoção): quem
   * tem os controladores vivos é a janela de jogo, e um segundo escritor duplicaria saves
   * no mesmo armazenamento.
   *
  /**
   * Envia um envelope pela rede ou guarda na fila offline se desconectado
   */
  public send(env: SyncEnvelope): void {

    if (this.IsConnected) {
      console.log(`[TableSyncSocket][ENVIO] ➔ [${env.type}] Sala: "${env.roomId}"`, env.payload)
      this.sendRaw(env)
    } else {
      console.log(`[TableSyncSocket] Socket offline, enfileirando mensagem tipo ${env.type}`)
      this.offlineQueue.push(env)
      if (this.offlineQueue.length > 500) {
        this.offlineQueue.shift() // Evita estouro de memória
      }
    }
  }

  private sendRaw(env: SyncEnvelope): void {
    try {
      this.ws?.send(JSON.stringify(env))
    } catch (e) {
      console.warn('[TableSyncSocket] Erro ao enviar pelo socket:', e)
      this.offlineQueue.push(env)
    }
  }

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0 || !this.IsConnected) return
    console.log(`[TableSyncSocket] Despejando ${this.offlineQueue.length} mensagens da fila offline...`)
    while (this.offlineQueue.length > 0 && this.IsConnected) {
      const env = this.offlineQueue.shift()
      if (env) this.sendRaw(env)
    }
  }

  /**
   * Disparo ÚNICO de entrada em combate com a ficha completa serializada
   */
  public sendPilotJoinCombat(payload: PilotJoinCombatPayload): void {
    console.log(`[TableSyncSocket][PILOT_JOIN_COMBAT] Preparando envio de entrada em combate do piloto "${payload.pilotId}" (Mech: "${payload.activeMechId || 'nenhum'}")`)
    this.lastAnnouncedPilotPayload = payload
    if (payload?.pilotId && payload?.pilotData) {
      roomSyncedSheets.value = {
        ...roomSyncedSheets.value,
        [payload.pilotId]: {
          characterId: payload.pilotId,
          characterType: 'pilot',
          data: payload.pilotData,
          inCombat: true,
          version: payload.version || 1,
          updatedAt: Date.now(),
        },
      }
    }
    this.send({
      type: 'PILOT_JOIN_COMBAT',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload,
    })
  }

  /**
   * Disparo de mutação de combate granular em tempo real.
   *
   * A versão também é anotada na cópia local da sala: sem isso esta janela continuava
   * achando que a ficha estava numa versão antiga (ela não recebe os patches das outras
   * janelas do MESMO jogador) e o próximo patch saía com número menor — o servidor
   * descartava e o dano aplicado no tracker não chegava na ficha do jogador.
   */
  public sendPatchField(characterId: string, characterType: 'pilot' | 'npc', field: string, value: any, version: number): void {
    console.log(`[TableSyncSocket][PATCH_FIELD] Preparando alteração de ${characterType} "${characterId}": ${field} = ${value} (v${version})`)

    const known = roomSyncedSheets.value?.[characterId]
    if (known && Number(known.version) < version) {
      roomSyncedSheets.value = {
        ...roomSyncedSheets.value,
        [characterId]: { ...known, version, updatedAt: Date.now() },
      }
    }

    this.send({
      type: 'PATCH_FIELD',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: {
        characterId,
        characterType,
        field,
        value,
        version,
      },
    })
  }

  /**
   * Pede à mesa a ficha que **esta janela não tem**.
   *
   * A sala já espelha as fichas em `roomSyncedSheets` (`INIT_SYNC` + os anúncios), então
   * a resposta não depende de uma nova ida ao servidor: resolve a cópia da sala e a
   * materializa nos stores locais (`pilots`/`npcs` + PilotStore/NpcStore), exatamente
   * como a chegada de um `SYNC_FULL_SHEET`.
   *
   * O `id` pode ser o do piloto/NPC (chave da sala), o do `sheetId` anunciado no
   * `PILOT_JOIN_COMBAT` ou o id de dentro do próprio dado. Devolve `null` quando a sala
   * não conhece essa ficha.
   */
  public async requestSheet(id: string): Promise<any | null> {
    const found = this.findRoomSheet(id)
    if (!found) {
      console.warn(`[TableSyncSocket] Ficha "${id}" não está na sala; nada a solicitar.`)
      return null
    }

    console.log(`[TableSyncSocket] Ficha "${id}" solicitada à mesa: recebida a cópia de "${found.characterId}".`)

    if (found.characterType === 'npc') {
      await this.registerSyncedNpcToStore(found.data, found.characterId)
    } else {
      await this.registerSyncedPilotToStore(found.data, found.characterId)
    }

    return found.data
  }

  /** Procura a ficha na cópia da sala por id do personagem, do `sheetId` ou do dado. */
  private findRoomSheet(
    id: string
  ): { characterId: string; characterType: 'pilot' | 'npc'; data: any } | null {
    if (!id) return null

    const sheets = Object.entries(roomSyncedSheets.value || {})
    const matches = (characterId: string, sheet: SheetStateEntry): boolean => {
      if (!sheet?.data) return false
      if (characterId === id) return true
      if (sheet.sheetId && sheet.sheetId === id) return true
      const data: any = sheet.data
      if (data.id === id || data.ID === id) return true
      // Último recurso: quem pediu passou o piloto de ORIGEM (`PilotInstance.OriginId`) em
      // vez da ficha viva — o dado da sala guarda esse vínculo.
      return !!data.originId && data.originId === id
    }

    for (const [characterId, sheet] of sheets) {
      if (!matches(characterId, sheet)) continue
      return {
        characterId,
        characterType: sheet.characterType === 'npc' ? 'npc' : 'pilot',
        data: sheet.data,
      }
    }

    return null
  }

  /**
   * Envia atualização de snapshot do tracker de iniciativa
   */
  public sendTrackerSync(snapshot: any): void {
    this.send({
      type: 'TRACKER_SYNC',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: snapshot,
    })
  }

  /**
   * Envia comando de limpeza de iniciativa
   */
  public sendTrackerClear(): void {
    this.lastAnnouncedPilotPayload = null
    roomSyncedTracker.value = null
    this.send({
      type: 'TRACKER_CLEAR',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
    })
    window.dispatchEvent(new CustomEvent('compcon-tracker-clear'))
  }

  /**
   * Envia comando para encerrar o encontro e limpar a lista de iniciativa na sala
   */
  public sendEndEncounter(payload?: EndEncounterPayload): void {
    console.log('[TableSyncSocket][ENVIO] ➔ [END_ENCOUNTER] Encerrando encontro e limpando iniciativa', payload)
    this.lastAnnouncedPilotPayload = null
    roomSyncedTracker.value = null

    const nextSheets: Record<string, SheetStateEntry> = {}
    for (const [id, sheet] of Object.entries(roomSyncedSheets.value)) {
      if (sheet.characterType === 'pilot') {
        nextSheets[id] = {
          ...sheet,
          inCombat: false,
          updatedAt: Date.now(),
        }
      }
    }
    roomSyncedSheets.value = nextSheets

    this.send({
      type: 'END_ENCOUNTER',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: payload ?? {},
    })

    window.dispatchEvent(new CustomEvent('compcon-tracker-clear'))
    window.dispatchEvent(new CustomEvent('compcon-end-encounter', { detail: payload }))
  }

  /**
   * Envia requisição HTTP REST para encerrar o encontro e limpar iniciativa
   */
  public async postEndEncounterHttp(payload?: EndEncounterPayload): Promise<boolean> {
    const httpBase = this.customWsUrl
      ? this.customWsUrl.replace(/^ws(s?):/, 'http$1:').replace(/\/ws$/, '')
      : (import.meta.env.VITE_SYNC_SERVER_URL as string)?.replace(/^ws(s?):/, 'http$1:').replace(/\/ws$/, '') || 'http://localhost:8080'
    const url = `${httpBase}/api/rooms/end-encounter`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.activeRoomId || 'default_room',
          encounterId: payload?.encounterId,
          reason: payload?.reason,
        }),
      })
      return res.ok
    } catch (e) {
      console.warn('[TableSyncSocket] Falha ao chamar HTTP end-encounter:', e)
      return false
    }
  }

  /**
   * Envia ação da mesa (rolagem 3D, chat, log)
   */
  public sendTableAction(action: any): void {
    this.send({
      type: 'TABLE_ACTION',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: action,
    })
  }

  public sendSyncFullSheet(characterId: string, characterType: 'pilot' | 'npc', data: any, version: number = 1): void {
    console.log(`[TableSyncSocket][SYNC_FULL_SHEET] Preparando envio de ficha completa de ${characterType} "${characterId}" (v${version})`)
    if (characterId && data) {
      roomSyncedSheets.value = {
        ...roomSyncedSheets.value,
        [characterId]: {
          characterId,
          characterType,
          data,
          inCombat: roomSyncedSheets.value[characterId]?.inCombat ?? false,
          version,
          updatedAt: Date.now(),
        },
      }
    }
    this.send({
      type: 'SYNC_FULL_SHEET',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: {
        characterId,
        characterType,
        data,
        version,
      },
    })
  }

  public sendRemoveSheet(characterId: string, characterType: 'pilot' | 'npc'): void {
    if (characterId) {
      const next = { ...roomSyncedSheets.value }
      delete next[characterId]
      roomSyncedSheets.value = next
    }
    this.send({
      type: 'REMOVE_SHEET',
      roomId: this.activeRoomId,
      senderId: this.activePlayerId,
      timestamp: Date.now(),
      payload: {
        characterId,
        characterType,
      },
    })
  }

  private async registerSyncedPilotToStore(data: any, fallbackId?: string): Promise<void> {
    if (!data) return
    try {
      const pilotId = data.id || data.ID || fallbackId
      if (!pilotId) return
      if (!data.id) data.id = pilotId
      if (!data.ID) data.ID = pilotId

      try {
        const { SetItem } = await import('@/io/Storage')
        await SetItem('pilots', data).catch(() => {})
      } catch (_) {}

      let pilotStore: any = null
      try {
        const { getActivePinia } = await import('pinia')
        if (getActivePinia()) {
          const { PilotStore } = await import('@/features/pilot_management/store')
          pilotStore = PilotStore()
        }
      } catch (_) {}

      let pilotInstance: any = null
      try {
        const { Pilot } = await import('@/classes/pilot/Pilot')
        pilotInstance = Pilot.Deserialize(data)
        if (pilotInstance) {
          if (!pilotInstance.ActiveMech && pilotInstance.Mechs?.length > 0) {
            pilotInstance.ActiveMech = pilotInstance.Mechs[0]
          }
          // `SetStats()` recalcula os MÁXIMOS a partir do conteúdo, mas termina em
          // `resetCurrentStats()`: sem reaplicar o corrente, hidratar a ficha da sala
          // zerava PV/calor/estrutura/estresse/sobreescudo (o "estado perdido" no reload).
          if (typeof pilotInstance.SetStats === 'function') {
            pilotInstance.SetStats()
          }
          if (pilotInstance.ActiveMech && typeof pilotInstance.ActiveMech.SetStats === 'function') {
            pilotInstance.ActiveMech.SetStats()
          }
          applySerializedCurrentStats(pilotInstance, data)
        }
      } catch (err) {
        // Mock ou dado parcial em ambiente de teste
      }

      if (pilotStore && pilotInstance && Array.isArray(pilotStore.Pilots)) {
        const existingIdx = pilotStore.Pilots.findIndex(
          (p: any) => (p.ID || p.id || '').toLowerCase() === pilotId.toLowerCase()
        )
        if (existingIdx !== -1) {
          pilotStore.Pilots.splice(existingIdx, 1, pilotInstance)
        } else {
          pilotStore.Pilots.push(pilotInstance)
        }
      }

      // A cópia local da PRÓPRIA ficha ativa não é sobrescrita pela sala: o guarda fica
      // no handler de `SYNC_FULL_SHEET` (ver `isOwnActiveSheet`).

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('compcon-token-trackers-changed', {
            detail: { sheetId: pilotId },
          })
        )
      }
    } catch (e) {
      console.warn('[TableSyncSocket] Erro ao registrar piloto no store:', e)
    }
  }

  private async registerSyncedNpcToStore(data: any, fallbackId?: string): Promise<void> {
    if (!data) return
    try {
      const npcId = data.id || data.ID || fallbackId
      if (!npcId) return
      if (!data.id) data.id = npcId
      if (!data.ID) data.ID = npcId

      try {
        const { SetItem } = await import('@/io/Storage')
        await SetItem('npcs', data).catch(() => {})
      } catch (_) {}

      let npcStore: any = null
      try {
        const { getActivePinia } = await import('pinia')
        if (getActivePinia()) {
          const { NpcStore } = await import('@/features/gm/store/npc_store')
          npcStore = NpcStore()
        }
      } catch (_) {}

      let npcInstance: any = null
      try {
        if (data.npcType === 'doodad') {
          const { Doodad } = await import('@/classes/npc/doodad/Doodad')
          npcInstance = Doodad.Deserialize(data)
        } else if (data.npcType === 'eidolon') {
          const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon')
          npcInstance = Eidolon.Deserialize(data)
        } else {
          const { Unit } = await import('@/classes/npc/unit/Unit')
          npcInstance = Unit.Deserialize(data)
        }
      } catch (err) {
        // Mock ou dado parcial em ambiente de teste
      }

      if (npcStore && npcInstance && Array.isArray(npcStore.Npcs)) {
        const existingIdx = npcStore.Npcs.findIndex(
          (n: any) => (n.ID || n.id || '').toLowerCase() === npcId.toLowerCase()
        )
        if (existingIdx !== -1) {
          npcStore.Npcs.splice(existingIdx, 1, npcInstance)
        } else {
          npcStore.Npcs.push(npcInstance)
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('compcon-token-trackers-changed', {
            detail: { sheetId: npcId },
          })
        )
      }
    } catch (e) {
      console.warn('[TableSyncSocket] Erro ao registrar NPC no store:', e)
    }
  }

  public disconnect(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }
}

export const tableSyncSocket = new TableSyncSocket()
