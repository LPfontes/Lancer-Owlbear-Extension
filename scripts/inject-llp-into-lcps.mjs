#!/usr/bin/env node
/**
 * Embeds the generated language patches (`public/llps/<slug>.llp`) inside the bundled
 * official content packs (`public/lcps/<slug>.lcp`).
 *
 * Why: an `.lcp` is a zip, and `getBundledPatches` (`src/io/ContentPackParser.ts`) reads
 * any `*.llp` entry inside it. The content manager auto-stages those when a pack is
 * installed by hand (`PackInstall.vue`), so a `.lcp` handed to someone else - or installed
 * from the itch.io download instead of this repo's bundled copy - carries its pt-BR
 * translation with it, with no extra step.
 *
 * Reproducible: the injected entry gets a fixed timestamp, entries are written in the zip's
 * existing order, and a pack whose embedded patch is already byte-identical is left
 * untouched, so re-running produces no diff.
 *
 * Usage:
 *   node scripts/inject-llp-into-lcps.mjs            # inject/refresh
 *   node scripts/inject-llp-into-lcps.mjs --check     # report only, exit 1 if out of date
 *   node scripts/inject-llp-into-lcps.mjs --prune     # also drop <lang>.llp with no source patch
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { validatePatch } from '../src/i18n/validatePatch.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const has = name => args.includes(`--${name}`)
const flag = (name, fallback = null) => {
  const hit = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const [, value] = hit.split('=')
  return value === undefined ? true : value
}

const LANG = String(flag('lang', 'pt'))
const CHECK = has('check')
const PRUNE = has('prune')
const UPDATE_INDEX = !has('no-index')

const LCPS_DIR = join(ROOT, 'public', 'lcps')
const LLPS_DIR = join(ROOT, 'public', 'llps')
const INDEX_FILE = join(LCPS_DIR, 'index.json')
const ENTRY = `${LANG}.llp`
const FIXED_DATE = new Date(Date.UTC(2020, 0, 1, 0, 0, 0))

async function main() {
  if (!existsSync(LLPS_DIR)) {
    console.error(`sem ${LLPS_DIR.replace(ROOT, '.')} — rode node scripts/build-llp.mjs primeiro`)
    process.exit(2)
  }
  const patches = new Map(
    readdirSync(LLPS_DIR)
      .filter(f => f.endsWith('.llp'))
      .map(f => [f.replace(/\.llp$/, ''), readFileSync(join(LLPS_DIR, f), 'utf8')])
  )

  const packs = readdirSync(LCPS_DIR).filter(f => f.endsWith('.lcp'))
  const index = existsSync(INDEX_FILE) ? JSON.parse(readFileSync(INDEX_FILE, 'utf8')) : []
  const totals = { injected: 0, refreshed: 0, unchanged: 0, pruned: 0, missing: [] }
  let indexChanged = false

  for (const file of packs.sort()) {
    const slug = file.replace(/\.lcp$/, '')
    const path = join(LCPS_DIR, file)
    const patchText = patches.get(slug) || null
    const zip = await JSZip.loadAsync(readFileSync(path))
    const current = zip.file(ENTRY) ? await zip.file(ENTRY).async('string') : null
    const entry = index.find(e => e.file === file)

    if (patchText) {
      const check = validatePatch(JSON.parse(patchText))
      if (!check.ok) throw new Error(`${slug}: patch inválido — ${check.error}`)
    }

    let action = 'unchanged'
    if (patchText && current === patchText) {
      totals.unchanged++
    } else if (patchText) {
      action = current ? 'refreshed' : 'injected'
      zip.file(ENTRY, patchText, { date: FIXED_DATE })
      if (!CHECK) {
        const buffer = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 9 },
        })
        writeFileSync(path, buffer)
      }
      if (action === 'refreshed') totals.refreshed++
      else totals.injected++
    } else if (current && PRUNE) {
      action = 'pruned'
      zip.remove(ENTRY)
      if (!CHECK) {
        const buffer = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 9 },
        })
        writeFileSync(path, buffer)
      }
      totals.pruned++
    } else if (!patchText) {
      totals.missing.push(slug)
      action = 'sem patch'
    }

    if (entry) {
      const languages = new Set(entry.languages || [])
      const embedded = patchText ? true : current && !PRUNE ? true : false
      if (embedded) languages.add(LANG)
      else languages.delete(LANG)
      const next = [...languages].sort()
      const same = JSON.stringify(next) === JSON.stringify(entry.languages || [])
      if (!same) {
        indexChanged = true
        if (next.length) entry.languages = next
        else delete entry.languages
      }
    }

    console.log(
      `${file.padEnd(18)} ${action.padEnd(10)} ${patchText ? `${(patchText.length / 1024).toFixed(0)} KiB de patch` : ''}`
    )
  }

  if (indexChanged && UPDATE_INDEX && !CHECK) {
    writeFileSync(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`)
    console.log('\nindex.json atualizado (campo "languages")')
  }

  console.log(
    `\ninjetados: ${totals.injected} · atualizados: ${totals.refreshed} · já em dia: ${totals.unchanged} · removidos: ${totals.pruned}`
  )
  if (totals.missing.length) console.log(`sem patch (ok): ${totals.missing.join(', ')}`)

  if (CHECK && (totals.injected || totals.refreshed || totals.pruned || indexChanged)) {
    console.error('\nFALHA: há packs desatualizados em relação a public/llps')
    process.exit(1)
  }
  console.log('')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
