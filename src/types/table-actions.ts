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

export function resolveActionCategory(raw?: string, actionId?: string): ActionCategory {
  if (actionId === 'act_brace' || actionId === 'act_overwatch') return 'reaction'
  if (!raw) return 'quick_action'
  const normalized = raw.toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (normalized === 'reaction') return 'reaction'
  if (normalized === 'protocol') return 'protocol'
  if (normalized === 'free' || normalized === 'free_action') return 'free_action'
  if (
    normalized === 'full' ||
    normalized === 'full_action' ||
    normalized === 'full_tech' ||
    normalized === 'fulltech'
  ) {
    return 'full_action'
  }
  if (
    normalized === 'quick' ||
    normalized === 'quick_action' ||
    normalized === 'quick_tech' ||
    normalized === 'quicktech' ||
    normalized === 'invade' ||
    normalized === 'boost' ||
    normalized === 'ram' ||
    normalized === 'grapple'
  ) {
    return 'quick_action'
  }
  if (normalized === 'roll') return 'roll'
  if (normalized === 'damage') return 'damage'
  if (normalized === 'status') return 'status'
  if (normalized === 'chat') return 'chat'
  return 'quick_action'
}

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
