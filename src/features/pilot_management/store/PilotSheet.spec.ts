import { describe, it, expect } from 'vitest'
import { makeMech, makePilot } from '@/__tests__/factories'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import PilotSheet from './PilotSheet'

/**
 * O modo leitura da ficha do piloto (`pilot-runner?readonly=1`) monta uma cópia
 * efêmera com `preserveCombatState` — sem isso o `SetStats()`/`ResetForEncounter()`
 * do caminho padrão mostraria os máximos em vez dos PV/calor reais.
 */
describe('PilotSheet.FromPilot', () => {
  const damagedPilot = () => {
    const pilot = makePilot({ callsign: 'LEITURA' })
    const mech = makeMech(pilot)
    mech.StatController.setCurrentStat(StatKey.HP, 3, { silent: true })
    mech.StatController.setCurrentStat(StatKey.HEATCAP, 4, { silent: true })
    return { pilot, mech }
  }

  it('zera o estado de combate por padrão (ficha nova de encontro)', () => {
    const { pilot, mech } = damagedPilot()

    const sheet = PilotSheet.FromPilot(pilot)

    const stats = sheet.Pilot.ActiveMech!.StatController
    expect(stats.getCurrent(StatKey.HP)).toBe(stats.getMax(StatKey.HP))
    expect(stats.getCurrent(StatKey.HEATCAP)).toBe(0)
    expect(mech.StatController.getCurrent(StatKey.HP)).toBe(3)
  })

  it('preserva o estado de combate quando é só uma visão', () => {
    const { pilot } = damagedPilot()

    const sheet = PilotSheet.FromPilot(pilot, undefined, { preserveCombatState: true })

    const stats = sheet.Pilot.ActiveMech!.StatController
    expect(stats.getCurrent(StatKey.HP)).toBe(3)
    expect(stats.getCurrent(StatKey.HEATCAP)).toBe(4)
  })
})
