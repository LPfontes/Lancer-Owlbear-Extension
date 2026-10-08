import { GetValue, SetValue } from '@/io/Storage'

/**
 * Roster LOCAL da mesa: quais fichas este navegador já publicou ou viu na mesa.
 *
 * Nada disso vai para os metadados do Owlbear (nem sala, nem cena). O fork não
 * grava ficha — nem o registro de quais fichas estão na mesa — em metadados: o
 * payload mora no armazenamento local (`pilot_sheets`/`pilots`/`npcs`) e é
 * replicado por broadcast. O roster existe apenas para responder "esta ficha é
 * da mesa?" dentro desta janela, com escopo por sala (`OBR.room.id`).
 */
const STORAGE_KEY = 'compcon_table_roster'
const DEFAULT_ROOM = 'sem-sala'

export type TableRosterKind = 'pilot' | 'npc'

export interface TableRosterEntry {
  id: string
  updatedAt: number
}

interface RoomEntries {
  pilots: Record<string, number>
  npcs: Record<string, number>
}

type StoredRoster = Record<string, RoomEntries>

let cache: StoredRoster | null = null
let loadPromise: Promise<StoredRoster> | null = null
let currentRoomId = DEFAULT_ROOM

function emptyRoom(): RoomEntries {
  return { pilots: {}, npcs: {} }
}

/** Bucket da sala atual, criado sob demanda (a troca de sala não descarta as outras). */
function roomEntries(store: StoredRoster): RoomEntries {
  const existing = store[currentRoomId]
  if (existing) {
    existing.pilots = existing.pilots || {}
    existing.npcs = existing.npcs || {}
    return existing
  }
  const created = emptyRoom()
  store[currentRoomId] = created
  return created
}

function bucketOf(room: RoomEntries, kind: TableRosterKind): Record<string, number> {
  return kind === 'pilot' ? room.pilots : room.npcs
}

async function loadedRoster(): Promise<StoredRoster> {
  if (cache) return cache
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const stored = await GetValue(STORAGE_KEY)
        cache = stored && typeof stored === 'object' ? (stored as StoredRoster) : {}
      } catch {
        cache = {}
      }
      return cache
    })()
  }
  return loadPromise
}

async function persist(store: StoredRoster): Promise<void> {
  try {
    await SetValue(STORAGE_KEY, store)
  } catch {
    // Roster é estado auxiliar: falhar aqui não pode derrubar o salvamento da ficha.
  }
}

/**
 * Define a sala atual. O roster é namespaced por sala para que trocar de mesa não
 * faça fichas de outra campanha passarem por "fichas da mesa".
 */
export function setTableRosterRoom(roomId: string | null | undefined): void {
  const next = (roomId || '').trim() || DEFAULT_ROOM
  currentRoomId = next
}

/** Sala usada agora (diagnóstico/testes). */
export function getTableRosterRoom(): string {
  return currentRoomId
}

/** IDs registrados como fichas da mesa nesta sala. */
export async function tableRosterIds(kind: TableRosterKind): Promise<Set<string>> {
  const store = await loadedRoster()
  return new Set(Object.keys(bucketOf(roomEntries(store), kind)))
}

/**
 * Roster no mesmo formato que o antigo metadata da sala usava
 * (`{ [id]: { id, updatedAt } }`), para não mexer em quem já consumia.
 */
export async function tableRosterEntries(
  kind: TableRosterKind
): Promise<Record<string, TableRosterEntry>> {
  const store = await loadedRoster()
  const entries: Record<string, TableRosterEntry> = {}
  for (const [id, updatedAt] of Object.entries(bucketOf(roomEntries(store), kind))) {
    entries[id] = { id, updatedAt }
  }
  return entries
}

/** Registra fichas na mesa. Ids vazios/duplicados são ignorados. */
export async function addToTableRoster(
  kind: TableRosterKind,
  ids: Array<string | null | undefined>
): Promise<void> {
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (clean.length === 0) return

  const store = await loadedRoster()
  const bucket = bucketOf(roomEntries(store), kind)
  let changed = false
  for (const id of clean) {
    bucket[id] = Date.now()
    changed = true
  }
  if (changed) await persist(store)
}

/** Tira uma ficha da mesa (local). */
export async function removeFromTableRoster(kind: TableRosterKind, id: string): Promise<void> {
  if (!id) return
  const store = await loadedRoster()
  const bucket = bucketOf(roomEntries(store), kind)
  let changed = false
  for (const key of Object.keys(bucket)) {
    if (key === id || key.toLowerCase() === id.toLowerCase()) {
      delete bucket[key]
      changed = true
    }
  }
  if (changed) await persist(store)
}

/** Zera o cache em memória (testes; a próxima leitura volta ao armazenamento). */
export function resetTableRoster(): void {
  cache = null
  loadPromise = null
  currentRoomId = DEFAULT_ROOM
}
