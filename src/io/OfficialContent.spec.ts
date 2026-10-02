import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The bundled official packs live in `public/lcps` and are produced by
 * `scripts/fetch-official-lcps.mjs`. Storage and the network are faked so the
 * installation can be exercised end to end without touching real storage.
 */
const disk = vi.hoisted(() => ({
  collections: new Map<string, Map<string, string>>(),
  values: new Map<string, unknown>(),
  fetches: [] as string[],
  fail: new Set<string>(),
}))

vi.mock('./Storage', () => ({
  Initialize: vi.fn(async () => {}),
  SetItem: vi.fn(async (collection: string, item: any) => {
    const col = collection.toLowerCase()
    if (!disk.collections.has(col)) disk.collections.set(col, new Map())
    const id = item?.ID ?? item?.id ?? item?.sortkey
    if (id) disk.collections.get(col)!.set(id, JSON.stringify(item))
  }),
  GetItem: vi.fn(async (collection: string, id: string) => {
    const raw = disk.collections.get(collection.toLowerCase())?.get(id)
    return raw ? JSON.parse(raw) : null
  }),
  RemoveItem: vi.fn(async (collection: string, id: string) => {
    disk.collections.get(collection.toLowerCase())?.delete(id)
  }),
  GetAll: vi.fn(async () => []),
  SetAll: vi.fn(),
  GetLength: vi.fn(async () => 0),
  GetKeys: vi.fn(async (collection: string) => [
    ...(disk.collections.get(collection.toLowerCase())?.keys() ?? []),
  ]),
  ClearAll: vi.fn(),
  SetValue: vi.fn(async (key: string, value: unknown) => {
    disk.values.set(key, value)
  }),
  GetValue: vi.fn(async (key: string) => disk.values.get(key) ?? null),
  ClearAllData: vi.fn(),
  GetTotalStorageSize: vi.fn(async () => 0),
  saveAll: vi.fn(),
  storeRegistry: {},
}))

import {
  fetchOfficialPackIndex,
  installOfficialContentPacks,
  officialPackIndexURL,
  type OfficialPackInfo,
} from './OfficialContent'
import { parseContentPack } from './ContentPackParser'
import { CompendiumStore, ContentPackStore } from '@/features/compendium/store'

const LCPS_DIR = join(process.cwd(), 'public', 'lcps')

/** Mirrors ContentPackParser's pack id derivation. */
const packIdOf = (author: string, name: string) =>
  createHash('sha1').update(`${author}/${name}`).digest('base64')

const index = () =>
  JSON.parse(readFileSync(join(LCPS_DIR, 'index.json'), 'utf8')) as OfficialPackInfo[]

const realFetch = globalThis.fetch

function serveFromDisk() {
  vi.stubGlobal('fetch', async (url: string) => {
    disk.fetches.push(url)
    const name = url.split('/').pop() as string
    if (disk.fail.has(name)) return { ok: false, status: 404 }
    const path = join(LCPS_DIR, name)
    if (!existsSync(path)) return { ok: false, status: 404 }
    const buffer = readFileSync(path)
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buffer.toString('utf8')),
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    }
  })
}

beforeEach(() => {
  disk.collections.clear()
  disk.values.clear()
  disk.fetches.length = 0
  disk.fail.clear()
  ContentPackStore().ContentPacks = []
  serveFromDisk()
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = realFetch
})

describe('bundled official content packs', () => {
  it('ships an index whose ids are derived from the manifests', async () => {
    const entries = await fetchOfficialPackIndex()

    expect(entries.length).toBeGreaterThanOrEqual(8)
    expect(new Set(entries.map(x => x.id)).size).toBe(entries.length)

    for (const entry of entries) {
      const path = join(LCPS_DIR, entry.file)
      expect(existsSync(path), `${entry.file} is bundled`).toBe(true)

      const pack = await parseContentPack(readFileSync(path))
      expect(pack.manifest.name).toBe(entry.name)
      expect(pack.manifest.version).toBe(entry.version)
      expect(packIdOf(pack.manifest.author, pack.manifest.name)).toBe(entry.id)
    }
  })

  it('includes the packs the current save files reference', async () => {
    const entries = await fetchOfficialPackIndex()
    const byId = new Map(entries.map(x => [x.id, x]))

    // ids as recorded in an existing pilot save's `brews`
    expect(byId.get('eK3m5/lSUgllpz12ZjWcfL/TC2c=')?.name).toBe('Lancer Long Rim Data')
    expect(byId.get('MMhitef+jvmY2uy9kdaCSXKJSeA=')?.name).toBe('Lancer Wallflower Data')
    expect(byId.get('05B2PGxewZ193c4GaHDBoE2sl8U=')?.name).toBe('LANCER: Dustgrave')
  })

  it('resolves the Caliban and its integrated Flayer once installed', async () => {
    expect(CompendiumStore().has('Frames', 'mf_caliban')).toBe(false)

    const installed = await installOfficialContentPacks()
    expect(installed).toBe((await fetchOfficialPackIndex()).length)

    await CompendiumStore().refreshExtraContent()

    expect(CompendiumStore().has('Frames', 'mf_caliban')).toBe(true)

    const caliban = CompendiumStore().Frames.find(f => f.ID === 'mf_caliban')!
    expect(caliban.CoreSystem.IntegratedIDs).toContain('mw_caliban_integrated')

    const flayer = CompendiumStore().MechWeapons.find(w => w.ID === 'mw_caliban_integrated')
    expect(flayer?.Name).toContain('Flayer')
  })

  it('installs every pack active, so nothing is hidden', async () => {
    await installOfficialContentPacks()

    const packs = ContentPackStore().ContentPacks
    expect(packs.length).toBeGreaterThanOrEqual(8)
    expect(packs.every(pack => pack.Active)).toBe(true)
    expect(packs.some(pack => pack.Name === 'Lancer Long Rim Data')).toBe(true)
  })

  it('does nothing on a second run', async () => {
    await installOfficialContentPacks()
    disk.fetches.length = 0

    expect(await installOfficialContentPacks()).toBe(0)
    expect(disk.fetches).toEqual([officialPackIndexURL()])
  })

  it('does not reinstall a pack the player removed', async () => {
    await installOfficialContentPacks()

    const removed = ContentPackStore().ContentPacks.find(p => p.Name === 'Lancer Long Rim Data')!
    ContentPackStore().ContentPacks = ContentPackStore().ContentPacks.filter(p => p !== removed)
    disk.collections.get('content')?.delete(removed.ID)

    expect(await installOfficialContentPacks()).toBe(0)
    expect(ContentPackStore().ContentPacks.some(p => p.ID === removed.ID)).toBe(false)
  })

  it('ignores packs already present in storage', async () => {
    await installOfficialContentPacks()
    disk.values.clear() // forget the bookkeeping, keep the installed packs
    ContentPackStore().ContentPacks = []
    disk.fetches.length = 0

    expect(await installOfficialContentPacks()).toBe(0)
    // the index is always revalidated, the archives are not re-downloaded
    expect(disk.fetches).toEqual([officialPackIndexURL()])
  })

  it('starts up normally when the packs cannot be fetched', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })

    await expect(installOfficialContentPacks()).resolves.toBe(0)
    expect(ContentPackStore().ContentPacks).toEqual([])
  })

  it('keeps going when a single pack fails to download', async () => {
    disk.fail.add('ktb.lcp')

    const installed = await installOfficialContentPacks()
    const total = (await fetchOfficialPackIndex()).length

    expect(installed).toBe(total - 1)
    expect(ContentPackStore().ContentPacks.some(p => p.Name === 'Lancer KTB Data')).toBe(false)
  })
})
