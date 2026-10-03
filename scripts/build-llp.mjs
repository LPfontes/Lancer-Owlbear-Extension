#!/usr/bin/env node
/**
 * Builds one `.llp` (COMP/CON language patch) per bundled content pack, from the catalog
 * files this repo already ships under `content/<lang>/`.
 *
 * An `.llp` is the app's per-pack translation vehicle (`src/i18n/validatePatch.mjs`):
 *   { "lang", "target", "target_version", "data": { "<key>": "<text>" } }
 * `target` must match one of the installed pack's identifiers (id / item_prefix / name),
 * which is why it defaults to the pack id from `public/lcps/index.json` - the most stable
 * of the three. `lang` uses the application's locale code (`pt`), not the upstream
 * project's file suffix (`pt_BR`), because `loadContent` only merges patches whose
 * `lang` equals the active locale.
 *
 * Packs that are not bundled here (e.g. the official NPC data pack) can still get a patch:
 * declare them in `public/llps/targets.json`:
 *   { "lancer-npc-data": { "target": "<pack id or manifest name>", "target_version": "*",
 *                          "pack": "Lancer NPC Data", "version": "3.0.0" } }
 *
 * Usage:
 *   node scripts/build-llp.mjs
 *   node scripts/build-llp.mjs --any-version        # target_version: "*"
 *   node scripts/build-llp.mjs --date=2026-10-03    # optional last_update (default: omitted, keeps builds reproducible)
 *   node scripts/build-llp.mjs --lang=pt
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePatch } from '../src/i18n/validatePatch.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const [, value] = hit.split('=')
  return value === undefined ? true : value
}

const LANG = String(flag('lang', 'pt'))
const ANY_VERSION = !!flag('any-version', false)
const DATE = flag('date', null)

const LCPS_DIR = join(ROOT, 'public', 'lcps')
const OUT_DIR = join(ROOT, 'public', 'llps')
const TARGETS_FILE = join(OUT_DIR, 'targets.json')

const read = path => JSON.parse(readFileSync(path, 'utf8'))

function main() {
  const index = existsSync(join(LCPS_DIR, 'index.json')) ? read(join(LCPS_DIR, 'index.json')) : []
  const overrides = existsSync(TARGETS_FILE) ? read(TARGETS_FILE) : {}
  mkdirSync(OUT_DIR, { recursive: true })

  const written = []
  const skipped = []

  const build = (slug, meta, packName, packVersion) => {
    const dataFile = join(ROOT, 'content', LANG, `${slug}-data.json`)
    if (!existsSync(dataFile)) {
      skipped.push([slug, `sem content/${LANG}/${slug}-data.json`])
      return
    }
    const data = read(dataFile)
    const keys = Object.keys(data)
    if (!keys.length) {
      skipped.push([slug, 'catálogo vazio no projeto'])
      return
    }
    const target = meta.target
    if (!target) {
      skipped.push([slug, 'sem target (declare em public/llps/targets.json)'])
      return
    }
    const version = meta.version || packVersion
    const patch = {
      lang: LANG,
      target,
      target_version: meta.target_version || (ANY_VERSION ? '*' : version ? `^${version}` : '*'),
      translation_version: meta.translation_version || '1.0.0',
      ...(meta.translator ? { translator: meta.translator } : {}),
      ...(meta.website ? { website: meta.website } : {}),
      ...(DATE && DATE !== true ? { last_update: String(DATE) } : {}),
      data,
    }

    const check = validatePatch(patch)
    if (!check.ok) throw new Error(`${slug}: patch inválido — ${check.error}`)

    const file = `${slug}.llp`
    writeFileSync(join(OUT_DIR, file), `${JSON.stringify(patch, null, 2)}\n`)
    written.push({ file, lang: LANG, target, target_version: patch.target_version, pack: meta.pack || packName || slug, version, keys: keys.length })
  }

  for (const entry of index) {
    const slug = String(entry.file).replace(/\.lcp$/, '')
    const meta = overrides[slug] || {}
    build(slug, { ...meta, target: meta.target || entry.id }, entry.name, entry.version)
  }

  // Extra targets declared by hand (packs that are not bundled in this repo).
  for (const [slug, meta] of Object.entries(overrides)) {
    if (index.some(e => String(e.file).replace(/\.lcp$/, '') === slug)) continue
    build(slug, meta, meta.pack, meta.version)
  }

  written.sort((a, b) => a.file.localeCompare(b.file))
  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(written, null, 2)}\n`)

  console.log(`\nLanguage patches (${LANG}) em public/llps:\n`)
  console.log(`${'arquivo'.padEnd(26)}${'chaves'.padStart(8)}  target / versão`)
  console.log('-'.repeat(78))
  for (const w of written) {
    console.log(`${w.file.padEnd(26)}${String(w.keys).padStart(8)}  ${w.target} · ${w.target_version}`)
  }
  if (skipped.length) {
    console.log('\nIgnorados:')
    for (const [slug, reason] of skipped) console.log(`  ${slug} — ${reason}`)
  }
  console.log(`\n${written.length} patch(es) + index.json\n`)
}

main()
