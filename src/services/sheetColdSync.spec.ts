import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveRoomSheet: vi.fn(),
  deleteRoomSheet: vi.fn(),
  notify: vi.fn(async () => undefined),
  obr: { isAvailable: true, roomId: 'room-1' as string | null },
}))

vi.mock('@/io/Storage', () => ({
  Initialize: vi.fn(async () => undefined),
  SetItem: vi.fn(async () => undefined),
  GetItem: vi.fn(async () => null),
  GetAll: vi.fn(async () => []),
  SetAll: vi.fn(async () => undefined),
  RemoveItem: vi.fn(async () => undefined),
  ClearAll: vi.fn(async () => undefined),
  ClearAllData: vi.fn(async () => undefined),
  GetLength: vi.fn(async () => 0),
  GetKeys: vi.fn(async () => []),
  GetTotalStorageSize: vi.fn(async () => 0),
  SetValue: vi.fn(async () => undefined),
  GetValue: vi.fn(async () => null),
  saveAll: vi.fn(async () => undefined),
  storeRegistry: {},
  storageDriver: { value: 'MEMORY' },
  storageIsDurable: { value: true },
}))

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    get isAvailable() {
      return mocks.obr.isAvailable
    },
    get room() {
      return mocks.obr.roomId ? { id: mocks.obr.roomId } : undefined
    },
    player: { id: 'player-1' },
    notification: { show: mocks.notify },
    // O SDK real nunca resolve o handshake aqui; `ensureObrReady()` fica pendente ou
    // resolve `false`, e nada mais do SDK é tocado no boot dos módulos importados.
    onReady: vi.fn(),
  },
}))

vi.mock('@/io/apis/roomStorage', async () => {
  const actual = await vi.importActual<any>('@/io/apis/roomStorage')
  return {
    ...actual,
    saveRoomSheet: mocks.saveRoomSheet,
    deleteRoomSheet: mocks.deleteRoomSheet,
  }
})

import { Pilot } from '@/classes/pilot/Pilot'
import { PilotStore } from '@/features/pilot_management/store'
import { NpcStore } from '@/features/gm/store/npc_store'
import { makePilot, makeNpc } from '@/__tests__/factories'
import {
  queueSheetColdDelete,
  queueSheetColdSaveFromParent,
  queueSheetColdUpsert,
  flushSheetColdSync,
  getSheetColdSyncStatus,
  hasPendingSheetColdSync,
  resetSheetColdSyncState,
} from './sheetColdSync'

/** Deixa o `_save` agendado pelo SaveController (async) rodar. */
const tick = () => vi.advanceTimersByTimeAsync(0)

describe('sheetColdSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetSheetColdSyncState()
    mocks.saveRoomSheet.mockImplementation(async (doc: any) => ({
      ...doc,
      revision: 1,
      updatedAt: new Date().toISOString(),
    }))
    mocks.obr.isAvailable = true
    mocks.obr.roomId = 'room-1'
  })

  afterEach(() => {
    resetSheetColdSyncState()
    vi.useRealTimers()
  })

  describe('ficha do Hangar (piloto)', () => {
    it('vai para o catálogo quando é salva', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      pilot.SaveController.save()
      await tick()
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).toHaveBeenCalledTimes(1)
      const doc = mocks.saveRoomSheet.mock.calls[0][0]
      expect(doc.roomId).toBe('room-1')
      expect(doc.sheetId).toBe(pilot.ID)
      expect(doc.entityType).toBe('pilot')
      expect(doc.name).toBe('Test Pilot')
      expect(typeof doc.payload).toBe('object')
    })

    it('usa last-write-wins: não envia expectedRevision', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet.mock.calls[0][0].expectedRevision).toBeUndefined()
    })

    it('não notifica o usuário (sincronização automática é silenciosa)', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      await flushSheetColdSync()

      expect(mocks.notify).not.toHaveBeenCalled()
    })

    it('cópias de combate do modo ativo ficam de fora', async () => {
      const hangar = makePilot()
      PilotStore().Pilots.push(hangar)

      // É exatamente o que a pilot sheet faz: um clone desacoplado com o mesmo ID.
      const combatCopy = Pilot.Deserialize(JSON.parse(JSON.stringify(Pilot.Serialize(hangar))))
      expect(combatCopy).not.toBe(hangar)

      queueSheetColdSaveFromParent(combatCopy)
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
    })

    it('coalesce rajadas de gravações num único PUT', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      queueSheetColdSaveFromParent(pilot)
      queueSheetColdSaveFromParent(pilot)
      expect(hasPendingSheetColdSync()).toBe(true)

      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).toHaveBeenCalledTimes(1)
    })

    it('segura a rajada no debounce e envia no lote seguinte', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2500)
      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()

      // O teto de espera garante que a ficha não fique pendente para sempre: o
      // SaveController grava duas vezes por save() (leading + trailing), então cada
      // gravação reinicia o debounce.
      await vi.advanceTimersByTimeAsync(12000)
      await vi.waitFor(() => expect(mocks.saveRoomSheet).toHaveBeenCalledTimes(1), {
        timeout: 5000,
        interval: 100,
      })
    })

    it('ignora objetos que não são ficha de catálogo', async () => {
      queueSheetColdSaveFromParent({ ID: 'enc-1', StorageType: 'active_encounters' })
      queueSheetColdSaveFromParent({ ID: 'sheet-1', StorageType: 'pilot_sheets' })

      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
    })
  })

  describe('NPC do roster', () => {
    it('vai para o catálogo com entityType npc', async () => {
      const npc = makeNpc()
      NpcStore().Npcs.push(npc)

      npc.SaveController.save()
      await tick()
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).toHaveBeenCalledTimes(1)
      expect(mocks.saveRoomSheet.mock.calls[0][0].entityType).toBe('npc')
      expect(mocks.saveRoomSheet.mock.calls[0][0].sheetId).toBe(npc.ID)
    })
  })

  describe('exclusão', () => {
    it('remove a ficha do catálogo', async () => {
      queueSheetColdDelete('pilot-1')
      await flushSheetColdSync()

      expect(mocks.deleteRoomSheet).toHaveBeenCalledWith('room-1', 'pilot-1')
      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
    })

    it('cancela o upsert pendente da mesma ficha', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      queueSheetColdDelete(pilot.ID)
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
      expect(mocks.deleteRoomSheet).toHaveBeenCalledWith('room-1', pilot.ID)
    })
  })

  describe('falhas', () => {
    it('não lança; tenta de novo e termina em erro', async () => {
      mocks.saveRoomSheet.mockRejectedValue(new Error('mongo fora do ar'))
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')

      await flushSheetColdSync()
      expect(getSheetColdSyncStatus(pilot.ID)?.state).toBe('pending')

      await flushSheetColdSync()
      await flushSheetColdSync()

      expect(getSheetColdSyncStatus(pilot.ID)?.state).toBe('error')
      expect(getSheetColdSyncStatus(pilot.ID)?.error).toContain('mongo fora do ar')
      expect(hasPendingSheetColdSync()).toBe(false)
    })

    it('não consome tentativa quando está sem rede', async () => {
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)
      queueSheetColdUpsert(pilot, 'pilot')

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      try {
        await flushSheetColdSync()
        expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
        expect(hasPendingSheetColdSync()).toBe(true)
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      }
    })
  })

  describe('sem sala Owlbear', () => {
    it('não faz requisição nem acumula fila', async () => {
      mocks.obr.roomId = null
      const pilot = makePilot()
      PilotStore().Pilots.push(pilot)

      queueSheetColdUpsert(pilot, 'pilot')
      await flushSheetColdSync()

      expect(mocks.saveRoomSheet).not.toHaveBeenCalled()
      expect(hasPendingSheetColdSync()).toBe(false)
    })
  })
})
