/**
 * Protocolo de Sincronização em Tempo Real via WebSocket (Go Sync Server)
 */

export type SyncMessageType =
  | 'INIT_SYNC'
  | 'PILOT_JOIN_COMBAT'
  | 'PATCH_FIELD'
  | 'SYNC_FULL_SHEET'
  | 'REMOVE_SHEET'
  | 'TABLE_ACTION'
  | 'TRACKER_SYNC'
  | 'TRACKER_CLEAR'
  | 'END_ENCOUNTER'
  | 'GM_ONLINE'
  | 'PING'
  | 'PONG'

export interface EndEncounterPayload {
  encounterId?: string
  reason?: string
}

export interface SyncEnvelope<T = any> {
  type: SyncMessageType
  roomId: string
  senderId: string
  timestamp: number
  payload?: T
}

export interface PilotJoinCombatPayload {
  pilotId: string
  pilotData: any
  activeMechId?: string
  sheetId?: string
  version: number
}

export interface PatchFieldPayload {
  characterId: string
  characterType: 'pilot' | 'npc'
  field: string
  value: any
  version: number
}

export interface FullSheetPayload {
  characterId: string
  characterType: 'pilot' | 'npc'
  data: any
  version: number
}

export interface RemoveSheetPayload {
  characterId: string
  characterType: 'pilot' | 'npc'
}

export interface SheetStateEntry {
  characterId: string
  characterType: 'pilot' | 'npc'
  data: any
  inCombat: boolean
  version: number
  updatedAt: number
  /**
   * playerId que anunciou esta ficha na sala (dono da ficha ativa). Preenchido
   * pelo servidor Go; é por ele que o dono recebe de volta os dados da própria
   * ficha ativa ao (re)conectar.
   */
  ownerId?: string
  /**
   * Id do container da ficha do Modo Ativo (a rota `pilot-runner/:id`), anunciado no
   * `PILOT_JOIN_COMBAT`. Permite que uma janela que só conhece o id da ficha peça a
   * cópia certa à sala.
   */
  sheetId?: string
}

export interface InitSyncPayload {
  roomId: string
  sheets: Record<string, SheetStateEntry>
  activeTracker?: any
  gmConnected: boolean
}

export type SocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
