#!/usr/bin/env node
/**
 * Bundles every official Massif Press COMP/CON content pack into public/lcps/.
 *
 * The official packs are published as open data repositories at
 * https://github.com/massif-press (one repo per book). Each repo builds its
 * `.lcp` by archiving the contents of its `lib/` folder at the root of a zip,
 * which is exactly what this script reproduces for the `v3` branch - the
 * COMP/CON v3 data used by this application.
 *
 * Usage:
 *   node scripts/fetch-official-lcps.mjs            # skip packs already bundled
 *   node scripts/fetch-official-lcps.mjs --force    # re-download everything
 *   node scripts/fetch-official-lcps.mjs --only=long-rim,ktb
 *
 * The generated files are committed so the application ships with all official
 * content installed by default and works offline.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import JSZip from 'jszip'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'lcps')
const INDEX_FILE = join(OUT_DIR, 'index.json')

const BRANCHES = ['v3', 'master']

const PACKS = [
  { slug: 'long-rim', repo: 'long-rim-data' },
  { slug: 'wallflower', repo: 'wallflower-data' },
  { slug: 'dustgrave', repo: 'dustgrave-data' },
  { slug: 'ktb', repo: 'ktb-data' },
  { slug: 'osr', repo: 'osr-data' },
  { slug: 'ssmr', repo: 'ssmr-data' },
  { slug: 'sotw', repo: 'sotw-data' },
  { slug: 'ows', repo: 'ows-data' },
]

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = (args.find(a => a.startsWith('--only=')) || '')
  .replace('--only=', '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean)

const log = (...msg) => console.log(...msg)

/** Minimal tar reader: enough for `codeload` git archives (ustar + pax headers). */
function readTar(buf) {
  const entries = new Map()
  let offset = 0
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8)
    const type = String.fromCharCode(header[156])
    const dataStart = offset + 512
    const data = buf.subarray(dataStart, dataStart + (Number.isFinite(size) ? size : 0))

    if (type === '0' || type === '\0') entries.set(name, Buffer.from(data))
    offset = dataStart + Math.ceil((Number.isFinite(size) ? size : 0) / 512) * 512
  }
  return entries
}

/** Downloads a repo branch tarball and returns its `lib/` files keyed by file name. */
async function downloadLib(repo, branch) {
  const url = `https://codeload.github.com/massif-press/${repo}/tar.gz/refs/heads/${branch}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'owlbear-compcon-official-lcp-bundler' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`)

  const tar = gunzipSync(Buffer.from(await res.arrayBuffer()))
  const lib = new Map()

  for (const [path, data] of readTar(tar)) {
    const match = /^[^/]+\/lib\/(.+)$/.exec(path)
    if (match) lib.set(match[1], data)
  }

  if (!lib.has('lcp_manifest.json')) {
    throw new Error(`${repo}@${branch}: downloaded archive has no lib/lcp_manifest.json`)
  }
  return lib
}

function compareVersions(a = '0', b = '0') {
  const parse = v => String(v).split('.').map(x => parseInt(x, 10) || 0)
  const [av, bv] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    if ((av[i] || 0) !== (bv[i] || 0)) return (av[i] || 0) - (bv[i] || 0)
  }
  return 0
}

/** The v3 data lives on the `v3` branch, but some repos merged it into `master` later. */
async function resolveBranch(repo) {
  let best = null
  for (const branch of BRANCHES) {
    const res = await fetch(
      `https://raw.githubusercontent.com/massif-press/${repo}/${branch}/lib/lcp_manifest.json`,
      { headers: { 'User-Agent': 'owlbear-compcon-official-lcp-bundler' } }
    )
    if (!res.ok) continue
    const manifest = await res.json()
    if (!best || compareVersions(manifest.version, best.manifest.version) > 0) {
      best = { branch, manifest }
    }
  }
  if (!best) throw new Error(`${repo}: no manifest found on ${BRANCHES.join(' / ')}`)
  return best
}

/** Mirrors ContentPackParser's id derivation: base64(sha1("<author>/<name>")). */
function packId(manifest) {
  return createHash('sha1').update(`${manifest.author}/${manifest.name}`).digest('base64')
}

function readIndex() {
  if (!existsSync(INDEX_FILE)) return []
  try {
    const parsed = JSON.parse(readFileSync(INDEX_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function bundle(pack, previous) {
  const file = `${pack.slug}.lcp`
  const target = join(OUT_DIR, file)

  if (!force && previous && existsSync(target)) {
    log(`  skipped   ${file} (v${previous.version} already bundled)`)
    return previous
  }

  const { branch, manifest: latest } = await resolveBranch(pack.repo)
  const lib = await downloadLib(pack.repo, branch)
  const manifest = JSON.parse(lib.get('lcp_manifest.json').toString('utf8'))

  if (compareVersions(latest.version, manifest.version) > 0) {
    throw new Error(`${pack.repo}: ${branch} manifest is ${manifest.version}, expected ${latest.version}`)
  }

  const zip = new JSZip()
  for (const [name, data] of [...lib].sort(([a], [b]) => a.localeCompare(b))) {
    zip.file(name, data)
  }

  // Keep any language patch bundled with the pack (see public/llps and the README):
  // ContentPackParser.getBundledPatches picks up *.llp entries when a pack is installed.
  const patchFile = join(ROOT, 'public', 'llps', `${pack.slug}.llp`)
  const hasPatch = existsSync(patchFile)
  if (hasPatch) {
    zip.file('pt.llp', readFileSync(patchFile, 'utf8'), {
      date: new Date(Date.UTC(2020, 0, 1, 0, 0, 0)),
    })
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
  writeFileSync(target, buffer)

  const collections = [...lib.keys()]
    .filter(x => x !== 'lcp_manifest.json')
    .map(x => x.replace(/\.json$/, ''))
    .sort()

  log(`  bundled   ${file} v${manifest.version} from ${branch} (${(buffer.length / 1024).toFixed(0)} KiB)`)

  return {
    file,
    id: packId(manifest),
    name: manifest.name,
    author: manifest.author,
    version: manifest.version,
    itemPrefix: manifest.item_prefix || '',
    v3: !!manifest.v3,
    collections,
    ...(hasPatch ? { languages: ['pt'] } : {}),
    repo: `https://github.com/massif-press/${pack.repo}/tree/${branch}`,
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const previous = readIndex()
  const selected = PACKS.filter(p => !only.length || only.includes(p.slug))

  log(
    `Bundling ${selected.length} official content pack(s) from the massif-press repos (${BRANCHES.join(' / ')})\n`
  )

  const entries = []
  for (const pack of selected) {
    try {
      entries.push(await bundle(pack, previous.find(x => x.file === `${pack.slug}.lcp`)))
    } catch (error) {
      log(`  FAILED    ${pack.slug}: ${error.message}`)
      const stale = previous.find(x => x.file === `${pack.slug}.lcp`)
      if (stale && existsSync(join(OUT_DIR, stale.file))) entries.push(stale)
      else process.exitCode = 1
    }
  }

  for (const entry of previous) {
    if (!entries.some(x => x.file === entry.file)) entries.push(entry)
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(INDEX_FILE, `${JSON.stringify(entries, null, 2)}\n`)
  log(`\nWrote ${entries.length} entr(ies) to public/lcps/index.json`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
