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
})
