import { describe, it, expect } from 'vitest'
import { combatantCombatVersion, containerCombatVersions } from './combatVersion'
import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import { makeMech, makePilot } from '@/__tests__/factories'

function fakeCombatant(overrides: Record<string, any> = {}): any {
  return {
    id: 'c1',
    index: 0,
    side: 'ally',
    deployables: [],
    actor: { CombatController: { CombatLogVersion: 0 } },
    ...overrides,
  }
}

describe('combatantCombatVersion', () => {
  it('is stable while nothing changes', () => {
    const combatant = fakeCombatant()
    expect(combatantCombatVersion(combatant)).toBe(combatantCombatVersion(combatant))
  })

  it('changes when the actor controller version changes', () => {
    const combatant = fakeCombatant()
    const before = combatantCombatVersion(combatant)
    combatant.actor.CombatController.CombatLogVersion = 1
    expect(combatantCombatVersion(combatant)).not.toBe(before)
  })

  it('changes when the active mech changes (PV/calor/ações do mech)', () => {
    const combatant = fakeCombatant({
      actor: {
        CombatController: { CombatLogVersion: 0 },
        ActiveMech: { CombatController: { CombatLogVersion: 0 } },
      },
    })
    const before = combatantCombatVersion(combatant)
    combatant.actor.ActiveMech.CombatController.CombatLogVersion = 3
    expect(combatantCombatVersion(combatant)).not.toBe(before)
  })

  it('changes when an eidolon layer changes or the active layer is switched', () => {
    const layers = [
      { CombatController: { CombatLogVersion: 0 } },
      { CombatController: { CombatLogVersion: 0 } },
    ]
    const combatant = fakeCombatant({
      actor: { CombatController: { CombatLogVersion: 0 }, Layers: layers, ActiveLayerIndex: 0 },
    })
    const before = combatantCombatVersion(combatant)
    layers[1].CombatController.CombatLogVersion = 2
    expect(combatantCombatVersion(combatant)).not.toBe(before)

    const afterLayerChange = combatantCombatVersion(combatant)
    combatant.actor.ActiveLayerIndex = 1
    expect(combatantCombatVersion(combatant)).not.toBe(afterLayerChange)
  })

  it('changes when a deployable is added or changes', () => {
    const combatant = fakeCombatant()
    const before = combatantCombatVersion(combatant)
    combatant.deployables.push({ CombatController: { CombatLogVersion: 0 } } as any)
    expect(combatantCombatVersion(combatant)).not.toBe(before)

    const withDeployable = combatantCombatVersion(combatant)
    combatant.deployables[0].CombatController.CombatLogVersion = 4
    expect(combatantCombatVersion(combatant)).not.toBe(withDeployable)
  })

  it('changes with combatant metadata (order, side, status, reinforcement)', () => {
    const combatant = fakeCombatant()
    const states = [
      combatantCombatVersion(combatant),
      combatantCombatVersion({ ...combatant, index: 2 }),
      combatantCombatVersion({ ...combatant, side: 'enemy' }),
      combatantCombatVersion({ ...combatant, status: 'Destroyed' }),
      combatantCombatVersion({ ...combatant, pilotStatus: 'KIA' }),
      combatantCombatVersion({ ...combatant, mechStatus: 'Destroyed' }),
      combatantCombatVersion({ ...combatant, reinforcement: true }),
      combatantCombatVersion({ ...combatant, reinforcementTurn: 3 }),
    ]
    expect(new Set(states).size).toBe(states.length)
  })

  it('ignores combatants without an actor', () => {
    expect(combatantCombatVersion(null)).toBe(0)
    expect(combatantCombatVersion({ id: 'x' })).toBe(0)
  })
})

describe('containerCombatVersions', () => {
  it('returns one version per combatant', () => {
    const versions = containerCombatVersions({
      Combatants: [fakeCombatant(), fakeCombatant({ id: 'c2' })],
    })
    expect(versions).toHaveLength(2)
    expect(versions[0]).toBe(combatantCombatVersion(fakeCombatant()))
  })

  it('is empty for a container without combatants', () => {
    expect(containerCombatVersions(null)).toEqual([])
    expect(containerCombatVersions({})).toEqual([])
  })
})

describe('combatantCombatVersion em um encontro real', () => {
  it('detecta PV e PV máximo do mech do piloto', () => {
    const pilot = makePilot({ name: 'p', callsign: 'P' })
    makeMech(pilot)
    const encounter = new Encounter()
    const instance = new EncounterInstance(undefined, encounter, [pilot])
    const combatant = instance.Combatants[0] as any
    const mech = combatant.actor.ActiveMech

    const before = combatantCombatVersion(combatant)
    mech.StatController.CurrentStats[StatKey.HP] = 1
    const afterDamage = combatantCombatVersion(combatant)
    expect(afterDamage).not.toBe(before)

    mech.StatController.MaxStats[StatKey.HP] = 12
    expect(combatantCombatVersion(combatant)).not.toBe(afterDamage)
  })
})
