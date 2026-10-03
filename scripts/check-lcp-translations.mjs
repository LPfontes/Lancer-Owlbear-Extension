#!/usr/bin/env node
/**
 * Coverage report for a locale's translation of LCP content (and the bundled core data).
 *
 * The application resolves pack strings through `localize(<key>, <field>, fallback)`,
 * where <key> is:
 *   - a top level item id (`localize(this.ID, 'name', ...)`),
 *   - a prefix registered by `stampContentKeys` for nested, id-less objects
 *     (`ContentPack.ts` calls it with the parsed pack data),
 *   - `<owner id>.<on_attack|on_hit|on_crit|on_miss>` for weapon/mod effect callbacks
 *     (`mkEffect` in `_activeEffectUtils.ts` registers that prefix itself),
 *   - `glossary_<Name>` for glossary entries (`glossaryId` in contentKeys.mjs).
 *
 * This script reproduces that derivation offline and checks each expected key against the
 * merged catalog the app builds from `content/<locale>/*.json` (same alphabetical merge
 * order as `src/i18n/loadContent.ts`). Installed `.llp` patches are browser state and are
 * not part of the report.
 *
 * Usage:
 *   node scripts/check-lcp-translations.mjs                    # pt, core + every bundled pack
 *   node scripts/check-lcp-translations.mjs --locale=de
 *   node scripts/check-lcp-translations.mjs --pack=ktb
 *   node scripts/check-lcp-translations.mjs --json=relatorio.json
 *   node scripts/check-lcp-translations.mjs --pending=pendencias.csv   # chave, texto en, onde publicar
 *   node scripts/check-lcp-translations.mjs --check=95         # exit 1 below 95%
 *   node scripts/check-lcp-translations.mjs --missing=15
 *
 * Read-only: never writes into content/ or public/.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { stampContentKeys, keyPrefixes, glossaryId } from '../src/i18n/contentKeys.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LCPS_DIR = join(ROOT, 'public', 'lcps')
const CORE_DIR = join(ROOT, 'node_modules', '@massif', 'lancer-data', 'lib')

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const [, value] = hit.split('=')
  return value === undefined ? true : value
}

const LOCALE = String(flag('locale', 'pt'))
const ONLY_PACK = flag('pack', null)
const JSON_OUT = flag('json', null)
const PENDING_OUT = flag('pending', null)
const CHECK_PCT = flag('check', null)
const MISSING_SHOWN = Number(flag('missing', 8))

/** Every string field some class pipes through `localize()`. */
const FIELDS = [
  'name',
  'description',
  'terse',
  'detail',
  'effect',
  'trigger',
  'condition',
  'quote',
  'mounted_effect',
  'active_name',
  'active_effect',
  'passive_name',
  'passive_effect',
  'objective',
  'deployment',
  'controlZone',
  'extraction',
  'effects',
]

/** `mkEffect` prefixes for these four callback fields. */
const EFFECT_FIELDS = ['on_attack', 'on_hit', 'on_crit', 'on_miss']

/** Collections for which `ContentPackParser.generateIDs` fabricates a deterministic id. */
const GENERATED_IDS = {
  tags: 'tg',
  core_bonuses: 'cb',
  pilot_gear: 'pg',
  talents: 't',
  frames: 'mf',
  weapons: 'mw',
  systems: 'ms',
  mods: 'wm',
}

/**
 * Collections this fork parses but never localizes (Bond/BondPower read raw strings:
 * `Bond.Name = data.name`), so their keys can never be consumed. Counted apart.
 */
const NOT_LOCALIZED = new Set(['bonds', 'bond_powers'])

/** Containers that hold no items at all, only lookup tables. */
const NON_ITEM = new Set(['glossary', 'lists', 'tables', 'info', 'rules'])

const sanitize = name =>
  String(name)
    .replace(/[ /-]/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toLowerCase()

const itemPrefixOf = manifest => manifest.item_prefix || manifest.itemPrefix || ''

function generatedId(manifest, type, name) {
  if (!name) return null
  return `${itemPrefixOf(manifest)}__${type}_${sanitize(name)}`
}

/** Collects expected keys for one collection array. */
function collectFromItems(items, manifest, collection) {
  const keys = new Map()
  const dead = new Map()
  const noId = []
  const deadSet = NOT_LOCALIZED.has(collection)
  const idType = GENERATED_IDS[collection]
  const isGlossary = collection === 'glossary'

  const add = (target, prefix, field, value) => {
    if (typeof value !== 'string' || !value.trim()) return
    target.set(`${prefix}.${field}`, value)
  }

  const walk = (obj, inherited, isRoot) => {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) return obj.forEach(o => walk(o, inherited, false))
    const registered = keyPrefixes.get(obj)
    const own = registered || inherited
    if (registered || isRoot) {
      const target = deadSet ? dead : keys
      for (const f of FIELDS) add(target, own, f, obj[f])
      for (const ef of EFFECT_FIELDS) {
        if (typeof obj[ef] === 'string') add(target, `${own}.${ef}`, 'detail', obj[ef])
      }
    }
    for (const v of Object.values(obj)) walk(v, own, false)
  }

  for (const item of items || []) {
    if (!item || typeof item !== 'object') continue
    if (isGlossary) {
      if (item.name) walk(item, glossaryId(item.name), true)
      continue
    }
    if (NON_ITEM.has(collection)) continue
    const id = item.id || (idType ? generatedId(manifest, idType, item.name) : null)
    if (!id) {
      noId.push(item.name || '(sem nome)')
      continue
    }
    walk(item, id, true)
  }
  return { keys, dead, noId }
}

function stampAll(collections) {
  const data = {}
  for (const [name, value] of Object.entries(collections)) {
    if (Array.isArray(value)) data[name] = value
  }
  stampContentKeys(data)
  return data
}

function collectAll(collections, manifest) {
  stampAll(collections)
  const keys = new Map()
  const dead = new Map()
  const noId = []
  for (const [collection, value] of Object.entries(collections)) {
    if (!Array.isArray(value)) continue
    const res = collectFromItems(value, manifest, collection)
    for (const [k, v] of res.keys) if (!keys.has(k)) keys.set(k, v)
    for (const [k, v] of res.dead) if (!dead.has(k)) dead.set(k, v)
    noId.push(...res.noId)
  }
  return { keys, dead, noId }
}

async function packKeys(file) {
  const path = join(LCPS_DIR, file)
  if (!existsSync(path)) throw new Error(`pack not found: ${path}`)
  const zip = await JSZip.loadAsync(readFileSync(path))
  const manifest = JSON.parse(await zip.file('lcp_manifest.json').async('string'))
  const collections = {}
  for (const name of Object.keys(zip.files)) {
    if (!name.toLowerCase().endsWith('.json') || name === 'lcp_manifest.json') continue
    try {
      collections[name.replace(/\.json$/i, '')] = JSON.parse(await zip.file(name).async('string'))
    } catch {
      /* the app logs and skips unreadable entries too */
    }
  }
  const { keys, dead, noId } = collectAll(collections, manifest)
  return { name: manifest.name, version: manifest.version, keys, dead, noId, file, prefix: itemPrefixOf(manifest) }
}

function coreKeys() {
  const collections = {}
  for (const file of readdirSync(CORE_DIR)) {
    if (!file.endsWith('.json')) continue
    collections[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(CORE_DIR, file), 'utf8'))
  }
  const { keys, dead, noId } = collectAll(collections, { name: 'core', item_prefix: '' })
  return { name: 'core', version: 'core', keys, dead, noId, file: null }
}

/** Mirrors src/i18n/loadContent.ts: content/<locale>/*.json, alphabetical, later wins. */
function catalogFor(locale) {
  const dir = join(ROOT, 'content', locale)
  const merged = new Map()
  const perFile = new Map()
  if (!existsSync(dir)) return { merged, perFile }
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    perFile.set(file, new Set(Object.keys(data)))
    for (const [k, v] of Object.entries(data)) merged.set(k, v)
  }
  return { merged, perFile }
}

const pct = (part, total) => (total ? ((part / total) * 100).toFixed(1) : '—')
const fieldOf = key => key.slice(key.lastIndexOf('.') + 1)

async function main() {
  const index = existsSync(join(LCPS_DIR, 'index.json'))
    ? JSON.parse(readFileSync(join(LCPS_DIR, 'index.json'), 'utf8'))
    : []

  const core = coreKeys()
  const packs = []
  for (const entry of index) {
    const slug = entry.file.replace(/\.lcp$/, '')
    if (ONLY_PACK && ONLY_PACK !== slug && ONLY_PACK !== entry.file) continue
    try {
      packs.push(await packKeys(entry.file))
    } catch (error) {
      console.warn(`  ! ${entry.file}: ${error.message}`)
    }
  }

  const { merged, perFile } = catalogFor(LOCALE)
  const sources = [core, ...packs]

  const universe = new Map()
  const bondKeys = new Map()
  for (const s of sources) {
    for (const [k, v] of s.keys) if (!universe.has(k)) universe.set(k, v)
    for (const [k, v] of s.dead) if (!bondKeys.has(k)) bondKeys.set(k, v)
  }

  const srdEnFile = join(ROOT, 'content', 'en', 'lancer-srd.json')
  const srd = existsSync(srdEnFile)
    ? (() => {
        const keys = Object.keys(JSON.parse(readFileSync(srdEnFile, 'utf8')))
        const hit = keys.filter(k => merged.has(k))
        return { total: keys.length, translated: hit.length, percent: Number(pct(hit.length, keys.length)) }
      })()
    : null

  console.log(`\nCobertura do catálogo '${LOCALE}' — content/${LOCALE}/*.json, ${merged.size} chaves\n`)
  console.log(`${'fonte'.padEnd(34)}${'chaves'.padStart(8)}${'traduz.'.padStart(9)}${'%'.padStart(7)}  sem-id`)
  console.log('-'.repeat(70))
  const rows = []
  for (const s of sources) {
    const keys = [...s.keys.keys()]
    const hit = keys.filter(k => merged.has(k))
    const missing = keys.filter(k => !merged.has(k))
    const label = s.file ? `${s.file} · v${s.version}` : 'core (lancer-data)'
    console.log(
      `${label.padEnd(34)}${String(keys.length).padStart(8)}${String(hit.length).padStart(9)}${pct(hit.length, keys.length).padStart(7)}  ${s.noId.length || ''}`
    )
    rows.push({ label, file: s.file, total: keys.length, translated: hit.length, missing, noId: s.noId.length, keys: s.keys })
  }
  if (srd) {
    console.log(
      `${'lancer-srd'.padEnd(34)}${String(srd.total).padStart(8)}${String(srd.translated).padStart(9)}${String(srd.percent).padStart(7)}`
    )
  }

  const uniKeys = [...universe.keys()]
  const uniHit = uniKeys.filter(k => merged.has(k))
  const uniMissing = uniKeys.filter(k => !merged.has(k))
  console.log('-'.repeat(70))
  console.log(
    `${'UNIVERSO (core + packs, sem repetir)'.padEnd(34)}${String(uniKeys.length).padStart(8)}${String(uniHit.length).padStart(9)}${pct(uniHit.length, uniKeys.length).padStart(7)}`
  )

  const byField = {}
  for (const k of uniMissing) byField[fieldOf(k)] = (byField[fieldOf(k)] || 0) + 1
  const fieldList = Object.entries(byField).sort((a, b) => b[1] - a[1])
  console.log('\nO que falta, por campo:')
  for (const [field, n] of fieldList) console.log(`  .${field.padEnd(16)} ${String(n).padStart(4)}`)

  console.log(`\nFaltando por fonte (até ${MISSING_SHOWN} cada):`)
  for (const row of rows) {
    if (!row.missing.length) continue
    console.log(`\n  ${row.label} — ${row.missing.length} chave(s)`)
    for (const k of row.missing.slice(0, MISSING_SHOWN)) {
      const en = row.keys.get(k)
      console.log(`    ${k}${en ? `\n        en: ${String(en).slice(0, 110)}` : ''}`)
    }
    if (row.missing.length > MISSING_SHOWN) console.log(`    … +${row.missing.length - MISSING_SHOWN}`)
  }

  // Keys published in content/<locale> that no bundled source asks for.
  // `lancer-srd.json` is validated against the SRD key list above instead.
  const isBondKey = key => key.slice(0, key.indexOf('.')).includes('bond')
  const bondOnly = new Set([...bondKeys.keys()].filter(isBondKey))
  const orphans = {}
  const bondOrphans = new Set()
  for (const [file, keys] of perFile) {
    if (file === 'lancer-srd.json') continue
    const unmatched = []
    for (const k of keys) {
      if (universe.has(k) || bondKeys.has(k)) continue
      if (isBondKey(k) || bondOnly.has(k)) bondOrphans.add(k)
      else unmatched.push(k)
    }
    if (unmatched.length) orphans[file] = unmatched
  }
  const orphanTotal = Object.values(orphans).reduce((n, v) => n + v.length, 0)
  if (orphanTotal) {
    console.log(`\nChaves publicadas que nenhuma fonte do repo pede (${orphanTotal}):`)
    for (const [file, list] of Object.entries(orphans)) {
      const total = perFile.get(file).size
      const share = list.length / total
      if (share > 0.5) {
        console.log(
          `  ${file} — ${list.length}/${total}: sem fonte correspondente no repo (ex. pack não empacotado); não validável offline`
        )
        continue
      }
      const patterns = {}
      for (const k of list) {
        const p = k.includes('.on_') ? '.on_*' : `.${fieldOf(k)}`
        patterns[p] = (patterns[p] || 0) + 1
      }
      console.log(
        `  ${file} — ${list.length}/${total} (${Object.entries(patterns)
          .map(([p, n]) => `${p}×${n}`)
          .join(', ')})`
      )
      for (const k of list.slice(0, MISSING_SHOWN)) console.log(`    ${k}`)
      if (list.length > MISSING_SHOWN) console.log(`    … +${list.length - MISSING_SHOWN}`)
    }
  }

  const bondTotal = new Set([...bondKeys.keys(), ...bondOrphans])
  if (bondTotal.size) {
    const hit = [...bondTotal].filter(k => merged.has(k))
    console.log(
      `\nBonds/BondPowers: ${bondTotal.size} chave(s) publicadas que este fork não localiza` +
        ` (Bond.ts lê o texto cru; ${hit.length} já traduzidas, prontas se a localização for adicionada depois)`
    )
  }

  const noIdSources = sources.filter(s => s.noId.length)
  if (noIdSources.length) {
    console.log('\nItens sem id (chave instável em runtime, não traduzível):')
    for (const s of noIdSources) {
      const label = s.file ? `${s.file} · v${s.version}` : 'core (lancer-data)'
      console.log(`  ${label} — ${s.noId.length}: ${s.noId.slice(0, 6).join(', ')}${s.noId.length > 6 ? ', …' : ''}`)
    }
  }

  const report = {
    locale: LOCALE,
    catalogKeys: merged.size,
    sources: rows.map(r => ({
      label: r.label,
      total: r.total,
      translated: r.translated,
      percent: Number(pct(r.translated, r.total)) || 0,
      itemsWithoutId: r.noId,
      missing: r.missing,
    })),
    srd,
    totals: {
      universe: uniKeys.length,
      translated: uniHit.length,
      percent: Number(pct(uniHit.length, uniKeys.length)) || 0,
      missingByField: byField,
      missing: uniMissing,
    },
    notLocalizedByThisFork: { bonds: [...bondTotal] },
    orphans,
  }

  if (JSON_OUT && JSON_OUT !== true) {
    writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\nRelatório JSON: ${JSON_OUT}`)
  }

  if (PENDING_OUT && PENDING_OUT !== true) {
    // Where a missing key should be published: the same file the locale already ships for that
    // source (core data lives in lancer-data.json, each bundled pack in <slug>-data.json).
    const fileFor = label => {
      if (label.startsWith('core')) return `content/${LOCALE}/lancer-data.json`
      const slug = label.split(' · ')[0].replace(/\.lcp$/, '')
      return `content/${LOCALE}/${slug}-data.json`
    }
    const pending = new Map()
    for (const row of rows) {
      for (const key of row.missing) {
        if (pending.has(key)) continue
        pending.set(key, {
          key,
          field: fieldOf(key),
          en: row.keys.get(key) || '',
          source: row.label,
          file: fileFor(row.label),
        })
      }
    }
    const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['chave,campo,texto_en,fonte,arquivo_publicar,pt_BR']
    for (const p of pending.values()) {
      lines.push([p.key, p.field, p.en, p.source, p.file, ''].map(quote).join(','))
    }
    writeFileSync(PENDING_OUT, `${lines.join('\r\n')}\r\n`)
    console.log(`Pendências para traduzir: ${PENDING_OUT} (${pending.size} chave(s))`)
  }

  if (CHECK_PCT !== null) {
    const limit = Number(CHECK_PCT) || 0
    if (report.totals.percent < limit) {
      console.error(`\nFALHA: cobertura ${report.totals.percent}% < limite ${limit}%`)
      process.exit(1)
    }
    console.log(`\nOK: cobertura ${report.totals.percent}% >= limite ${limit}%`)
  }
  console.log('')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
