import { GetItem, SetItem } from '@/io/Storage'
import {
  DEFAULT_TOKEN_TRACKER_LOCAL_PREFS,
  TOKEN_TRACKER_LOCAL_PREFS_ID,
  type TokenTrackerLocalPrefs,
} from '@/types/token-tracker'

/**
 * Watchlist desta janela (plano §7.4).
 *
 * A unidade de render NÃO é "o token do jogador": é uma lista de tokens por
 * janela. Ela nasce implícita (todo token com valores disponíveis, respeitada a
 * política da mesa) e o usuário pode adicionar/remover entradas.
 *
 * Preferência de JANELA: vive no IndexedDB local, nunca em metadata de sala ou de
 * token — cada um vê o que quer, e ninguém descobre a ficha de ninguém por causa
 * disso.
 */

/** Composição da lista: automáticos ∪ adicionados − mutados. */
export function isTokenTracked(input: {
  tokenId: string
  /** A janela tem valor desenhável para este token (ficha local ou resumo)? */
  hasValues: boolean
  prefs: TokenTrackerLocalPrefs
}): boolean {
  const { tokenId, hasValues, prefs } = input
  if (!tokenId) return false
  if (prefs.muted.includes(tokenId)) return false
  return hasValues || prefs.watchlist.includes(tokenId)
}

/** Adiciona o token à lista, tirando-o dos mutados. */
export function addToWatchlist(prefs: TokenTrackerLocalPrefs, tokenId: string): TokenTrackerLocalPrefs {
  if (!tokenId) return prefs
  return {
    ...prefs,
    muted: prefs.muted.filter(id => id !== tokenId),
    watchlist: prefs.watchlist.includes(tokenId) ? prefs.watchlist : [...prefs.watchlist, tokenId],
  }
}

/** Remove o token da lista (o automático sai via `muted`). */
export function removeFromWatchlist(
  prefs: TokenTrackerLocalPrefs,
  tokenId: string
): TokenTrackerLocalPrefs {
  if (!tokenId) return prefs
  return {
    ...prefs,
    muted: prefs.muted.includes(tokenId) ? prefs.muted : [...prefs.muted, tokenId],
    watchlist: prefs.watchlist.filter(id => id !== tokenId),
  }
}

/**
 * Descarta entradas que não existem mais na cena (token apagado ou desvinculado),
 * para a lista não crescer com lixo entre sessões.
 */
export function pruneWatchlist(
  prefs: TokenTrackerLocalPrefs,
  validTokenIds: string[]
): TokenTrackerLocalPrefs {
  const valid = new Set(validTokenIds)
  const watchlist = prefs.watchlist.filter(id => valid.has(id))
  const muted = prefs.muted.filter(id => valid.has(id))
  if (watchlist.length === prefs.watchlist.length && muted.length === prefs.muted.length) return prefs
  return { ...prefs, watchlist, muted }
}

/** Sanitiza o que veio do storage (dado local, mas ainda assim de fora do código). */
export function sanitizeLocalPrefs(value: unknown): TokenTrackerLocalPrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TOKEN_TRACKER_LOCAL_PREFS }
  }
  const raw = value as Partial<TokenTrackerLocalPrefs>
  return {
    id: TOKEN_TRACKER_LOCAL_PREFS_ID,
    watchlist: readIdList(raw.watchlist),
    muted: readIdList(raw.muted),
  }
}

function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Lê as preferências locais desta janela. Nunca lança: cai no default. */
export async function loadLocalPrefs(): Promise<TokenTrackerLocalPrefs> {
  try {
    const stored = await GetItem('settings', TOKEN_TRACKER_LOCAL_PREFS_ID)
    return sanitizeLocalPrefs(stored)
  } catch (err) {
    console.warn('[TokenTracker] Falha ao ler as preferências locais:', err)
    return { ...DEFAULT_TOKEN_TRACKER_LOCAL_PREFS }
  }
}

/** Grava as preferências locais (o `id` é exigido pelo `SetItem`). */
export async function saveLocalPrefs(prefs: TokenTrackerLocalPrefs): Promise<void> {
  try {
    await SetItem('settings', { ...prefs, id: TOKEN_TRACKER_LOCAL_PREFS_ID })
  } catch (err) {
    console.warn('[TokenTracker] Falha ao gravar as preferências locais:', err)
  }
}
