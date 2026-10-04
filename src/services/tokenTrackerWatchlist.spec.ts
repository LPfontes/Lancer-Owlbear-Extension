import { describe, expect, it } from 'vitest'
import {
  addToWatchlist,
  isTokenTracked,
  pruneWatchlist,
  removeFromWatchlist,
  sanitizeLocalPrefs,
} from '@/services/tokenTrackerWatchlist'
import {
  DEFAULT_TOKEN_TRACKER_LOCAL_PREFS,
  TOKEN_TRACKER_LOCAL_PREFS_ID,
  type TokenTrackerLocalPrefs,
} from '@/types/token-tracker'

function prefs(patch: Partial<TokenTrackerLocalPrefs> = {}): TokenTrackerLocalPrefs {
  return { ...DEFAULT_TOKEN_TRACKER_LOCAL_PREFS, ...patch }
}

describe('isTokenTracked — automáticos ∪ adicionados − mutados', () => {
  it('token com valores disponíveis entra sozinho na lista', () => {
    expect(isTokenTracked({ tokenId: 't1', hasValues: true, prefs: prefs() })).toBe(true)
  })

  it('token sem valores só entra se foi adicionado à mão', () => {
    expect(isTokenTracked({ tokenId: 't1', hasValues: false, prefs: prefs() })).toBe(false)
    expect(
      isTokenTracked({ tokenId: 't1', hasValues: false, prefs: prefs({ watchlist: ['t1'] }) })
    ).toBe(true)
  })

  it('mutado sai da lista mesmo sendo automático', () => {
    expect(isTokenTracked({ tokenId: 't1', hasValues: true, prefs: prefs({ muted: ['t1'] }) })).toBe(
      false
    )
  })

  it('mutado ganha do adicionado à mão (proteção contra estado contraditório)', () => {
    expect(
      isTokenTracked({
        tokenId: 't1',
        hasValues: false,
        prefs: prefs({ watchlist: ['t1'], muted: ['t1'] }),
      })
    ).toBe(false)
  })

  it('sem token não há o que rastrear', () => {
    expect(isTokenTracked({ tokenId: '', hasValues: true, prefs: prefs() })).toBe(false)
  })
})

describe('addToWatchlist / removeFromWatchlist', () => {
  it('adicionar tira o token dos mutados', () => {
    const next = addToWatchlist(prefs({ muted: ['t1'] }), 't1')
    expect(next.watchlist).toContain('t1')
    expect(next.muted).not.toContain('t1')
  })

  it('adicionar duas vezes não duplica', () => {
    const once = addToWatchlist(prefs(), 't1')
    const twice = addToWatchlist(once, 't1')
    expect(twice.watchlist).toEqual(['t1'])
  })

  it('remover tira da lista e marca como mutado', () => {
    const next = removeFromWatchlist(prefs({ watchlist: ['t1'] }), 't1')
    expect(next.watchlist).not.toContain('t1')
    expect(next.muted).toContain('t1')
  })

  it('remover duas vezes não duplica o mutado', () => {
    const once = removeFromWatchlist(prefs(), 't1')
    const twice = removeFromWatchlist(once, 't1')
    expect(twice.muted).toEqual(['t1'])
  })

  it('id vazio é ignorado', () => {
    const current = prefs()
    expect(addToWatchlist(current, '')).toBe(current)
    expect(removeFromWatchlist(current, '')).toBe(current)
  })
})

describe('pruneWatchlist', () => {
  it('descarta tokens que não existem mais na cena', () => {
    const pruned = pruneWatchlist(
      prefs({ watchlist: ['vivo', 'morto'], muted: ['vivo2', 'morto2'] }),
      ['vivo', 'vivo2']
    )
    expect(pruned).toEqual(prefs({ watchlist: ['vivo'], muted: ['vivo2'] }))
  })

  it('devolve a MESMA referência quando não há nada a podar (evita gravação à toa)', () => {
    const current = prefs({ watchlist: ['vivo'] })
    expect(pruneWatchlist(current, ['vivo'])).toBe(current)
  })
})

describe('sanitizeLocalPrefs', () => {
  it('cai no default quando o storage devolve lixo', () => {
    for (const value of [undefined, null, 'nope', 7, []]) {
      expect(sanitizeLocalPrefs(value)).toEqual(DEFAULT_TOKEN_TRACKER_LOCAL_PREFS)
    }
  })

  it('limpa, deduplica e descarta entradas inválidas', () => {
    const prefsRead = sanitizeLocalPrefs({
      id: 'outro-id',
      watchlist: [' a ', 'a', '', 7, null, 'b'],
      muted: ['c', 'c'],
    })
    expect(prefsRead.id).toBe(TOKEN_TRACKER_LOCAL_PREFS_ID)
    expect(prefsRead.watchlist).toEqual(['a', 'b'])
    expect(prefsRead.muted).toEqual(['c'])
  })

  it('tolera listas ausentes', () => {
    expect(sanitizeLocalPrefs({})).toEqual(DEFAULT_TOKEN_TRACKER_LOCAL_PREFS)
  })
})
