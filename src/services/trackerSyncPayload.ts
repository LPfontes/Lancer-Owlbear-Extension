import type { SyncedTrackerCard, SyncedTrackerSnapshot, TrackerCardKind } from '@/types/tracker-sync'

/**
 * Parte pura da sincronização do tracker: montar, validar e limitar o snapshot leve
 * que o Mestre publica para os jogadores.
 *
 * Fica separado do serviço (`trackerSync.ts`) de propósito: aqui não há OBR, Pinia nem
 * efeitos colaterais, então o formato do payload pode ser testado direto.
 *
 * O que NUNCA entra no snapshot: PV, calor, estrutura, stress, retratos, tags, itens ou
 * qualquer outro dado de ficha. O tracker sincronizado é público para a mesa.
 */

/** Teto de cards publicados (mantém o payload dentro do limite de metadata da sala). */
export const MAX_SYNCED_CARDS = 60

/** Margem de segurança para o payload no room metadata (~16 kB no total). */
export const MAX_SNAPSHOT_CHARS = 12000

const KINDS: TrackerCardKind[] = ['pilot', 'unit', 'doodad', 'eidolon']
const knownKinds = new Set<string>(KINDS)

/** Lados aceitos. O valor entra numa classe CSS (`side-<lado>`), então é fechado de propósito. */
const SIDES = ['enemy', 'ally', 'neutral'] as const
const knownSides = new Set<string>(SIDES)

function toSide(value: unknown): string {
  const raw = String(value || '')
  return knownSides.has(raw) ? raw : 'neutral'
}

function toKind(value: unknown): TrackerCardKind {
  const raw = String(value || '')
  return knownKinds.has(raw) ? (raw as TrackerCardKind) : 'unit'
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

function readActivations(combatant: any): { current: number; max: number } {
  const statController = combatant?.actor?.CombatController?.StatController
  const maxRaw = Number(statController?.MaxStats?.activations)
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.trunc(maxRaw) : 1
  const currentRaw = Number(statController?.CurrentStats?.activations)
  const current = Number.isFinite(currentRaw) ? Math.trunc(currentRaw) : 0
  return { current: Math.max(0, Math.min(max, current)), max }
}

/**
 * Monta o snapshot público a partir do encontro ativo do Mestre.
 *
 * Combatentes ocultos (`hiddenFromPlayers`) ou ainda não posicionados (`reinforcement`)
 * são omitidos: o Fog of War do tracker do Mestre vale para os jogadores também.
 */
export function buildTrackerSnapshot(
  instance: any,
  inTurnId: string | null = null
): SyncedTrackerSnapshot | null {
  if (!instance) return null

  const rawCombatants = Array.isArray(instance.Combatants) ? instance.Combatants : []
  const cards: SyncedTrackerCard[] = []

  for (const combatant of rawCombatants) {
    if (!combatant || !combatant.id) continue
    if (combatant.hiddenFromPlayers || combatant.reinforcement) continue

    const number = toInt(combatant.number, 0)
    cards.push({
      id: String(combatant.id),
      name: String(combatant.actor?.Name || 'Combatente'),
      side: toSide(combatant.side),
      index: toInt(combatant.index, cards.length),
      number: number > 1 ? number : 0,
      activations: readActivations(combatant),
      kind: toKind(combatant.type),
    })
  }

  cards.sort((a, b) => a.index - b.index)
  const limited = cards.slice(0, MAX_SYNCED_CARDS)

  return {
    encounterId: String(instance.ID || instance.id || ''),
    name: String(instance.Name || 'Encontro'),
    round: Math.max(1, toInt(instance.Round, 1)),
    inTurnId: inTurnId && limited.some(c => c.id === inTurnId) ? String(inTurnId) : null,
    cards: limited,
    updatedAt: Date.now(),
  }
}

/**
 * Sanitiza um snapshot recebido por broadcast.
 *
 * O payload vem de outro cliente, então nada é confiado: campos desconhecidos são
 * descartados, tipos são coagidos e a lista é limitada. Devolve `null` quando o
 * payload não tem a forma mínima esperada.
 */
export function sanitizeTrackerSnapshot(value: unknown): SyncedTrackerSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const data = value as any
  if (!Array.isArray(data.cards)) return null

  const cards: SyncedTrackerCard[] = []
  for (const raw of data.cards.slice(0, MAX_SYNCED_CARDS)) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id : String(raw.id ?? '')
    if (!id) continue
    const max = Math.max(1, toInt(raw.activations?.max, 1))
    const current = Math.max(0, Math.min(max, toInt(raw.activations?.current, 0)))
    const number = toInt(raw.number, 0)
    cards.push({
      id,
      name: String(raw.name || 'Combatente').slice(0, 120),
      side: toSide(raw.side),
      index: toInt(raw.index, cards.length),
      number: number > 1 ? number : 0,
      activations: { current, max: Math.min(max, 99) },
      kind: toKind(raw.kind),
    })
  }

  const inTurnId = typeof data.inTurnId === 'string' && data.inTurnId ? data.inTurnId : null

  return {
    encounterId: String(data.encounterId || '').slice(0, 120),
    name: String(data.name || 'Encontro').slice(0, 120),
    round: Math.max(1, toInt(data.round, 1)),
    inTurnId: inTurnId && cards.some(c => c.id === inTurnId) ? inTurnId : null,
    cards,
    updatedAt: toInt(data.updatedAt, Date.now()),
  }
}

/** Assinatura do conteúdo, usada para não republicar snapshots idênticos. */
export function trackerSnapshotSignature(snapshot: SyncedTrackerSnapshot | null): string {
  if (!snapshot) return ''
  return JSON.stringify({
    e: snapshot.encounterId,
    n: snapshot.name,
    r: snapshot.round,
    t: snapshot.inTurnId,
    c: snapshot.cards,
  })
}

/**
 * Remove cards do fim da lista até o payload caber na margem de segurança do
 * metadata da sala. O broadcast em si não passa por aqui (o limite dele é maior).
 */
export function fitSnapshotToBudget(snapshot: SyncedTrackerSnapshot): SyncedTrackerSnapshot {
  if (JSON.stringify(snapshot).length <= MAX_SNAPSHOT_CHARS) return snapshot

  const cards = [...snapshot.cards]
  while (cards.length > 0 && JSON.stringify({ ...snapshot, cards }).length > MAX_SNAPSHOT_CHARS) {
    cards.pop()
  }
  return { ...snapshot, cards }
}
