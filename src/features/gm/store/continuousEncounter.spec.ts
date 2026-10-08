import { describe, it, expect, beforeEach } from 'vitest'
import { ClearAll, GetValue } from '@/io/Storage'
import { EncounterStore } from './encounter_store'
import { Encounter } from '@/classes/encounter/Encounter'
import { Pilot } from '@/classes/pilot/Pilot'

describe('EncounterStore - Encontro Contínuo da Mesa', () => {
  beforeEach(async () => {
    await ClearAll('active_encounters')
    const store = EncounterStore()
    store.ActiveEncounters = []
    store.CurrentActiveID = ''
  })

  it('cria automaticamente um encontro contínuo quando não há nenhum ativo', async () => {
    const store = EncounterStore()
    expect(store.ActiveEncounters).toHaveLength(0)

    const continuous = await store.ensureContinuousEncounter()
    expect(continuous).toBeDefined()
    expect(continuous.IsActive).toBe(true)
    expect(continuous.Name).toBe('Operação em Andamento')
    expect(store.CurrentActiveID).toBe(continuous.ID)
    expect(store.ActiveEncounters).toHaveLength(1)

    // Chamar novamente deve retornar exatamente a mesma instância
    const again = await store.ensureContinuousEncounter()
    expect(again.ID).toBe(continuous.ID)
  })

  it('reconcilia e adiciona um piloto de forma idempotente no encontro contínuo', async () => {
    const store = EncounterStore()
    const pilot = new Pilot()
    pilot.Callsign = 'WARHOUND'
    const serialized = Pilot.Serialize(pilot)

    // Injeta piloto no encontro contínuo
    const combatant = await store.reconcilePilotCombatant(pilot.ID, serialized)
    expect(combatant).toBeDefined()
    expect(combatant.side).toBe('ally')
    expect(combatant.type).toBe('pilot')

    const activeEnc = await store.ensureContinuousEncounter()
    expect(activeEnc.Combatants).toHaveLength(1)
    expect(activeEnc.Combatants[0].id).toBe(pilot.ID)

    // Reconciliação redundante (segunda chamada) não duplica o combatente
    const duplicateCheck = await store.reconcilePilotCombatant(pilot.ID, serialized)
    expect(duplicateCheck.id).toBe(combatant.id)
    expect(activeEnc.Combatants).toHaveLength(1)
  })

  it('atualiza com template preservando os PCs já conectados', async () => {
    const store = EncounterStore()
    const pilot = new Pilot()
    pilot.Callsign = 'VANGUARD'
    await store.reconcilePilotCombatant(pilot.ID, Pilot.Serialize(pilot))

    const activeEnc = await store.ensureContinuousEncounter()
    expect(activeEnc.Combatants).toHaveLength(1)

    // Cria um template com nome diferente
    const template = new Encounter()
    template.Name = 'Ataque ao Comboio'

    await store.updateContinuousEncounterWithTemplate(template)

    expect(activeEnc.Name).toBe('Ataque ao Comboio')
    // O PC continua presente!
    expect(activeEnc.Combatants.some(c => c.id === pilot.ID)).toBe(true)
  })

  /**
   * O Mestre pode estar com um encontro local diferente do que está rodando na mesa (ou
   * sem encontro nenhum). Ao adotar o combate publicado na sala, o local é SUBSTITUÍDO:
   * combatentes que não estão no snapshot saem, senão sobraria uma mistura de duas
   * iniciativas.
   */
  it('substitui o encontro local pelo combate publicado na sala', async () => {
    const store = EncounterStore()

    const localPilot = new Pilot()
    localPilot.Callsign = 'LOCAL'
    await store.reconcilePilotCombatant(localPilot.ID, Pilot.Serialize(localPilot))

    const roomPilot = new Pilot()
    roomPilot.Callsign = 'DA SALA'

    const adopted = await store.adoptRoomEncounter(
      {
        round: 4,
        cards: [
          {
            id: roomPilot.ID,
            name: 'DA SALA',
            side: 'enemy',
            index: 0,
            number: 2,
            activations: { current: 0, max: 1 },
          },
        ],
      },
      {
        [roomPilot.ID]: {
          characterId: roomPilot.ID,
          characterType: 'pilot',
          data: Pilot.Serialize(roomPilot),
          inCombat: true,
          version: 1,
          updatedAt: 1,
        },
      }
    )

    expect(adopted).toBeTruthy()
    const ids = adopted!.Combatants.map((c: any) => c.actor?.ID ?? c.id)
    expect(ids).toContain(roomPilot.ID)
    expect(ids).not.toContain(localPilot.ID)
    expect(adopted!.Round).toBe(4)
    expect((adopted!.Combatants[0] as any).side).toBe('enemy')
  })

  it('mantém o encontro local quando nenhuma ficha da sala pôde ser materializada', async () => {
    const store = EncounterStore()
    const localPilot = new Pilot()
    localPilot.Callsign = 'LOCAL'
    await store.reconcilePilotCombatant(localPilot.ID, Pilot.Serialize(localPilot))

    const adopted = await store.adoptRoomEncounter(
      { round: 2, cards: [{ id: 'sem-ficha', name: 'Sumido', side: 'enemy' }] },
      {}
    )

    expect(adopted).toBeNull()
    const activeEnc = await store.ensureContinuousEncounter()
    expect(activeEnc.Combatants.some(c => c.id === localPilot.ID)).toBe(true)
  })

  /**
   * Ao recarregar a janela os combatentes apareciam DUPLICADOS (o mesmo card duas vezes):
   * a reconciliação comparava só `c.id`/`actor.ID` exatos e um salvamento antigo já podia
   * ter o mesmo integrante em dois cards. Agora a identidade é comparada por container,
   * ator e piloto de origem — e o encontro se cura ao ser aberto.
   */
  it('não duplica o combatente ao reconciliar o mesmo piloto de novo', async () => {
    const store = EncounterStore()
    const pilot = new Pilot()
    pilot.Callsign = 'REPETIDO'

    await store.reconcilePilotCombatant(pilot.ID, Pilot.Serialize(pilot))
    // Mesmas chamadas que o reload provoca (INIT_SYNC/patch anunciando o mesmo piloto).
    await store.reconcilePilotCombatant(pilot.ID, Pilot.Serialize(pilot))
    await store.reconcilePilotCombatant(pilot.ID.toUpperCase(), Pilot.Serialize(pilot))

    const enc = await store.ensureContinuousEncounter()
    const ids = enc.Combatants.map((c: any) => String(c.id).toLowerCase())
    expect(ids.filter(id => id === pilot.ID.toLowerCase())).toHaveLength(1)
  })

  it('cura um encontro salvo com o mesmo combatente duas vezes', async () => {
    const store = EncounterStore()
    const pilot = new Pilot()
    pilot.Callsign = 'DUPLICADO'
    await store.reconcilePilotCombatant(pilot.ID, Pilot.Serialize(pilot))

    // Simula o salvamento antigo: o mesmo combatente duas vezes na lista.
    const enc = await store.ensureContinuousEncounter()
    enc.Combatants = [enc.Combatants[0], { ...enc.Combatants[0], id: pilot.ID }]

    const healed = await store.ensureContinuousEncounter()
    expect(healed.Combatants).toHaveLength(1)
  })

  it('limpa CurrentActiveID e storage ao remover o encontro ativo', async () => {
    const store = EncounterStore()
    const pilot = new Pilot()
    pilot.Callsign = 'FINAL'
    await store.reconcilePilotCombatant(pilot.ID, Pilot.Serialize(pilot))

    const enc = await store.ensureContinuousEncounter()
    expect(store.CurrentActiveID).toBe(enc.ID)
    expect(await GetValue('current_active_encounter_id')).toBe(enc.ID)

    await store.RemoveEncounterInstance(enc)

    expect(store.CurrentActiveID).toBe('')
    expect(await GetValue('current_active_encounter_id')).toBe('')
    expect(enc.IsActive).toBe(false)
    expect(enc.Autosave).toBe(false)
    expect(store.ActiveEncounters).toHaveLength(0)
  })
})
