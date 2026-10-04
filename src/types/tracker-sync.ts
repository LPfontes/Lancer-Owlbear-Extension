/**
 * Payload leve do tracker de iniciativa compartilhado entre o Mestre e os jogadores.
 *
 * Regra de ouro: aqui NÃO entra nada de ficha. Só o suficiente para desenhar o card
 * da iniciativa (nome, lado, ordem, ativações restantes e quem está em turno).
 * PV, calor, estrutura, stats, retratos, tags e qualquer outro dado de ficha ficam
 * fora do broadcast de propósito: o tracker sincronizado é público para a mesa.
 */

export type TrackerCardKind = 'pilot' | 'unit' | 'doodad' | 'eidolon'

export interface SyncedTrackerCard {
  /** ID do combatente dentro do encontro do Mestre (não é o ID da ficha). */
  id: string
  name: string
  side: string
  /** Posição na ordem de iniciativa. */
  index: number
  /** Sufixo do nome (#2, #3...) quando há vários NPCs com o mesmo nome. 0 = sem sufixo. */
  number: number
  activations: {
    current: number
    max: number
  }
  kind: TrackerCardKind
}

export interface SyncedTrackerSnapshot {
  encounterId: string
  name: string
  round: number
  /** ID do combatente em turno, ou null. */
  inTurnId: string | null
  cards: SyncedTrackerCard[]
  /** Momento em que o Mestre gerou o snapshot (informativo). */
  updatedAt: number
}

/** Tipos de mensagem de broadcast usados pela sincronização do tracker. */
export const TRACKER_SYNC_MESSAGE = 'TRACKER_SYNC'
export const TRACKER_SYNC_CLEAR_MESSAGE = 'TRACKER_SYNC_CLEAR'
export const TRACKER_SYNC_REQUEST_MESSAGE = 'TRACKER_SYNC_REQUEST'
