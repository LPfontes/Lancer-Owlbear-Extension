export type ActionCategory =
  | 'chat'
  | 'protocol'
  | 'quick_action'
  | 'full_action'
  | 'reaction'
  | 'free_action'
  | 'roll'
  | 'status'
  | 'damage'

export interface DiceRollDetail {
  formula?: string
  total: number
  breakdown?: string
  isCrit?: boolean
  accuracy?: number
}

export interface TableActionItem {
  id: string
  timestamp: number
  senderId?: string
  senderName: string
  actorType?: 'pilot' | 'npc' | 'gm'
  actorId?: string
  category: ActionCategory
  title: string
  detail?: string
  roll?: DiceRollDetail
  targetName?: string
  tags?: string[]
}

export interface BroadcastTableActionPayload {
  type: 'TABLE_ACTION'
  action: TableActionItem
  msgId?: string
  senderTabId?: string
  senderId?: string
}
