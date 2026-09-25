export interface ResourceMeter {
  current: number
  max: number
}

export type MechStatus = 
  | 'Immobilized'
  | 'Stunned'
  | 'Exposed'
  | 'Jammed'
  | 'Lock On'
  | 'Shredded'
  | 'Slowed'
  | 'Prone'
  | 'Hidden'
  | 'Invisible'

export interface MechCombatState {
  id: string
  name: string
  frame: string
  pilotName: string
  role: 'PC' | 'NPC'
  hp: ResourceMeter
  structure: ResourceMeter
  heat: ResourceMeter
  stress: ResourceMeter
  overshield: number
  repairCapacity: ResourceMeter
  armor: number
  evasion: number
  edef: number
  statuses: MechStatus[]
  tokenId?: string
}

export interface CombatRollBroadcast {
  id: string
  senderName: string
  title: string
  detail: string
  rollResult?: number
  type: 'attack' | 'damage' | 'structure' | 'heat' | 'system'
  timestamp: number
}
