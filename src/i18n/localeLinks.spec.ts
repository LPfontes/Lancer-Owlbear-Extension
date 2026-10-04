import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Links de mensagem (`@:{'chave'}`) são resolvidos em tempo de execução pelo
 * vue-i18n. Quando a chave não existe no catálogo ativo NEM no fallback (`en`), o
 * app registra `[intlify] Not found ... key in '<locale>' locale messages` e
 * renderiza o texto cru (ex.: `@:{'common.pilotDisplayName'}` na notificação).
 *
 * Cobertura só do que quebra de verdade: um link ausente na locale ativa mas
 * presente no `en` cai no fallback e é considerado resolvido.
 */
const LOCALES_DIR = resolve(process.cwd(), 'src/i18n/locales')
const FALLBACK_LOCALE = 'en.json'
const LINK_RE = /@(?:\.[a-zA-Z]+)?:(?:\{'([^']+)'\}|([A-Za-z0-9_.$-]+))/g

function flatten(obj: any, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
    else out.set(path, String(value))
  }
  return out
}

function readCatalog(file: string): Map<string, string> {
  return flatten(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')))
}

describe('catálogos de locale', () => {
  it('não têm link de mensagem que não resolva nem no próprio locale nem no fallback', () => {
    const fallback = readCatalog(FALLBACK_LOCALE)
    const files = readdirSync(LOCALES_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()

    const broken: string[] = []
    for (const file of files) {
      const messages = readCatalog(file)
      const resolvable = file === FALLBACK_LOCALE ? messages : fallback
      for (const [key, text] of messages) {
        for (const match of text.matchAll(LINK_RE)) {
          const target = match[1] ?? match[2]
          if (!messages.has(target) && !resolvable.has(target)) {
            broken.push(`${file}: ${key} -> @:{'${target}'}`)
          }
        }
      }
    }

    expect(broken).toEqual([])
  })
})
