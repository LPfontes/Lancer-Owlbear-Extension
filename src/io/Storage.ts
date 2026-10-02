import logger from '@/user/logger'
import localforage from 'localforage'

const dbName = 'COMPCON Persistent'

const memoryStores: Record<string, Map<string, string>> = {}

function getMemoryStore(collection: string): Map<string, string> {
  const col = collection.toLowerCase()
  if (!memoryStores[col]) {
    memoryStores[col] = new Map<string, string>()
  }
  return memoryStores[col]
}

function isPermissionDenied(err: any): boolean {
  if (!err) return false
  const msg = String(err?.message || err)
  const name = err?.name || ''
  return (
    name === 'UnknownError' ||
    name === 'SecurityError' ||
    msg.includes('denied permission') ||
    msg.includes('insecure') ||
    msg.includes('QuotaExceededError')
  )
}

let isFallbackMode = false

function enableFallbackDrivers() {
  if (isFallbackMode) return
  isFallbackMode = true
  logger.warn('Storage: IndexedDB access restricted or denied in this environment. Falling back to LocalStorage/Memory storage.')
  for (const store of Object.values(storeRegistry)) {
    try {
      void store.setDriver([localforage.LOCALSTORAGE])
    } catch (_) {}
  }
}

function createStore(storeName: string, description: string): LocalForage {
  return localforage.createInstance({
    name: dbName,
    storeName,
    description,
    driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  })
}

const storeRegistry: Record<string, LocalForage> = {
  pilot_groups: createStore('pilot_groups', 'Stores Pilot Group data'),
  pilots: createStore('pilots', 'Stores Pilot data'),
  pilot_sheets: createStore('pilot_sheets', 'Stores Active Mode Pilot Sheet data'),
  pilot_logbooks: createStore('pilot_logbooks', 'Stores Pilot lifetime combat logbook data'),
  content: createStore('content', 'Stores LCP data'),
  translations: createStore('translations', 'Stores installed LCP language patches (.llp)'),
  content_collection: createStore('content_collection', 'Stores user-published content collection data'),
  campaigns: createStore('campaigns', 'Stores Campaign data'),
  campaign_collection: createStore('campaign_collection', 'Stores Published Campaign data'),
  encounters: createStore('encounters', 'Stores Encounter data'),
  active_encounters: createStore('active_encounters', 'Stores Active Encounter data'),
  encounter_archives: createStore('encounter_archives', 'Stores Active Encounter archive data'),
  npcs: createStore('npcs', 'Stores NPC data'),
  narrative: createStore('narrative', 'Stores Narrative data'),
  remote_images: createStore('remote_images', 'Stores remotely hosted image urls'),
  settings: createStore('settings', 'Stores application settings'),
  v2_backup: createStore('v2_backup', 'Stores v2 data awaiting LCP installation for re-import'),
  table_actions: createStore('table_actions', 'Stores Table Actions and Chat history'),
}

// Proactive test for IndexedDB permission in iframe
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    const probe = window.indexedDB.open('__compcon_storage_probe__')
    probe.onerror = () => {
      enableFallbackDrivers()
    }
  } catch (_) {
    enableFallbackDrivers()
  }
}

const Initialize = async function () {
  localforage.config({
    name: dbName,
    driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  })
}

const SetValue = async function (key: string, value: any) {
  const serialized = JSON.stringify(value)
  const store = storeRegistry['settings']
  if (!store) {
    getMemoryStore('settings').set(key, serialized)
    return value
  }

  try {
    return await store.setItem(key, serialized)
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        return await store.setItem(key, serialized)
      } catch (_) {
        getMemoryStore('settings').set(key, serialized)
        return value
      }
    }
    throw err
  }
}

const GetValue = async function (key: string): Promise<any> {
  const store = storeRegistry['settings']
  if (!store) {
    const memVal = getMemoryStore('settings').get(key)
    return memVal ? JSON.parse(memVal) : null
  }

  try {
    const item = (await store.getItem(key)) as string
    if (item == null) return null
    return JSON.parse(item)
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        const item = (await store.getItem(key)) as string
        if (item == null) return null
        return JSON.parse(item)
      } catch (_) {
        const memVal = getMemoryStore('settings').get(key)
        return memVal ? JSON.parse(memVal) : null
      }
    }
    return null
  }
}

const SetItem = async function (collection: string, item: any) {
  const col = collection.toLowerCase()
  if (typeof item === 'string') {
    const sr = storeRegistry[col]
    if (!sr) {
      getMemoryStore(col).set(item, item)
      return
    }
    try {
      await sr.setItem(item, item)
    } catch (err) {
      if (isPermissionDenied(err)) {
        enableFallbackDrivers()
        try {
          await sr.setItem(item, item)
        } catch (_) {
          getMemoryStore(col).set(item, item)
        }
      }
    }
    return
  }

  let save = true
  const id = item.ID ? item.ID : item.id ? item.id : item.sortkey ? item.sortkey : item._id

  if (item.SaveController) {
    save = item.SaveController.IsDirty
  }

  if (!save) return
  if (!id) {
    logger.warn(`SetItem: skipping item with no key in collection "${collection}"`)
    return
  }

  const store = storeRegistry[col]
  const serialized = JSON.stringify(item)
  if (!store) {
    getMemoryStore(col).set(id, serialized)
    return
  }

  try {
    await store.setItem(id, serialized)
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        await store.setItem(id, serialized)
      } catch (_) {
        getMemoryStore(col).set(id, serialized)
      }
    } else {
      logger.error('Error saving item to collection', { collection, id }, err)
    }
  }
}

const GetItem = async function (collection: string, id: string) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  if (!store) {
    const memVal = getMemoryStore(col).get(id)
    return memVal ? JSON.parse(memVal) : null
  }

  try {
    const item = await store.getItem(id)
    if (item == null) return null
    return JSON.parse(item as string)
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        const item = await store.getItem(id)
        if (item == null) return null
        return JSON.parse(item as string)
      } catch (_) {
        const memVal = getMemoryStore(col).get(id)
        return memVal ? JSON.parse(memVal) : null
      }
    }
    return null
  }
}

const RemoveItem = async function (collection: string, id: string) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  if (!store) {
    getMemoryStore(col).delete(id)
    return
  }

  try {
    return await store.removeItem(id)
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        return await store.removeItem(id)
      } catch (_) {
        getMemoryStore(col).delete(id)
      }
    }
  }
}

const GetAll = async function (collection: string) {
  const col = collection.toLowerCase()
  const output = [] as any[]
  const store = storeRegistry[col]
  if (!store) return output

  try {
    await store.iterate(function (value: any) {
      try {
        const obj = JSON.parse(value)
        output.push(obj)
      } catch (err) {
        logger.error('Error parsing collection item', { collection, value }, err)
      }
    })
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        await store.iterate(function (value: any) {
          try {
            const obj = JSON.parse(value)
            output.push(obj)
          } catch (_) {}
        })
      } catch (_) {
        const mem = getMemoryStore(col)
        for (const value of mem.values()) {
          try {
            output.push(JSON.parse(value))
          } catch (_) {}
        }
      }
    } else {
      logger.error('Error getting collection data', {}, err)
    }
  }
  return output
}

const SetAll = async function (collection: string, items: any[]) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  if (store) {
    try {
      await store.clear()
    } catch (err) {
      if (isPermissionDenied(err)) {
        enableFallbackDrivers()
      }
    }
  }
  getMemoryStore(col).clear()

  const promises = items.map(item => SetItem(collection, item))
  await Promise.all(promises)
}

const ClearAll = async function (collection: string) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  getMemoryStore(col).clear()
  if (!store) return

  try {
    return await store.clear()
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        return await store.clear()
      } catch (_) {}
    }
  }
}

const GetLength = async function (collection: string) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  if (!store) return getMemoryStore(col).size

  try {
    return await store.length()
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        return await store.length()
      } catch (_) {
        return getMemoryStore(col).size
      }
    }
    return 0
  }
}

const GetKeys = async function (collection: string) {
  const col = collection.toLowerCase()
  const store = storeRegistry[col]
  if (!store) return Array.from(getMemoryStore(col).keys())

  try {
    return await store.keys()
  } catch (err) {
    if (isPermissionDenied(err)) {
      enableFallbackDrivers()
      try {
        return await store.keys()
      } catch (_) {
        return Array.from(getMemoryStore(col).keys())
      }
    }
    return []
  }
}

const GetTotalStorageSize = async function (): Promise<number> {
  let total = 0
  for (const store of Object.values(storeRegistry)) {
    try {
      await store.iterate((value: any) => {
        if (typeof value === 'string') {
          total += value.length
        } else {
          total += JSON.stringify(value).length
        }
      })
    } catch (_) {}
  }
  return total
}

const ClearAllData = async function (): Promise<void> {
  for (const store of Object.values(storeRegistry)) {
    try {
      await store.clear()
    } catch (_) {}
  }
  for (const key of Object.keys(memoryStores)) {
    memoryStores[key].clear()
  }
  logger.info('All data cleared!')
}

async function saveAll<T>(
  storageKey: string,
  items: T[],
  serializer: (item: T) => unknown,
  label: string
): Promise<void> {
  try {
    await Promise.all(items.map(y => SetItem(storageKey, serializer(y))))
    logger.info(`${label} saved`)
  } catch (err) {
    logger.error(`Error saving ${label}`, err)
  }
}

export {
  storeRegistry,
  Initialize,
  SetItem,
  GetItem,
  RemoveItem,
  GetAll,
  SetAll,
  GetLength,
  GetKeys,
  ClearAll,
  SetValue,
  GetValue,
  ClearAllData,
  GetTotalStorageSize,
  saveAll,
}
