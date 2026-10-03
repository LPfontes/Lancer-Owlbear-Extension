#!/usr/bin/env node
/**
 * Syncs the raw pt-BR translation project committed under `i18n-src/pt_BR` (upstream
 * COMP/CON layout: `ui/content/<pack>/pt_BR.json`, `ui/ui/pt_BR.json`) into the files
 * this application actually loads:
 *
 *   i18n-src/pt_BR/ui/content/<slug>/pt_BR.json  ->  content/pt/<slug>.json
 *   i18n-src/pt_BR/ui/ui/pt_BR.json              ->  src/i18n/locales/pt.json
 *
 * Rules (all of them exist to keep the sync reviewable and idempotent):
 *  - the committed file is the base: existing keys keep their position, brand new keys are
 *    appended in source order, so a run that changes nothing produces zero diff;
 *  - keys that exist only locally are never dropped (e.g. the `.condition` keys this fork
 *    added by hand, which the upstream project does not extract at all);
 *  - a key present in both with different text keeps the local text by default;
 *    `--conflicts=external` takes the project's text instead (the 91 disputed strings);
 *  - a brand new key is imported only when the matching English reference still lists it
 *    (`ui/content/<slug>/en.json` for packs, `src/i18n/locales/en.json` for the interface),
 *    so strings for items this app no longer has never enter the catalogs;
 *  - formatting follows the target file (indent + line endings detected from it, falling back
 *    to the source export): 2-space + CRLF for repo files, 4-space + LF for pack files.
 *
 * Usage:
 *   node scripts/sync-pt-translations.mjs --dry-run
 *   node scripts/sync-pt-translations.mjs
 *   node scripts/sync-pt-translations.mjs --conflicts=external
 *   node scripts/sync-pt-translations.mjs --source=i18n-src/pt_BR
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const [, value] = hit.split('=')
  return value === undefined ? true : value
}

const DRY_RUN = !!flag('dry-run', false)
const POLICY = String(flag('conflicts', 'keep-local'))
const SOURCE_ROOT = resolve(ROOT, String(flag('source', 'i18n-src/pt_BR')))
const SHOW = Number(flag('show', 5))

if (!['keep-local', 'external'].includes(POLICY)) {
  console.error(`--conflicts deve ser keep-local ou external (recebi "${POLICY}")`)
  process.exit(2)
}

const read = path => JSON.parse(readFileSync(path, 'utf8'))

const flatten = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.push(key)
  }
  return out
}

const isLeaf = v => typeof v === 'string' || v === undefined || v === null
const leafCount = (v, key) => (isLeaf(v) ? 1 : flatten(v, key).length)

function assertStringLeaves(obj, label) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) assertStringLeaves(v, `${label}.${k}`)
    else if (typeof v !== 'string' && v !== undefined && v !== null)
      throw new Error(`${label}.${k}: valor não-string (${typeof v}) não é aceito em catálogos`)
  }
}

/** Flat catalog merge: local order first, new source keys appended in source order. */
function mergeFlat(local, source, reference) {
  const out = {}
  const stats = { added: 0, updated: 0, kept: 0, equal: 0, localOnly: 0, skipped: 0 }
  const changes = []
  for (const [k, v] of Object.entries(local)) {
    if (Object.hasOwn(source, k)) {
      if (source[k] === v) {
        out[k] = v
        stats.equal++
      } else if (POLICY === 'external') {
        out[k] = source[k]
        stats.updated++
        changes.push(['updated', k])
      } else {
        out[k] = v
        stats.kept++
      }
    } else {
      out[k] = v
      stats.localOnly++
    }
  }
  for (const [k, v] of Object.entries(source)) {
    if (Object.hasOwn(local, k)) continue
    if (reference && !reference.has(k)) {
      stats.skipped++
      continue
    }
    out[k] = v
    stats.added++
    changes.push(['added', k])
  }
  return { out, stats, changes }
}

/** Nested merge (interface strings): same rules, applied per namespace, counting leaves. */
function mergeNested(local, source, reference, prefix = '') {
  const out = {}
  const stats = { added: 0, updated: 0, kept: 0, equal: 0, localOnly: 0, skipped: 0 }
  const changes = []
  const bump = res => {
    for (const f of Object.keys(stats)) stats[f] += res.stats[f]
    changes.push(...res.changes)
  }
  for (const [k, v] of Object.entries(local)) {
    const key = prefix ? `${prefix}.${k}` : k
    const s = (source || {})[k]
    if (s === undefined) {
      out[k] = v
      stats.localOnly += leafCount(v, key)
      continue
    }
    if (isLeaf(v) && isLeaf(s)) {
      if (s === v) {
        out[k] = v
        stats.equal++
      } else if (POLICY === 'external') {
        out[k] = s
        stats.updated++
        changes.push(['updated', key])
      } else {
        out[k] = v
        stats.kept++
      }
      continue
    }
    if (!isLeaf(v) && !isLeaf(s)) {
      const res = mergeNested(v, s, reference, key)
      out[k] = res.out
      bump(res)
      continue
    }
    if (POLICY === 'external' && !isLeaf(s)) {
      out[k] = s
      stats.added += leafCount(s, key)
      changes.push(['added', key])
    } else if (POLICY === 'external') {
      out[k] = s
      stats.updated++
      changes.push(['updated', key])
    } else {
      out[k] = v
      stats.kept++
    }
  }
  for (const [k, v] of Object.entries(source || {})) {
    if (Object.hasOwn(local, k)) continue
    const key = prefix ? `${prefix}.${k}` : k
    const keys = isLeaf(v) ? [key] : flatten(v, key)
    const wanted = reference ? keys.filter(x => reference.has(x)) : keys
    stats.skipped += keys.length - wanted.length
    if (!wanted.length) continue
    out[k] = v
    stats.added += wanted.length
    changes.push(['added', key])
  }
  return { out, stats, changes }
}

/** Keeps the target's own convention (indent + EOL); falls back to the source export's. */
function detectFormat(targetPath, sourcePath) {
  const raw = existsSync(targetPath)
    ? readFileSync(targetPath, 'utf8')
    : existsSync(sourcePath)
      ? readFileSync(sourcePath, 'utf8')
      : null
  if (!raw) return { indent: 2, eol: '\r\n', trailingNewline: true }
  const secondLine = raw.split(/\r?\n/)[1] ?? ''
  const indent = (secondLine.match(/^ */) || [''])[0].length || 2
  return { indent, eol: raw.includes('\r\n') ? '\r\n' : '\n', trailingNewline: true }
}

function serialize(obj, format) {
  const json = JSON.stringify(obj, null, format.indent)
  return json.replace(/\n/g, format.eol) + (format.trailingNewline ? format.eol : '')
}

function writeTarget(relPath, obj, format) {
  const path = join(ROOT, relPath)
  const next = serialize(obj, format)
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null
  const bytes = Buffer.byteLength(next, 'utf8')
  if (before === next) return { relPath, changed: false, bytes, format }
  if (!DRY_RUN) writeFileSync(path, next)
  return { relPath, changed: true, bytes, format }
}

function main() {
  const contentDir = join(SOURCE_ROOT, 'ui', 'content')
  const uiSource = join(SOURCE_ROOT, 'ui', 'ui', 'pt_BR.json')
  if (!existsSync(contentDir)) {
    console.error(`fonte inválida: falta ${contentDir}`)
    process.exit(2)
  }

  const enUiPath = join(ROOT, 'src', 'i18n', 'locales', 'en.json')
  const enUiKeys = existsSync(enUiPath) ? new Set(flatten(read(enUiPath))) : null

  console.log(
    `\nSync pt-BR  ·  fonte: ${SOURCE_ROOT.replace(ROOT, '.')}  ·  conflitos: ${POLICY}${DRY_RUN ? '  ·  DRY RUN' : ''}\n`
  )
  const header = ['+novas', '~externo', '~local', '=iguais', 'só local', 'ignoradas']
  console.log('destino'.padEnd(38) + header.map(h => h.padStart(9)).join(''))
  console.log('-'.repeat(92))

  const results = []
  const slugs = readdirSync(contentDir).filter(name => statSync(join(contentDir, name)).isDirectory())

  for (const slug of slugs) {
    const sourcePath = join(contentDir, slug, 'pt_BR.json')
    if (!existsSync(sourcePath)) continue
    const source = read(sourcePath)
    if (!Object.keys(source).length) {
      console.log(`${`content/pt/${slug}.json`.padEnd(38)}${'(projeto sem tradução para este pack)'.padStart(45)}`)
      continue
    }
    assertStringLeaves(source, `content/${slug}`)
    const targetRel = `content/pt/${slug}.json`
    const targetPath = join(ROOT, targetRel)
    const local = existsSync(targetPath) ? read(targetPath) : {}
    const enPath = join(contentDir, slug, 'en.json')
    const reference = existsSync(enPath) ? new Set(Object.keys(read(enPath))) : null
    const { out, stats, changes } = mergeFlat(local, source, reference)
    const res = writeTarget(targetRel, out, detectFormat(targetPath, sourcePath))
    results.push({ ...res, stats, changes })
  }

  if (existsSync(uiSource)) {
    const source = read(uiSource)
    assertStringLeaves(source, 'ui/ui/pt_BR.json')
    const targetRel = 'src/i18n/locales/pt.json'
    const targetPath = join(ROOT, targetRel)
    const local = existsSync(targetPath) ? read(targetPath) : {}
    const { out, stats, changes } = mergeNested(local, source, enUiKeys)
    const res = writeTarget(targetRel, out, detectFormat(targetPath, uiSource))
    results.push({ ...res, stats, changes })
  }

  for (const r of results) {
    const s = r.stats
    console.log(
      r.relPath.padEnd(38) +
        [s.added, s.updated, s.kept, s.equal, s.localOnly, s.skipped].map(n => String(n).padStart(9)).join('')
    )
  }

  const totals = results.reduce(
    (acc, r) => {
      for (const f of Object.keys(acc)) acc[f] += r.stats[f]
      return acc
    },
    { added: 0, updated: 0, kept: 0, equal: 0, localOnly: 0, skipped: 0 }
  )
  console.log('-'.repeat(92))
  console.log(
    'TOTAL'.padEnd(38) + Object.values(totals).map(n => String(n).padStart(9)).join('')
  )
  console.log(`
  +novas     chaves do projeto que entraram no catálogo
  ~externo   chaves com texto diferente em que o texto do projeto foi aplicado
  ~local     chaves com texto diferente em que o texto local foi mantido (${POLICY})
  =iguais    chaves idênticas ao projeto
  só local   chaves que só existem aqui (nunca removidas)
  ignoradas  chaves novas do projeto que o en.json de referência não lista`)

  const changed = results.filter(r => r.changed)
  console.log(`\nArquivos ${DRY_RUN ? 'que mudariam' : 'gravados'}: ${changed.length}`)
  for (const r of changed) {
    console.log(
      `  ${r.relPath} — ${r.bytes} bytes (indent ${r.format.indent}, ${r.format.eol === '\r\n' ? 'CRLF' : 'LF'})`
    )
    const shown = r.changes?.slice(0, SHOW) ?? []
    for (const [kind, key] of shown) console.log(`      ${kind === 'added' ? '+' : '~'} ${key}`)
    if ((r.changes?.length ?? 0) > shown.length)
      console.log(`      … +${r.changes.length - shown.length} alteração(ões)`)
  }
  if (DRY_RUN) console.log('\n(dry run: nada foi escrito)')
  console.log('')
}

main()
