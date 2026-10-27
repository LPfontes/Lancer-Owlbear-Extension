import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Pilot } from '@/classes/pilot/Pilot'
import PilotSheet from '@/features/pilot_management/store/PilotSheet'

/**
 * Ficha sincronizada pela SALA pode não trazer `brews` (payload antigo, ou dado parcial
 * de outra janela). Isso deixava `_savedBrewData` como `undefined` e o próximo
 * `Pilot.Serialize` — chamado por `PilotSheet.FromPilot`, ou seja, em toda leitura de
 * ficha — estourava com "Cannot read properties of undefined (reading 'forEach')".
 */
describe('BrewController em ficha sincronizada', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  it('serializa de novo uma ficha desserializada sem `brews`', () => {
    const raw: any = { id: crypto.randomUUID(), callsign: 'SEM BREWS', mechs: [] }

    const pilot = Pilot.Deserialize(raw)

    expect(pilot.BrewController.Brews).toEqual([])
    expect(() => Pilot.Serialize(pilot)).not.toThrow()
    expect(() => PilotSheet.FromPilot(pilot, undefined, { preserveCombatState: true })).not.toThrow()
  })
})
