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

/**
 * Vínculo entre um token do mapa e uma ficha do COMP/CON.
 *
 * Só carrega IDs: o token guarda um LINK para a ficha (`sheetType` + `sheetId`),
 * nunca o conteúdo dela. Estado de combate (HP, heat, estrutura, stress,
 * condições) e nome vivem exclusivamente na ficha, no armazenamento local.
 *
 * Os campos opcionais `id`, `hp`, `structure`... existem apenas como parâmetro
 * de ENTRADA em chamadas legadas; eles não são gravados nos metadados.
 */
export interface TokenSheetBinding {
  sheetType: 'pilot' | 'npc'
  sheetId: string
  name?: string
  mechId?: string
  combatantId?: string
  hp?: ResourceMeter
  structure?: ResourceMeter
  heat?: ResourceMeter
  stress?: ResourceMeter
  statuses?: MechStatus[]
}

