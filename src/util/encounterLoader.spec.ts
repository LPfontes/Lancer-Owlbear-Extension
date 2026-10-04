import { describe, it, expect, beforeEach } from 'vitest'
import { ClearAll, GetItem } from '@/io/Storage'
import { EncounterStore, NpcStore } from '@/stores'
import { fixtures } from '@/__tests__/fixtures'
import { loadEncounterFromJsonOrSharecode, materializeEncounterNpcs } from './encounterLoader'

/**
 * Os NPCs de um encontro exportado chegam como INSTÂNCIAS do roster de quem
 * exportou (`is_instance: true`, `originId` = id do roster do autor). Sem
 * materializá-los, nenhuma janela consegue abrir a ficha deles: o id do arquivo
 * não existe em `npcs` e a única cópia é o registro do encontro.
 */
function encounterFixture(): any {
  const fixture = fixtures('encounter', 'v3').find(
    f => (f.data?.combatants?.length ?? 0) > 0
  )
  expect(fixture, 'fixture de encontro v3 com combatentes').toBeTruthy()
  return fixture!.data
}

describe('materializeEncounterNpcs', () => {
  beforeEach(async () => {
    await ClearAll('npcs')
    await ClearAll('active_encounters')
    await ClearAll('encounters')
    NpcStore().Npcs = []
    EncounterStore().ActiveEncounters = []
    EncounterStore().CurrentActiveID = ''
  })

  it('grava no roster os NPCs do encontro usando o originId como id', async () => {
    const data = encounterFixture()
    const rosterId = data.combatants[0].actor.originId

    const imported = await materializeEncounterNpcs(data)

    // Os três combatentes da fixture são instâncias do MESMO NPC do roster.
    expect(imported).toBe(1)

    const npc = NpcStore().getNpcByID(rosterId)
    expect(npc, 'NPC importado para o roster').toBeTruthy()
    expect(npc!.IsInstance).toBe(false)
    expect((npc as any).OriginId).toBe('')
    expect(await GetItem('npcs', rosterId)).toBeTruthy()
  })

  it('não duplica nem sobrescreve um NPC que já existe', async () => {
    const data = encounterFixture()
    await materializeEncounterNpcs(data)
    const before = NpcStore().Npcs.length
    const existing = NpcStore().Npcs[0]

    expect(await materializeEncounterNpcs(data)).toBe(0)
    expect(NpcStore().Npcs).toHaveLength(before)
    expect(NpcStore().Npcs[0]).toBe(existing)
  })

  it('ignora combatentes que não são NPC', async () => {
    const imported = await materializeEncounterNpcs({
      combatants: [
        { type: 'pilot', id: 'p1', actor: { id: 'p1', name: 'Pilot' } },
        { type: 'placeholder', id: 'ph1', actor: { id: 'ph1' } },
      ],
    })

    expect(imported).toBe(0)
    expect(NpcStore().Npcs).toHaveLength(0)
  })

  it('não quebra com dados vazios', async () => {
    expect(await materializeEncounterNpcs(null)).toBe(0)
    expect(await materializeEncounterNpcs({ combatants: [] })).toBe(0)
    const emptyEncounter = fixtures('encounter', 'v3').find(
      f => (f.data?.combatants?.length ?? 0) === 0
    )
    if (emptyEncounter) expect(await materializeEncounterNpcs(emptyEncounter.data)).toBe(0)
  })
})

describe('loadEncounterFromJsonOrSharecode', () => {
  beforeEach(async () => {
    await ClearAll('npcs')
    await ClearAll('active_encounters')
    await ClearAll('encounters')
    NpcStore().Npcs = []
    EncounterStore().ActiveEncounters = []
    EncounterStore().CurrentActiveID = ''
  })

  it('carrega o encontro do JSON, o deixa ativo e materializa os NPCs', async () => {
    const data = encounterFixture()
    const rosterId = data.combatants[0].actor.originId

    const result = await loadEncounterFromJsonOrSharecode(JSON.stringify(data), {
      navigate: false,
    })

    expect(result.importedNpcs).toBe(1)
    expect(EncounterStore().CurrentActiveID).toBe(result.instance.ID)
    expect(EncounterStore().getActiveEncounter(result.instance.ID)).toBeTruthy()
    expect(result.instance.Combatants).toHaveLength(data.combatants.length)
    expect(NpcStore().getNpcByID(rosterId)).toBeTruthy()

    // O registro está no storage: outra janela que releia `active_encounters`
    // encontra o encontro — é disso que o botão de abrir a ficha depende.
    EncounterStore().ActiveEncounters = []
    await EncounterStore().LoadActiveEncounters()
    expect(EncounterStore().getActiveEncounter(result.instance.ID)).toBeTruthy()
  })
})
