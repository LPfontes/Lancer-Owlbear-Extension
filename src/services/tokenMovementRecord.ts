import type { TokenTrackerMovementRecord, TokenTrackerValue } from '@/types/token-tracker'

/**
 * Movimento gravado no TOKEN (§13 — revisão da captura). Puro.
 *
 * Por que não viver só na ficha: o número muda pelo arrasto no mapa, e o arrasto pode
 * acontecer numa janela que não tem o controlador vivo (a ficha vive noutro iframe).
 * Nesse desenho, ou duas janelas debitavam o mesmo arrasto (todas veem o
 * `items.onChange`, e `lastModifiedUserId` é do USUÁRIO, não da janela), ou nenhuma
 * debitava porque a ficha não estava ali.
 *
 * Com o registro no token: **um escritor** (a janela que arrastou), **um número** para
 * todas as janelas desenharem, e a janela da ficha alinhando o `SPEED` dela ao valor
 * registrado.
 */

export const MOVEMENT_RECORD_VERSION = 1

function toNonNegativeInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.trunc(n))
}

/** Lê o registro do metadata do token. `null` quando não existe ou está corrompido. */
export function sanitizeMovementRecord(raw: unknown): TokenTrackerMovementRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (toNonNegativeInt(record.v) !== MOVEMENT_RECORD_VERSION) return null

  const current = toNonNegativeInt(record.current)
  const max = toNonNegativeInt(record.max)
  const boost = toNonNegativeInt(record.boost)
  // Sem máximo conhecido não há o que desenhar nem com o que decidir: melhor tratar
  // como ausente e reconstruir da ficha.
  if (max <= 0 && current <= 0) return null

  return {
    v: MOVEMENT_RECORD_VERSION,
    current,
    max,
    boost,
    t: toNonNegativeInt(record.t),
    ...(typeof record.w === 'string' && record.w ? { w: record.w } : {}),
  }
}

/** Registro a partir do estado vivo do motor (primeiro arrasto de um turno). */
export function movementRecordFromStats(
  stats: { remaining: unknown; maxSpeed: unknown; boostBonus: unknown },
  writer?: string
): TokenTrackerMovementRecord {
  return {
    v: MOVEMENT_RECORD_VERSION,
    current: toNonNegativeInt(stats.remaining),
    max: toNonNegativeInt(stats.maxSpeed),
    boost: toNonNegativeInt(stats.boostBonus),
    t: Date.now(),
    ...(writer ? { w: writer } : {}),
  }
}

/** O valor do slot `speed` para o desenho: restante / cap do turno. */
export function movementValueFromRecord(
  record: TokenTrackerMovementRecord
): TokenTrackerValue {
  return { current: record.current, max: record.max + record.boost }
}

/**
 * Debita `spaces` do registro. Devolve o registro novo e o excedente que NÃO coube.
 *
 * `spent` nunca passa do restante (o motor clampa em zero de qualquer jeito, e o
 * excedente é o que vira oferta de Boost).
 */
export function spendFromMovementRecord(
  record: TokenTrackerMovementRecord,
  spaces: unknown,
  writer?: string
): { record: TokenTrackerMovementRecord; spent: number; over: number } {
  const wanted = toNonNegativeInt(spaces)
  const spent = Math.min(wanted, record.current)
  return {
    record: {
      ...record,
      current: record.current - spent,
      t: Date.now(),
      ...(writer ? { w: writer } : {}),
    },
    spent,
    over: wanted - spent,
  }
}

/** O movimento registrado é suficiente para este gesto? */
export function recordCoversSpend(
  record: TokenTrackerMovementRecord,
  spaces: unknown
): boolean {
  return toNonNegativeInt(spaces) <= record.current
}

/** Registro "cheio": usado no fim de turno/rodada (movimento de volta ao máximo). */
export function fullMovementRecord(
  record: TokenTrackerMovementRecord,
  writer?: string
): TokenTrackerMovementRecord {
  return {
    ...record,
    current: record.max,
    boost: 0,
    t: Date.now(),
    ...(writer ? { w: writer } : {}),
  }
}

/**
 * Registro de movimento de cada token da cena, por id.
 *
 * Lê do `items` que o `onChange` já entregou — sem ida extra ao SDK, que é o que
 * permite reconciliar a ficha a cada mudança de metadata sem custo relevante.
 */
export function collectMovementRecords(
  items: unknown,
  metadataKey: string
): Map<string, TokenTrackerMovementRecord> {
  const records = new Map<string, TokenTrackerMovementRecord>()
  if (!Array.isArray(items)) return records

  for (const raw of items) {
    const item = raw as { id?: unknown; layer?: unknown; metadata?: unknown }
    if (item?.layer !== 'CHARACTER') continue
    if (typeof item.id !== 'string' || !item.id) continue
    const metadata = item.metadata as Record<string, unknown> | undefined
    const record = sanitizeMovementRecord(metadata?.[metadataKey])
    if (record) records.set(item.id, record)
  }
  return records
}

/** O registro mudou de forma que valha reconciliar a ficha? */
export function movementRecordChanged(
  previous: TokenTrackerMovementRecord | undefined,
  next: TokenTrackerMovementRecord
): boolean {
  if (!previous) return true
  return previous.t !== next.t || previous.current !== next.current || previous.boost !== next.boost
}
