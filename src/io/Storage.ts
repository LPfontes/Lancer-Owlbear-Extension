import logger from '@/user/logger'
import localforage from 'localforage'
import { ref } from 'vue'

const dbName = 'COMPCON Persistent'

const memoryStores: Record<string, Map<string, string>> = {}

/** Driver de armazenamento efetivamente em uso (informativo). */
export const storageDriver = ref<'INDEXEDDB' | 'LOCALSTORAGE' | 'MEMORY'>('INDEXEDDB')
/** `false` quando nem IndexedDB nem LocalStorage estão disponíveis. */
export const storageIsDurable = ref(true)

function getMemoryStore(collection: string): Map<string, string> {
  const col = collection.toLowerCase()
  if (!memoryStores[col]) {
    memoryStores[col] = new Map<string, string>()
  }
  return memoryStores[col]
}

/**
 * Grava em memória — último recurso, quando não há driver durável.
 *
 * Ponto único de escrita em memória: sem ele, uma falha de persistência some sem
 * deixar rastro, e a ficha "desaparece" no reload sem nenhuma pista.
 */
function writeMemory(collection: string, key: string, serialized: string): void {
  getMemoryStore(collection).set(key, serialized)
  logger.error(
    `Storage: escrita em "${collection}" não pôde ser persistida e ficou apenas em memória. ` +
      'As alterações serão perdidas no reload.',
  )
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

/** O `localStorage` está realmente acessível neste contexto? */
function localStorageWorks(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const probe = '__cc_storage_probe__'
    window.localStorage.setItem(probe, '1')
    const ok = window.localStorage.getItem(probe) === '1'
    window.localStorage.removeItem(probe)
    return ok
  } catch {
    return false
  }
}

/** O IndexedDB está realmente utilizável neste contexto? */
function indexedDbIsUsable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) return false
    if (localforage.supports && !localforage.supports(localforage.INDEXEDDB)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Migra para um driver que funcione e ESPERA a troca de fato.
 *
 * `setDriver` é assíncrono: o driver só passa a valer no evento `ready`. Se
 * chamarmos sem `await` e tentarmos gravar na linha seguinte, a escrita ainda
 * roda no IndexedDB, falha de novo e o dado vai silenciosamente para a memória.
 */
async function ensureFallbackDrivers(): Promise<'LOCALSTORAGE' | 'MEMORY'> {
  // Já estamos em LocalStorage: nada a fazer. Mas não retornamos cedo se a última
  // tentativa terminou em MEMORY — uma nova carga pode conseguir driver durável.
  if (isFallbackMode && storageDriver.value === 'LOCALSTORAGE') {
    return 'LOCALSTORAGE'
  }
  isFallbackMode = true

  if (!localStorageWorks()) {
    storageDriver.value = 'MEMORY'
    storageIsDurable.value = false
    logger.error(
      'Storage: IndexedDB e LocalStorage indisponíveis neste contexto. ' +
        'As alterações não sobreviverão a um reload.',
    )
    return 'MEMORY'
  }

  const ready = Promise.all(
    Object.values(storeRegistry).map(store =>
      store.setDriver([localforage.LOCALSTORAGE]).catch(err => {
        logger.error('Storage: falha ao trocar o driver para LocalStorage', {}, err)
      }),
    ),
  )

  // `ready()` não resolve quando o driver pedido não existe; o evento `ready` é o
  // sinal confiável de que a troca terminou.
  await Promise.race([
    ready,
    new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000)
      try {
        localforage.ready(() => {
          clearTimeout(timer)
          resolve()
        })
      } catch {
        clearTimeout(timer)
        resolve()
      }
    }),
  ])

  // Confirma com uma escrita real — `setDriver` pode resolver sem ter trocado.
  const resolved: 'LOCALSTORAGE' | 'MEMORY' = localStorageWorks() ? 'LOCALSTORAGE' : 'MEMORY'
  storageDriver.value = resolved
  storageIsDurable.value = resolved !== 'MEMORY'

  if (resolved === 'MEMORY') {
    logger.error('Storage: LocalStorage indisponível. Operando em memória — dados serão perdidos no reload.')
  } else {
    logger.warn('Storage: IndexedDB indisponível; operando em LocalStorage (cota menor).')
  }

  return resolved
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

const Initialize = async function () {
  localforage.config({
    name: dbName,
    driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  })

  // Resolve o driver já no boot: assim a primeira escrita não precisa descobrir
  // (e falhar) que o IndexedDB está bloqueado neste contexto.
  if (indexedDbIsUsable()) {
    storageDriver.value = 'INDEXEDDB'
    storageIsDurable.value = true
    // Log de boot: comparar o driver entre as janelas (popover esquerdo x janela da
    // ficha) é o que revela duas janelas lendo storages diferentes — cada uma com o
    // seu driver, sem enxergar os dados da outra.
    console.log('[Storage] driver=INDEXEDDB (durável).')
    return
  }

  await ensureFallbackDrivers()
  console.log(`[Storage] driver=${storageDriver.value} (durável: ${storageIsDurable.value}).`)
}

const SetValue = async function (key: string, value: any) {
  const serialized = JSON.stringify(value)
  const store = storeRegistry['settings']
  if (!store) {
    writeMemory('settings', key, serialized)
    return value
  }

  try {
    return await store.setItem(key, serialized)
  } catch (err) {
    if (isPermissionDenied(err)) {
      // Precisa AGUARDAR a troca de driver: sem isso o retry roda no driver
      // antigo, falha de novo e o dado vai silenciosamente para a memória.
      await ensureFallbackDrivers()
      try {
        return await store.setItem(key, serialized)
      } catch (_) {
        writeMemory('settings', key, serialized)
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
      await ensureFallbackDrivers()
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
      writeMemory(col, item, item)
      return
    }
    try {
      await sr.setItem(item, item)
    } catch (err) {
      if (isPermissionDenied(err)) {
        await ensureFallbackDrivers()
        try {
          await sr.setItem(item, item)
        } catch (_) {
          writeMemory(col, item, item)
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
    writeMemory(col, id, serialized)
    return
  }

  try {
    await store.setItem(id, serialized)
  } catch (err) {
    if (isPermissionDenied(err)) {
      await ensureFallbackDrivers()
      try {
        await store.setItem(id, serialized)
      } catch (_) {
        writeMemory(col, id, serialized)
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
      await ensureFallbackDrivers()
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
      await ensureFallbackDrivers()
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
      await ensureFallbackDrivers()
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
        await ensureFallbackDrivers()
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
      await ensureFallbackDrivers()
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
      await ensureFallbackDrivers()
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
      await ensureFallbackDrivers()
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
