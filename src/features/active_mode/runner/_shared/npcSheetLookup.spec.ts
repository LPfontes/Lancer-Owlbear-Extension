import { describe, it, expect } from 'vitest'
import {
  combatantMatchesSheetId,
  combatantSheetIds,
  findEncounterForNpc,
  findNpcCombatant,
  isNpcCombatant,
} from './npcSheetLookup'

function npcCombatant(overrides: Record<string, any> = {}): any {
  return {
    id: 'combatant-1',
    type: 'unit',
    side: 'enemy',
    actor: { ID: 'actor-1', OriginId: 'roster-1' },
    ...overrides,
  }
}

/** Registro como ele fica gravado em `active_encounters` (chaves minúsculas). */
function storedCombatant(overrides: Record<string, any> = {}): any {
  return {
    id: 'combatant-1',
    type: 'unit',
    side: 'enemy',
    actor: { id: 'actor-1', originId: 'roster-1', npcType: 'unit' },
    ...overrides,
  }
}

function encounter(id: string, combatants: any[]): any {
  return { ID: id, Name: id, Combatants: combatants }
}

function storedEncounter(id: string, combatants: any[]): any {
  return { id, name: id, combatants }
}

describe('npcSheetLookup', () => {
  it('reconhece apenas combatentes de NPC', () => {
    expect(isNpcCombatant(npcCombatant())).toBe(true)
    expect(isNpcCombatant(npcCombatant({ type: 'doodad' }))).toBe(true)
    expect(isNpcCombatant(npcCombatant({ type: 'eidolon' }))).toBe(true)
    expect(isNpcCombatant(npcCombatant({ type: 'pilot' }))).toBe(false)
    expect(isNpcCombatant(null)).toBe(false)
  })

  it('casa pelo item do roster (OriginId)', () => {
    expect(combatantMatchesSheetId(npcCombatant(), 'roster-1')).toBe(true)
  })

  it('casa pelo id do ator — encontro importado sem item no roster local', () => {
    const imported = npcCombatant({ actor: { ID: 'imported-actor', OriginId: 'roster-de-outra-maquina' } })
    expect(combatantMatchesSheetId(imported, 'imported-actor')).toBe(true)
    expect(combatantMatchesSheetId(imported, 'roster-de-outra-maquina')).toBe(true)
  })

  it('casa pelo id do combatente', () => {
    expect(combatantMatchesSheetId(npcCombatant(), 'combatant-1')).toBe(true)
  })

  it('não casa com id vazio nem com combatente de piloto', () => {
    expect(combatantMatchesSheetId(npcCombatant(), '')).toBe(false)
    expect(combatantMatchesSheetId(npcCombatant({ type: 'pilot' }), 'roster-1')).toBe(false)
  })

  it('reconhece o registro serializado (chaves minúsculas, npcType no ator)', () => {
    expect(isNpcCombatant(storedCombatant())).toBe(true)
    expect(combatantMatchesSheetId(storedCombatant(), 'roster-1')).toBe(true)
    expect(combatantMatchesSheetId(storedCombatant(), 'actor-1')).toBe(true)
    expect(combatantMatchesSheetId(storedCombatant(), 'combatant-1')).toBe(true)
    expect(combatantMatchesSheetId(storedCombatant(), 'outro')).toBe(false)
    expect(combatantSheetIds(storedCombatant())).toEqual(['roster-1', 'actor-1', 'combatant-1'])
  })

  it('acha o NPC num registro serializado de active_encounters', () => {
    const raw = storedEncounter('e1', [storedCombatant({ actor: { id: 'a1', originId: 'r1' } })])
    expect(combatantMatchesSheetId(raw.combatants[0], 'r1')).toBe(true)
    expect(raw.combatants.some((c: any) => combatantMatchesSheetId(c, 'r1'))).toBe(true)
  })

  it('acha o combatente dentro do encontro', () => {
    const enc = encounter('e1', [npcCombatant(), npcCombatant({ id: 'c2', actor: { ID: 'a2', OriginId: 'r2' } })])
    expect(findNpcCombatant(enc, 'r2')?.id).toBe('c2')
    expect(findNpcCombatant(enc, 'inexistente')).toBeNull()
    expect(findNpcCombatant({ Combatants: null }, 'r2')).toBeNull()
  })

  it('acha o encontro pelo NPC mesmo quando o encontro "atual" é outro', () => {
    const atual = encounter('atual', [npcCombatant({ id: 'c1', actor: { ID: 'a1', OriginId: 'r1' } })])
    const outro = encounter('outro', [npcCombatant({ id: 'c9', actor: { ID: 'a9', OriginId: 'r9' } })])

    expect(findEncounterForNpc([atual, outro], 'r9', 'atual')?.ID).toBe('outro')
    expect(findEncounterForNpc([atual, outro], 'r1', 'atual')?.ID).toBe('atual')
    expect(findEncounterForNpc([atual, outro], 'nao-existe', 'atual')).toBeNull()
    expect(findEncounterForNpc([atual, outro], '', 'atual')).toBeNull()
  })

  it('prefere o encontro atual quando o NPC está em mais de um', () => {
    const atual = encounter('atual', [npcCombatant()])
    const outro = encounter('outro', [npcCombatant()])
    expect(findEncounterForNpc([outro, atual], 'roster-1', 'atual')?.ID).toBe('atual')
  })

  it('funciona com o encontro atual ausente da lista carregada', () => {
    const outro = encounter('outro', [npcCombatant()])
    expect(findEncounterForNpc([outro], 'roster-1', 'id-que-nao-existe')?.ID).toBe('outro')
  })
})
