import { describe, it, expect } from 'vitest'
import { makeMech, makePilot } from '@/__tests__/factories'
import { Pilot } from '@/classes/pilot/Pilot'
import {
  activeMechIndex,
  applySerializedCurrentStats,
  isDamagePatchPath,
  mechCombatActionsPath,
  mechStatsPath,
  mechStatusesPath,
  patchFieldKey,
  patchFieldTarget,
} from './sheetSyncPaths'

describe('sheetSyncPaths', () => {
  it('endereça o estado de combate no nó do mech, não na raiz do piloto', () => {
    const pilot = makePilot()
    const mech = makeMech(pilot)

    expect(activeMechIndex(pilot)).toBe(0)
    expect(mech.ID).toBe(pilot.Mechs[0].ID)

    expect(mechStatsPath(0, 'hp')).toBe('mechs.0.stats.current.hp')
    expect(mechCombatActionsPath(0)).toBe('mechs.0.combatActions')
    expect(mechStatusesPath(0)).toBe('mechs.0.statuses')

    // A raiz do piloto tem o `stats` do piloto a pé; o do mecha fica em `mechs[i]`.
    const data: any = Pilot.Serialize(pilot)
    expect(data.stats?.current).toBeDefined()
    expect(data.mechs[0].stats?.current).toBeDefined()
    expect(data.stats).not.toBe(data.mechs[0].stats)
  })

  it('classifica o patch pelo último segmento do caminho', () => {
    expect(patchFieldTarget('mechs.0.stats.current.hp')).toBe('stat')
    expect(patchFieldKey('mechs.0.stats.current.hp')).toBe('hp')
    expect(patchFieldKey('stats.current.heatcap')).toBe('heatcap')
    expect(patchFieldKey('hp')).toBe('hp')

    // O mesmo campo vale como absoluto (novo formato) ou relativo (formato antigo)
    expect(patchFieldTarget('mechs.0.combatActions')).toBe('combatActions')
    expect(patchFieldTarget('combatActions')).toBe('combatActions')
    expect(patchFieldTarget('mechs.0.statuses')).toBe('statuses')
    expect(patchFieldTarget('statuses')).toBe('statuses')
  })

  it('devolve o estado corrente da sala por cima do SetStats() da hidratação', () => {
    const pilot = makePilot()
    const mech = makeMech(pilot)
    mech.SetStats()

    const data: any = Pilot.Serialize(pilot)
    data.mechs[0].stats.current.hp = 7
    data.mechs[0].stats.current.heatcap = 3

    const hydrated = Pilot.Deserialize(data)
    hydrated.SetStats()

    // `SetStats()` termina em `resetCurrentStats()`: o estado corrente se perde.
    expect(hydrated.ActiveMech?.StatController.getCurrent('hp')).not.toBe(7)
    expect(hydrated.ActiveMech?.StatController.getCurrent('heatcap')).not.toBe(3)

    applySerializedCurrentStats(hydrated, data)

    expect(hydrated.ActiveMech?.StatController.getCurrent('hp')).toBe(7)
    expect(hydrated.ActiveMech?.StatController.getCurrent('heatcap')).toBe(3)
  })

  it('ignora dados ausentes ou inválidos sem estourar', () => {
    expect(() => applySerializedCurrentStats(null, null)).not.toThrow()
    expect(() => applySerializedCurrentStats({}, { stats: { current: { hp: 'x' } } })).not.toThrow()
    expect(activeMechIndex({})).toBe(-1)
  })
})

/**
 * Allowlist de `PATCH_FIELD` na janela somente-leitura: ela aplica DANO pelo tracker, mas
 * não pode virar um editor de ficha arbitrário (destruir item, trocar status do mecha...).
 */
describe('isDamagePatchPath', () => {
  it('aceita os caminhos de stat do mecha e do próprio ator', () => {
    expect(isDamagePatchPath('mechs.0.stats.current.hp')).toBe(true)
    expect(isDamagePatchPath('mechs.0.stats.current.heat')).toBe(true)
    expect(isDamagePatchPath('mechs.1.stats.current.overshield')).toBe(true)
    expect(isDamagePatchPath('stats.current.hp')).toBe(true)
    expect(isDamagePatchPath('stats.current.burn')).toBe(true)
  })

  it('recusa qualquer outro caminho', () => {
    expect(isDamagePatchPath('mechs.0.statuses')).toBe(false)
    expect(isDamagePatchPath('mechs.0.combatActions')).toBe(false)
    expect(isDamagePatchPath('mechs.0.loadouts.0.systems.0.destroyed')).toBe(false)
    expect(isDamagePatchPath('hp')).toBe(false)
    expect(isDamagePatchPath('')).toBe(false)
  })
})
