import {
  COMPCON_TOKEN_STATUSES_KEY,
  TOKEN_STATUS_SCHEMA_VERSION,
  type TokenDirectStatusPayload,
  type TokenStatusPriorityMode,
} from '@/types/token-status'
import {
  normalizeStatusId,
  parseCustomStatusMarkerId,
  customStatusMarkerId,
} from '@/services/statusIcons'

export { COMPCON_TOKEN_STATUSES_KEY, TOKEN_STATUS_SCHEMA_VERSION }
export type { TokenDirectStatusPayload, TokenStatusPriorityMode }

/**
 * Coberturas conhecidas que devem ficar no topo da coluna de badges.
 */
const COVER_STATUS_IDS = ['softcover', 'hardcover']

/**
 * Ordena a lista de IDs de marcadores visuais conforme a regra do LANCER:
 * 1. Cobertura (softcover / hardcover) vai no topo (índice 0).
 * 2. Condições e Estados oficiais vão no meio.
 * 3. Status personalizados (custom:*) vão no final.
 */
export function sortStatusMarkers(statuses: string[]): string[] {
  const normalized = Array.from(
    new Set(
      statuses
        .map(s => {
          if (!s || typeof s !== 'string') return null
          const trimmed = s.trim()
          if (parseCustomStatusMarkerId(trimmed)) return trimmed
          return normalizeStatusId(trimmed)
        })
        .filter((s): s is string => s !== null)
    )
  )

  const cover: string[] = []
  const standard: string[] = []
  const custom: string[] = []

  for (const id of normalized) {
    if (COVER_STATUS_IDS.includes(id)) {
      cover.push(id)
    } else if (parseCustomStatusMarkerId(id)) {
      custom.push(id)
    } else {
      standard.push(id)
    }
  }

  // Apenas uma cobertura permitida no topo
  const finalCover = cover.length > 0 ? [cover[cover.length - 1]] : []

  return [...finalCover, ...standard, ...custom]
}

/**
 * Sanitiza um payload vindo do metadata do item no Owlbear Rodeo.
 * Devolve `null` se os dados forem inválidos ou corrompidos.
 */
export function sanitizeTokenStatusPayload(raw: unknown): TokenDirectStatusPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<TokenDirectStatusPayload>

  if (typeof data.v !== 'number' || data.v > TOKEN_STATUS_SCHEMA_VERSION) {
    return null
  }

  if (!Array.isArray(data.statuses)) {
    return null
  }

  const rawStatuses = data.statuses
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim())

  const sanitizedStatuses = sortStatusMarkers(rawStatuses)

  const updatedAt = typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt)
    ? data.updatedAt
    : Date.now()

  const updatedBy = typeof data.updatedBy === 'string' && data.updatedBy.trim().length > 0
    ? data.updatedBy.trim().slice(0, 64)
    : 'unknown'

  const priorityMode: TokenStatusPriorityMode =
    data.priorityMode === 'merge_priority' ? 'merge_priority' : 'override'

  return {
    v: TOKEN_STATUS_SCHEMA_VERSION,
    statuses: sanitizedStatuses,
    updatedAt,
    updatedBy,
    priorityMode,
  }
}

/**
 * Cria um novo payload de status direto do token.
 */
export function createTokenStatusPayload(
  statuses: string[],
  updatedBy: string,
  priorityMode: TokenStatusPriorityMode = 'override'
): TokenDirectStatusPayload {
  return {
    v: TOKEN_STATUS_SCHEMA_VERSION,
    statuses: sortStatusMarkers(statuses),
    updatedAt: Date.now(),
    updatedBy: updatedBy.trim().slice(0, 64) || 'unknown',
    priorityMode,
  }
}

/**
 * Resolve a lista final de marcadores de status a serem desenhados no token.
 *
 * REGRA CENTRAL DE PRIORIDADE:
 * O efeito aplicado diretamente no token tem prioridade sobre os dados da ficha
 * e sobre a sincronização da sala.
 *
 * - Se `tokenPayload` existe e está em modo 'override':
 *   A lista do token é absoluta (a ficha não impõe nada).
 * - Se `tokenPayload` existe e está em modo 'merge_priority':
 *   Une os status do token e da ficha, com os do token tendo prioridade.
 * - Se `tokenPayload` for nulo/indefinido (sem override manual no mapa):
 *   Espelha normalmente os status da ficha.
 */
export function resolveEffectiveStatuses(
  tokenPayload: TokenDirectStatusPayload | null | undefined,
  sheetStatuses: string[] = []
): string[] {
  const cleanSheet = sortStatusMarkers(sheetStatuses)

  if (!tokenPayload) {
    return cleanSheet
  }

  if (tokenPayload.priorityMode === 'override') {
    return sortStatusMarkers(tokenPayload.statuses)
  }

  // merge_priority: une ficha + token
  const combined = new Set([...cleanSheet, ...tokenPayload.statuses])
  return sortStatusMarkers(Array.from(combined))
}

/**
 * Alterna (liga/desliga) um status na lista atual de status do token.
 */
export function toggleTokenStatus(currentStatuses: string[], statusIdOrAlias: string): string[] {
  const customName = parseCustomStatusMarkerId(statusIdOrAlias)
  const normId = customName ? customStatusMarkerId(customName) : normalizeStatusId(statusIdOrAlias)

  if (!normId) return currentStatuses

  const current = sortStatusMarkers(currentStatuses)
  const exists = current.includes(normId)

  if (exists) {
    return current.filter(id => id !== normId)
  }

  // Se estiver adicionando cobertura, remove a outra cobertura conflitante
  let updated = [...current]
  if (normId === 'softcover') {
    updated = updated.filter(id => id !== 'hardcover')
  } else if (normId === 'hardcover') {
    updated = updated.filter(id => id !== 'softcover')
  }

  updated.push(normId)
  return sortStatusMarkers(updated)
}

/**
 * Define explicitamente o nível de cobertura do token ('none' | 'soft' | 'hard').
 */
export function setTokenCover(currentStatuses: string[], cover: 'none' | 'soft' | 'hard'): string[] {
  const withoutCover = currentStatuses.filter(s => s !== 'softcover' && s !== 'hardcover')
  if (cover === 'soft') {
    return sortStatusMarkers(['softcover', ...withoutCover])
  }
  if (cover === 'hard') {
    return sortStatusMarkers(['hardcover', ...withoutCover])
  }
  return sortStatusMarkers(withoutCover)
}
