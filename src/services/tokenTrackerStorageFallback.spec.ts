import { describe, expect, it, vi, beforeEach } from 'vitest'
import { tokenTrackerService } from './tokenTrackerService'
import { SetItem } from '@/io/Storage'

describe('tokenTrackerService - fallback de armazenamento e case-insensitivity', { timeout: 15000 }, () => {
  beforeEach(async () => {
    // Configura os accessors vazios (0 pilotos, 0 fichas, 0 npcs) simulando o relato do usuário
    tokenTrackerService.setStoreAccessors({
      pilot: () => ({ Pilots: [], getPilotByID: () => undefined }),
      npc: () => ({ Npcs: [], getNpcByID: () => undefined }),
      cards: () => [],
      sheets: () => [],
      activeSheet: () => null,
      sheetsStore: () => null,
      syncedSheets: () => ({}),
    })
  })

  it('encontra e resolve a ficha diretamente do IndexedDB quando PilotStore tem 0 pilotos', async () => {
    const pilotId = '7ba50a21-11da-40f7-a723-b4fc36cbbe6b'
    const mockPilotData = {
      id: pilotId,
      name: 'Test Pilot',
      callsign: 'Bate-Estaca',
      current_hp: 15,
      max_hp: 15,
      mechs: [
        {
          id: 'mech-123',
          name: 'Pile Bunker Mech',
          current_hp: 20,
          max_hp: 20,
        },
      ],
    }

    await SetItem('pilots', mockPilotData)

    // @ts-expect-error testando método privado
    const result = await tokenTrackerService.actorFromLocalStorage({
      sheetId: pilotId,
      sheetType: 'pilot',
    })

    expect(result).toBeDefined()
    expect(result.source).toContain('IndexedDB(pilots)')
    expect(result.owner).toBeDefined()
  })

  it('encontra a ficha no IndexedDB mesmo com diferença de caixa (case-insensitivity)', async () => {
    const pilotId = '7ba50a21-11da-40f7-a723-b4fc36cbbe6b'
    const mockPilotData = {
      id: pilotId.toUpperCase(),
      name: 'Test Pilot',
      callsign: 'Bate-Estaca',
      current_hp: 15,
      max_hp: 15,
    }

    await SetItem('pilots', mockPilotData)

    // @ts-expect-error testando método privado
    const result = await tokenTrackerService.actorFromLocalStorage({
      sheetId: pilotId.toLowerCase(),
      sheetType: 'pilot',
    })

    expect(result).toBeDefined()
    expect(result.source).toContain('IndexedDB(pilots)')
  })

  it('encontra o piloto no IndexedDB quando o sheetId do token é o ID do mecha', async () => {
    const pilotId = 'pilot-owner-uuid'
    const mechId = '7ba50a21-11da-40f7-a723-b4fc36cbbe6b'
    const mockPilotData = {
      id: pilotId,
      name: 'Pilot with Mech',
      callsign: 'Bate-Estaca',
      current_hp: 10,
      max_hp: 10,
      mechs: [
        {
          id: mechId,
          name: 'Heavy Mech',
          current_hp: 25,
          max_hp: 25,
        },
      ],
    }

    await SetItem('pilots', mockPilotData)

    // @ts-expect-error testando método privado
    const result = await tokenTrackerService.actorFromLocalStorage({
      sheetId: mechId,
      mechId: mechId,
      sheetType: 'pilot',
    })

    expect(result).toBeDefined()
    expect(result.source).toContain('IndexedDB(pilots)')
  })

  it('resolve ficha através de syncedSheets (Go sync)', () => {
    const pilotId = 'synced-pilot-1'
    const mockActor = {
      ID: pilotId,
      Name: 'Synced Pilot',
      CombatController: {
        StatController: {
          getCurrent: (k: string) => (k === 'hp' ? 14 : 0),
          getMax: (k: string) => (k === 'hp' ? 14 : 0),
        },
      },
    }

    tokenTrackerService.setStoreAccessors({
      pilot: () => ({ Pilots: [], getPilotByID: () => undefined }),
      npc: () => ({ Npcs: [], getNpcByID: () => undefined }),
      cards: () => [],
      sheets: () => [],
      syncedSheets: () => ({
        [pilotId]: {
          characterId: pilotId,
          characterType: 'pilot',
          data: mockActor,
        },
      }),
    })

    // @ts-expect-error testando método privado
    const local = tokenTrackerService.readerFromLocalStores({
      sheetId: pilotId,
      sheetType: 'pilot',
    })

    expect(local.reader).toBeDefined()
    expect(local.source).toContain('roomSyncedSheets')
  })

  it('atribui rank 0 para pilotos do Hangar (fora de combate) e rank 1 para fichas ativas (pilot_sheets)', async () => {
    const pilotId = 'pilot-hangar-1'
    const hangarPilot = {
      ID: pilotId,
      Name: 'Hangar Pilot',
      CombatController: {
        StatController: {
          getCurrent: (k: string) => (k === 'hp' ? 16 : 0),
          getMax: (k: string) => (k === 'hp' ? 16 : 0),
        },
      },
    }

    tokenTrackerService.setStoreAccessors({
      pilot: () => ({ Pilots: [hangarPilot], getPilotByID: (id: string) => (id === pilotId ? hangarPilot : undefined) }),
      npc: () => ({ Npcs: [], getNpcByID: () => undefined }),
      cards: () => [],
      sheets: () => [],
      activeSheet: () => null,
      sheetsStore: () => null,
      syncedSheets: () => ({}),
    })

    // @ts-expect-error testando método privado
    const hangarState = await tokenTrackerService.resolveActorState({
      sheetId: pilotId,
      sheetType: 'pilot',
    })

    // Piloto apenas no Hangar não está em combate: rank deve ser 0
    expect(hangarState.rank).toBe(0)

    // Agora simulando com uma ficha ativa de combate no activeSheet
    const activeCombatPilot = {
      ID: pilotId,
      Name: 'Active Combat Pilot',
      CombatController: {
        StatController: {
          getCurrent: (k: string) => (k === 'hp' ? 10 : 0),
          getMax: (k: string) => (k === 'hp' ? 16 : 0),
        },
      },
    }

    tokenTrackerService.setStoreAccessors({
      pilot: () => ({ Pilots: [hangarPilot], getPilotByID: (id: string) => (id === pilotId ? hangarPilot : undefined) }),
      npc: () => ({ Npcs: [], getNpcByID: () => undefined }),
      cards: () => [],
      sheets: () => [],
      activeSheet: () => ({ Pilot: activeCombatPilot, ID: 'active-sheet-id' }),
      sheetsStore: () => null,
      syncedSheets: () => ({}),
    })

    // @ts-expect-error testando método privado
    const combatState = await tokenTrackerService.resolveActorState({
      sheetId: pilotId,
      sheetType: 'pilot',
    })

    // Ficha ativa de combate deve ter rank 1
    expect(combatState.rank).toBe(1)
  })

  it('preserva dados de dano do resumo do token contra template fora de combate do Hangar', async () => {
    const pilotId = 'pilot-damaged-1'
    const hangarPilot = {
      ID: pilotId,
      Name: 'Hangar Pilot',
      CombatController: {
        StatController: {
          getCurrent: (k: string) => (k === 'hp' ? 16 : 0),
          getMax: (k: string) => (k === 'hp' ? 16 : 0),
        },
      },
    }

    tokenTrackerService.setStoreAccessors({
      pilot: () => ({ Pilots: [hangarPilot], getPilotByID: (id: string) => (id === pilotId ? hangarPilot : undefined) }),
      npc: () => ({ Npcs: [], getNpcByID: () => undefined }),
      cards: () => [],
      sheets: () => [],
      activeSheet: () => null,
      sheetsStore: () => null,
      syncedSheets: () => ({}),
    })

    const mockToken = {
      id: 'token-damaged-1',
      name: 'Mech Token',
      metadata: {
        'com.compcon.activemode': {
          sheetId: pilotId,
          sheetType: 'pilot',
          stats: {
            hp: { current: 10, max: 16 },
            heat: { current: 2, max: 5 },
          },
        },
        'com.compcon.activemode.token_tracker_summary': {
          w: 'token',
          t: Date.now(),
          v: {
            pv: [10, 16],
            heat: [2, 5],
          },
        },
      },
    } as any

    const desc = await tokenTrackerService.describeToken(mockToken)
    expect(desc).toBeDefined()
    expect(desc?.hasValues).toBe(true)
  })
})
