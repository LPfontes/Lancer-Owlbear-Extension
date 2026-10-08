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
  const mechSc = combatant?.actor?.ActiveMech?.CombatController?.StatController
  const pilotSc = combatant?.actor?.CombatController?.StatController

  const maxRaw = Number(mechSc?.MaxStats?.activations ?? pilotSc?.MaxStats?.activations)
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.trunc(maxRaw) : 1

  const currentRaw = Number(mechSc?.CurrentStats?.activations ?? pilotSc?.CurrentStats?.activations)
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
  if (!instance || instance.IsActive === false) return null

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

/**
 * Escolhe de onde hidratar o tracker.
 *
 * O **servidor de sincronização** é quem guarda o "encontro salvo" da mesa
 * (`INIT_SYNC.activeTracker` → `roomSyncedTracker`) e por isso tem prioridade. O
 * snapshot no metadata da sala do Owlbear é LEGADO: o app não grava mais ali, e a
 * leitura só serve para salas que ainda tenham o payload de uma versão anterior.
 *
 * Puro de propósito: a leitura das duas fontes fica no serviço, e a decisão pode ser
 * testada sem arrastar o bridge inteiro.
 */
export function pickTrackerSnapshot(
  socketSnapshot: unknown,
  legacyRoomMetadata: unknown
): SyncedTrackerSnapshot | null {
  return sanitizeTrackerSnapshot(socketSnapshot) ?? sanitizeTrackerSnapshot(legacyRoomMetadata)
}

/**
 * Assinatura SÓ da iniciativa: cards (com ativações), rodada e turno atual.
 *
 * Deixa de fora identidade e nome do encontro de propósito — duas janelas da mesma mesa
 * guardam o encontro com IDs próprios, e comparar o ID faria a troca automática nunca
 * convergir (o Mestre substituiria o encontro para sempre).
 */
function initiativeSignature(snapshot: SyncedTrackerSnapshot): string {
  return JSON.stringify({ r: snapshot.round, t: snapshot.inTurnId, c: snapshot.cards })
}

/**
 * A sala publicou um combate DIFERENTE do que esta janela já tem?
 *
 * É a pergunta que decide a troca automática do encontro local pelo da sala: comparar a
 * iniciativa local (rodada, turno, cards) com a do snapshot recebido deixa a operação
 * idempotente — reaplicar o mesmo combate não faz nada, e o eco da própria publicação
 * não vira ping-pong.
 *
 * Puro de propósito: a decisão pode ser testada sem arrastar o store/bridge.
 */
export function roomEncounterDiffers(
  localInstance: any,
  inTurnId: string | null,
  roomSnapshot: unknown
): boolean {
  const room = sanitizeTrackerSnapshot(roomSnapshot)
  if (!room || !room.cards.length) return false

  const local = buildTrackerSnapshot(localInstance, inTurnId)
  if (!local) return true

  return initiativeSignature(local) !== initiativeSignature(room)
}

/**
 * Vale publicar este snapshot do tracker?
 *
 * Não quando a janela está **mais pobre** que a sala. Um painel que acabou de abrir monta o
 * snapshot do encontro local — que pode estar vazio — ANTES de receber o estado da mesa, e
 * um `TRACKER_SYNC` vazio apagava a iniciativa para todo mundo ("Encontro Vazio"). Regra:
 * quem já tem o combate publicado manda; a janela vazia espera a substituição pelo da sala.
 */
export function shouldPublishTrackerSnapshot(
  localSnapshot: unknown,
  roomSnapshot: unknown
): boolean {
  const local = sanitizeTrackerSnapshot(localSnapshot)
  if (!local) return false
  if (local.cards.length) return true

  const room = sanitizeTrackerSnapshot(roomSnapshot)
  return !(room && room.cards.length > 0)
}

/**
 * Qual rodada o tracker deve MOSTRAR.
 *
 * Na visão sincronizada (jogador, ou Mestre sem encontro local) quem manda é a sala —
 * o número vem do `TRACKER_SYNC`/`INIT_SYNC` que o `TableSyncSocket` recebeu. Na visão
 * local, a rodada é a do encontro desta janela. Sem isso o cabeçalho continuava exibindo
 * a rodada local (parada) enquanto a mesa já estava em outra.
 */
export function displayedTrackerRound(
  usesSyncedTracker: boolean,
  syncedRound: unknown,
  localRound: unknown
): number {
  const toRound = (value: unknown): number => {
    const round = Number(value)
    return Number.isFinite(round) && round > 0 ? Math.floor(round) : 0
  }

  if (usesSyncedTracker) {
    return toRound(syncedRound) || toRound(localRound) || 1
  }
  return toRound(localRound) || toRound(syncedRound) || 1
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
