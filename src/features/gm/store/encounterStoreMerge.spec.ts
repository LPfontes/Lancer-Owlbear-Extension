import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toRaw } from 'vue'
import { ClearAll, SetItem } from '@/io/Storage'
import { EncounterStore } from './encounter_store'
import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'

function makeInstance(name = 'Test Encounter'): EncounterInstance {
  const encounter = new Encounter()
  encounter.Name = name
  return new EncounterInstance(undefined, encounter, [])
}

function payloadFor(instance: EncounterInstance, lastModified?: number): any {
  const data: any = EncounterInstance.Serialize(instance)
  if (lastModified !== undefined) data.save.lastModified = lastModified
  return data
}

// These are integration tests: they go through the real Storage rather than a
// mock, because the store's import of it is not intercepted by vi.mock here.
describe('EncounterStore reload merge', () => {
  beforeEach(async () => {
    await ClearAll('active_encounters')
  })

  it('keeps the live instance when the stored copy is not newer', async () => {
    const instance = makeInstance()
    const store = EncounterStore()
    store.ActiveEncounters = [instance]
    await SetItem('active_encounters', payloadFor(instance))

    await store.LoadActiveEncounters()

    expect(store.ActiveEncounters).toHaveLength(1)
    expect(toRaw(store.ActiveEncounters[0])).toBe(instance)
  })

  it('replaces the live instance when the stored copy is strictly newer', async () => {
    const instance = makeInstance()
    const store = EncounterStore()
    store.ActiveEncounters = [instance]
    await SetItem('active_encounters', payloadFor(instance, Date.now() + 10_000))

    await store.LoadActiveEncounters()

    expect(store.ActiveEncounters).toHaveLength(1)
    expect(toRaw(store.ActiveEncounters[0])).not.toBe(instance)
    expect(store.ActiveEncounters[0].ID).toBe(instance.ID)
  })

  it('drops an instance that is no longer stored', async () => {
    const store = EncounterStore()
    store.ActiveEncounters = [makeInstance()]

    await store.LoadActiveEncounters()

    expect(store.ActiveEncounters).toHaveLength(0)
  })

  it('adds an instance that only exists in storage', async () => {
    const store = EncounterStore()
    await SetItem('active_encounters', payloadFor(makeInstance('From disk')))

    await store.LoadActiveEncounters()

    expect(store.ActiveEncounters).toHaveLength(1)
    expect(store.ActiveEncounters[0].Name).toBe('From disk')
  })

  it('does not notify its own window when a local mutation is persisted', () => {
    const listener = vi.fn()
    window.addEventListener('compcon-encounters-reloaded', listener)

    EncounterStore().notifyEncounterChange()

    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('compcon-encounters-reloaded', listener)
  })
})
