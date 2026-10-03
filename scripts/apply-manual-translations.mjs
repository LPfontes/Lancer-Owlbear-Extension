#!/usr/bin/env node
/**
 * Applies the hand-written translations from `i18n-src/pt_BR/manual/pt-BR-additions.json`
 * (strings this fork authored because the upstream pt-BR project does not have them yet)
 * into the catalog files, at the position their siblings live in.
 *
 * The pending list produced by `check-lcp-translations.mjs --pending` says which keys are
 * missing and in which file each one belongs; this script cross-checks against it so a
 * typo in a key or a stale entry can never write into the wrong place.
 *
 * Usage:
 *   node scripts/apply-manual-translations.mjs --dry-run
 *   node scripts/apply-manual-translations.mjs
 *   node scripts/apply-manual-translations.mjs --force   # overwrite a key that already exists with other text
 *
 * Idempotent: a second run inserts nothing.
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')

const ADDITIONS = join(ROOT, 'i18n-src', 'pt_BR', 'manual', 'pt-BR-additions.json')
const PENDING = join(ROOT, 'pendencias-traducao-lcp.csv')

const parseCsvLine = line => {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const readPending = () => {
  if (!existsSync(PENDING)) return new Map()
  const lines = readFileSync(PENDING, 'utf8').split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines[0])
  const keyAt = header.indexOf('chave')
  const fileAt = header.indexOf('arquivo_publicar')
  const map = new Map()
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line)
    map.set(row[keyAt], row[fileAt])
  }
  return map
}

function detectFormat(path) {
  const raw = readFileSync(path, 'utf8')
  const second = raw.split(/\r?\n/)[1] ?? ''
  return {
    indent: (second.match(/^ */) || [''])[0].length || 2,
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
  }
}

const serialize = (obj, format) =>
  JSON.stringify(obj, null, format.indent).replace(/\n/g, format.eol) + format.eol

/** Inserts a key keeping the file's rough alphabetical order (siblings stay together). */
function insertKey(obj, key, value) {
  const out = {}
  let placed = false
  for (const [k, v] of Object.entries(obj)) {
    if (!placed && k > key) {
      out[key] = value
      placed = true
    }
    out[k] = v
  }
  if (!placed) out[key] = value
  return out
}

function main() {
  if (!existsSync(ADDITIONS)) {
    console.error(`sem ${ADDITIONS.replace(ROOT, '.')}`)
    process.exit(2)
  }
  const additions = JSON.parse(readFileSync(ADDITIONS, 'utf8'))
  const entries = Object.entries(additions).filter(([k]) => !k.startsWith('_'))
  const pending = readPending()

  // Where each key belongs: the pending list says so while it is not empty; once everything is
  // translated the key already lives in one of the catalogs, so look there. This keeps the
  // script re-runnable after the pending export is empty.
  const catalogs = new Map()
  const catalogDir = join(ROOT, 'content', 'pt')
  for (const file of readdirSync(catalogDir).filter(f => f.endsWith('.json'))) {
    catalogs.set(`content/pt/${file}`, JSON.parse(readFileSync(join(catalogDir, file), 'utf8')))
  }
  const locate = key => {
    if (pending.has(key)) return pending.get(key)
    for (const [file, data] of catalogs) if (Object.hasOwn(data, key)) return file
    return null
  }

  const unknown = entries.filter(([k]) => !locate(k)).map(([k]) => k)
  if (unknown.length) {
    console.error(`chaves sem destino conhecido (${unknown.length}) — não estão na lista de pendências nem em content/pt:`)
    for (const k of unknown.slice(0, 10)) console.error(`  ${k}`)
    process.exit(2)
  }

  const byFile = new Map()
  for (const [key, value] of entries) {
    const file = locate(key)
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push([key, value])
  }

  console.log(
    `\nTraduções manuais: ${entries.length} chave(s) em ${byFile.size} arquivo(s)${DRY_RUN ? '  ·  DRY RUN' : ''}`
  )
  const totals = { inserted: 0, same: 0, conflict: 0, overwritten: 0 }

  for (const [file, list] of [...byFile.entries()].sort()) {
    const path = join(ROOT, file)
    if (!existsSync(path)) {
      console.error(`  ! ${file} não existe`)
      continue
    }
    const format = detectFormat(path)
    let data = JSON.parse(readFileSync(path, 'utf8'))
    let inserted = 0
    let same = 0
    const conflicts = []
    for (const [key, value] of list) {
      if (Object.hasOwn(data, key)) {
        if (data[key] === value) {
          same++
          continue
        }
        conflicts.push(key)
        if (FORCE) {
          data = { ...data, [key]: value }
          totals.overwritten++
        }
        continue
      }
      data = insertKey(data, key, value)
      inserted++
    }
    if (inserted && !DRY_RUN) writeFileSync(path, serialize(data, format))
    totals.inserted += inserted
    totals.same += same
    totals.conflict += conflicts.length
    console.log(
      `  ${file.padEnd(34)} inseridas=${String(inserted).padStart(3)} já iguais=${String(same).padStart(3)}` +
        (conflicts.length ? ` conflitos=${conflicts.length}${FORCE ? ' (sobrescritos)' : ' (mantidos)'}` : '')
    )
    for (const k of conflicts.slice(0, 3)) console.log(`      ~ ${k}`)
  }

  console.log(
    `\nTOTAL: ${totals.inserted} inseridas · ${totals.same} já iguais · ${totals.conflict} conflito(s)${FORCE ? ` (${totals.overwritten} sobrescritas)` : ''}`
  )
  if (DRY_RUN) console.log('(dry run: nada foi escrito)')
  console.log('')
}

main()
