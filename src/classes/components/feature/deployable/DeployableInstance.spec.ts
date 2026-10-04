import { describe, it, expect, beforeEach } from 'vitest'
import { ActivationType } from '@/classes/enums'
import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { Deployable, IDeployableData } from './Deployable'
import { DeployableInstance, deployToCombatant } from './DeployableInstance'
import { StatKey } from '../../combat/stats/Stats'
import { makeMech, makePilot } from '@/__tests__/factories'

const turret = (): IDeployableData =>
  ({
    id: 'dep_test_turret',
    name: 'Test Turret',
    detail: '',
    type: 'Deployable',
    activation: ActivationType.Quick,
    hp: 10,
    armor: 1,
  }) as IDeployableData

function setup() {
  const pilot = makePilot({ name: 'p', callsign: 'P' })
  makeMech(pilot)
  const encounter = new Encounter()
  const instance = new EncounterInstance(undefined, encounter, [pilot])
  const combatant = instance.Combatants[0] as any
  const deployable = deployToCombatant(new Deployable(turret()), combatant)
  return { combatant, deployable }
}

function roundTrip(combatant: any) {
  const data = Encounter.SerializeCombatant(combatant)
  return Encounter.DeserializeCombatant(JSON.parse(JSON.stringify(data)))
}

describe('DeployableInstance serialization', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup()
  })

  it('keeps PV, calor e ações do deployable', () => {
    const { combatant, deployable } = ctx
    deployable.StatController.CurrentStats[StatKey.HP] = 3
    deployable.StatController.CurrentStats[StatKey.HEATCAP] = 2
    deployable.CombatController.MarkActionUsed('act_test_turret')

    const restored = roundTrip(combatant).deployables[0]

    expect(restored.StatController.getCurrent(StatKey.HP)).toBe(3)
    expect(restored.StatController.getCurrent(StatKey.HEATCAP)).toBe(2)
    expect(restored.CombatController.UsedCount('act_test_turret')).toBe(1)
  })

  it('keeps id, number and deployed state', () => {
    const { combatant, deployable } = ctx
    deployable.IsDeployed = false

    const restored = roundTrip(combatant).deployables[0]

    expect(restored.ID).toBe(deployable.ID)
    expect(restored.IsDeployed).toBe(false)
    expect(restored.Name).toBe(deployable.Name)
  })

  it('still deserializes payloads saved before combat data existed', () => {
    const { combatant } = ctx
    const legacy = { name: 'Test Turret', data: turret() }

    const restored = DeployableInstance.Deserialize(legacy as any, combatant)

    expect(restored.ID).toContain('Deployable_')
    expect(restored.IsDeployed).toBe(true)
    expect(restored.StatController.getCurrent(StatKey.HP)).toBe(
      restored.StatController.getMax(StatKey.HP)
    )
  })
})
