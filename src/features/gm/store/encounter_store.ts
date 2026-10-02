import { GetAll, SetItem, RemoveItem, SetValue, GetValue, saveAll } from '@/io/Storage'
import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { useFolderManagement } from '@/composables/useFolderManagement'
import * as _ from 'lodash-es'
import { Encounter, IEncounterData } from '@/classes/encounter/Encounter'
import { NavStore } from '@/stores/nav'
import type { IndexItem } from '@/stores/nav'
import { CloudController } from '@/classes/components/cloud/CloudController'
import logger from '@/user/logger'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { EncounterArchive } from '@/classes/encounter/EncounterArchive'
import { clearUndoStack } from '@/classes/encounter/EncounterUndoStack'
import { PilotStore } from '@/features/pilot_management/store'
import { TAB_ID } from '@/services/tabId'

function idOf(item: any): string {
  return item?.ID || item?.id || item?._id || ''
}

// A stored copy may only replace a live object when it is strictly newer.
// Otherwise a reload would swap objects out from under the components and the
// encounter runner, which hold references across awaits — the "my edit
// vanished" bug class. Equal or older on disk means the in-memory object is
// authoritative (it is either freshly written or holds unsaved changes).
function storedCopyIsNewer(live: any, stored: any): boolean {
  const storedTime = Number(stored?.save?.lastModified ?? 0)
  const liveTime = Number(live?.SaveController?.LastModified ?? live?.LastModified ?? 0)
  return storedTime > liveTime
}

// Reconcile a stored collection into the live list by ID:
//  - an ID in both keeps the live object unless the stored copy is newer;
//  - an ID only in storage is deserialized and added;
//  - an ID only in memory is dropped, so a deletion made in another window
//    sticks instead of being resurrected from memory.
function mergeByID<T>(
  live: T[],
  stored: any[],
  deserialize: (data: any) => T,
  onError: (err: unknown) => void
): T[] {
  const liveByID = new Map<string, T>()
  for (const item of live) {
    const id = idOf(item)
    if (id) liveByID.set(id, item)
  }

  const merged: T[] = []
  for (const data of stored) {
    const id = idOf(data)
    const current = id ? liveByID.get(id) : undefined
    if (current && !storedCopyIsNewer(current, data)) {
      merged.push(current)
      continue
    }
    try {
      merged.push(deserialize(data))
    } catch (err) {
      onError(err)
    }
  }
  return merged
}

export const EncounterStore = defineStore('encounter', {
  state: () => ({
    Encounters: [] as Encounter[],
    ActiveEncounters: [] as EncounterInstance[],
    ArchivedEncounters: [] as EncounterArchive[],
    Folders: [] as string[],
    CurrentActiveID: '' as string,
  }),
  getters: {
    getEncounterByID: state => (id: string) => {
      return state.Encounters.find(x => x.ID === id)
    },
    getAllLabels: state => {
      return _.uniqBy(
        state.Encounters.flatMap((x: any) => x.NarrativeController.Labels),
        'title'
      )
    },
    getFolders: (state): string[] =>
      _.uniq(
        state.Folders.concat(
          state.Encounters.filter(x => !x.SaveController.IsDeleted).flatMap(
            (x: any) => x.FolderController.Folder
          )
        ).filter(x => !!x)
      ) as string[],
    encounterIndexes: (state): IndexItem[] => {
      const encounters = state.Encounters.filter((x: any) => x && !x.SaveController.IsDeleted)
      return encounters.map((x: any) => ({
        id: x.ID,
        title: x.Name,
        type: 'Encounter',
        pack: '',
        path: `/gm/encounters/${x.ID}`,
        icon: x.Icon || 'cc:encounter',
      }))
    },
  },
  actions: {
    getActiveEncounter(id: string): EncounterInstance | undefined {
      return this.ActiveEncounters.find(
        (x: any) => x?.ID === id || x?._id === id || x?.id === id
      ) as EncounterInstance
    },
    async LoadEncounters(): Promise<void> {
      const all = await GetAll('encounters')
      this.Encounters = mergeByID(
        this.Encounters,
        all,
        x => Encounter.Deserialize(x as IEncounterData),
        err => logger.error('Failed to deserialize encounter, skipping', this, err)
      )
      await this.LoadActiveEncounters()
      await this.LoadArchivedEncounters()
    },

    // Local mutations update this store in place, so the only thing left to do
    // is tell the OTHER windows that their copy of the encounter storage is
    // stale. The sender tab id makes the bridge skip the echo in this window,
    // which used to re-enter LoadEncounters in the middle of a mutation.
    notifyEncounterChange(): void {
      if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
      try {
        const ch = new BroadcastChannel('compcon_obr_local_tabs')
        ch.postMessage({ type: 'ENCOUNTER_STORAGE_UPDATED', senderTabId: TAB_ID })
        ch.close()
      } catch {
        // BroadcastChannel unavailable: there is no other window to notify.
      }
    },

    async LoadActiveEncounters(): Promise<void> {
      const all = await GetAll('active_encounters')
      this.ActiveEncounters = mergeByID(
        this.ActiveEncounters,
        all,
        x => EncounterInstance.Deserialize(x),
        err => logger.error('Failed to deserialize active encounter, skipping', this, err)
      )
      await this.LoadActiveEncounterID()
    },

    async LoadArchivedEncounters(): Promise<void> {
      const all = await GetAll('encounter_archives')
      this.ArchivedEncounters = mergeByID(
        this.ArchivedEncounters,
        all,
        x => EncounterArchive.Deserialize(x),
        err => logger.error('Failed to deserialize encounter archive, skipping', this, err)
      )
    },

    async LoadActiveEncounterID(): Promise<void> {
      const id = await GetValue('current_active_encounter_id')
      if (id) this.CurrentActiveID = id
    },

    AddFolder(payload: string): void {
      useFolderManagement(this.Encounters, this.Folders).AddFolder(payload)
    },

    EditFolder(payload: { old: string; newName: string }): void {
      useFolderManagement(this.Encounters, this.Folders).EditFolder(payload)
    },

    RemoveFolder(payload: string): void {
      useFolderManagement(this.Encounters, this.Folders).RemoveFolder(payload)
    },

    async AddEncounter(payload: Encounter): Promise<void> {
      if (this.Encounters.some(x => x.ID === payload.ID)) {
        logger.warn(`Encounter with ID ${payload.ID} already exists, updating instead.`, this)
        await this.SetEncounter(
          this.Encounters.findIndex(x => x.ID === payload.ID),
          payload
        )
        return
      }

      this.Encounters.push(payload)
      NavStore().updateEncounterEntry(payload)
      await SetItem('encounters', payload.Serialize())
      this.notifyEncounterChange()
    },

    async SetEncounter(index: number, payload: Encounter): Promise<void> {
      if (!this.Encounters[index]) return
      this.Encounters.splice(index, 1, payload)
      NavStore().updateEncounterEntry(payload)
      await SetItem('encounters', payload.Serialize())
      this.notifyEncounterChange()
    },

    async AddEncounterInstance(payload: EncounterInstance): Promise<void> {
      const idx = this.ActiveEncounters.findIndex(x => x.ID === payload.ID)
      if (idx !== -1) {
        logger.warn(
          `EncounterInstance with ID ${payload.ID} already exists, updating instead.`,
          this
        )
        this.ActiveEncounters.splice(idx, 1, payload)
      } else {
        this.ActiveEncounters.push(payload)
      }
      await SetItem('active_encounters', toRaw(payload).Serialize())
      this.notifyEncounterChange()
    },

    ReplaceActiveEncounter(payload: EncounterInstance): void {
      const idx = this.ActiveEncounters.findIndex(x => x.ID === payload.ID)
      if (idx === -1) return
      this.ActiveEncounters.splice(idx, 1, payload)
    },

    async RemoveEncounterInstance(payload: EncounterInstance): Promise<void> {
      this.ActiveEncounters.forEach(x => (x.IsActive = false))
      const id = payload.ID || (payload as any)._id
      const idx = this.ActiveEncounters.findIndex(x => x.ID === id)
      if (idx !== -1) {
        this.ActiveEncounters.splice(idx, 1)
        await RemoveItem('active_encounters', id)
        this.SaveActiveEncounterData()
        clearUndoStack(id)
        this.notifyEncounterChange()
      }
    },

    async ArchiveEncounterInstance(
      payload: EncounterInstance,
      report: string,
      result: string
    ): Promise<void> {
      const archive = EncounterArchive.FromInstance(payload, report, result)
      await this.AddEncounterArchive(archive)
      await this.RouteArchiveToLogbooks(archive)
      await this.RemoveEncounterInstance(payload)
      if (this.CurrentActiveID === payload.ID) {
        this.CurrentActiveID = ''
        await SetValue('current_active_encounter_id', '')
      }
      this.notifyEncounterChange()
    },

    // the common case is a GM running local-roster pilots, which needs no share code and no import
    // screen: the archive goes straight to each participant's logbook
    async RouteArchiveToLogbooks(archive: EncounterArchive): Promise<void> {
      const pilots = PilotStore()
      const logbooks = PilotStore()
      for (const participant of archive.History.participants) {
        if (participant.type !== 'pilot') continue
        const pilot = pilots.getPilotByID(participant.originId || participant.id)
        if (!pilot) continue
        try {
          await logbooks.RecordStream(archive.StreamFor(participant.id), pilot.ID, participant.id)
        } catch (err) {
          logger.error(`Failed to record encounter log for pilot ${pilot.ID}`, this, err)
        }
      }
    },

    async AddEncounterArchive(payload: EncounterArchive): Promise<void> {
      const idx = this.ArchivedEncounters.findIndex(x => x.ID === payload.ID)
      if (idx !== -1) {
        logger.warn(
          `EncounterArchive with ID ${payload.ID} already exists, updating instead.`,
          this
        )
        this.ArchivedEncounters.splice(idx, 1, payload)
      } else {
        this.ArchivedEncounters.push(payload)
      }
      await SetItem('encounter_archives', payload.Serialize())
    },

    async RemoveEncounterArchive(payload: EncounterArchive): Promise<void> {
      const id = payload.ID || (payload as any)._id
      const idx = this.ArchivedEncounters.findIndex(x => x.ID === id)
      if (idx !== -1) {
        this.ArchivedEncounters.splice(idx, 1)
        await RemoveItem('encounter_archives', id)
      }
    },

    async SetActiveEncounter(id: string): Promise<void> {
      this.CurrentActiveID = id
      await SetValue('current_active_encounter_id', id)
      this.notifyEncounterChange()
    },

    async AssignActiveEncounter(payload: EncounterInstance): Promise<void> {
      this.CurrentActiveID = payload.ID
      await SetValue('current_active_encounter_id', payload.ID)
      this.notifyEncounterChange()
    },

    async CloneEncounter(payload: Encounter): Promise<void> {
      const clone = toRaw(payload).Clone()
      this.Encounters.push(clone)
      await SetItem('encounters', clone.Serialize())
      this.notifyEncounterChange()
    },

    async DeleteEncounterPermanent(payload: Encounter): Promise<void> {
      const id = payload.ID || (payload as any)._id
      const idx = this.Encounters.findIndex(x => x.ID === id)
      if (idx !== -1) this.Encounters.splice(idx, 1)
      NavStore().removeEncounterEntry(id)
      await RemoveItem('Encounters', id)
      this.SaveEncounterData()
      if (payload.CloudController.ShareCode) {
        await CloudController.MarkCloudDeleted(payload.CloudController.Metadata)
      }
      this.notifyEncounterChange()
    },

    async SaveEncounterData(): Promise<void> {
      await saveAll('encounters', this.Encounters, y => toRaw(y).Serialize(), 'Encounter data')
      this.notifyEncounterChange()
    },

    async SaveActiveEncounterData(): Promise<void> {
      await saveAll(
        'active_encounters',
        this.ActiveEncounters,
        y => toRaw(y).Serialize(),
        'Active Encounter data'
      )
      this.notifyEncounterChange()
    },
  },
})
