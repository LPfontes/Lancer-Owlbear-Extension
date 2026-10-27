import { i18n } from '@/i18n'

export enum EffectDuration {
  StartTurnSelf = 'start_turn_self',
  StartTurnTarget = 'start_turn_target',
  EndTurnSelf = 'end_turn_self',
  EndTurnTarget = 'end_turn_target',
  NextTurnEndSelf = 'next_turn_end_self',
  NextTurnEndTarget = 'next_turn_end_target',
  NextTurnStartSelf = 'next_turn_start_self',
  NextTurnStartTarget = 'next_turn_start_target',
  // Sinônimos comuns usados em LCPs oficiais da Massif Press
  EndNextTurnTarget = 'end_next_turn_target',
  EndNextTurnSelf = 'end_next_turn_self',
  StartNextTurnTarget = 'start_next_turn_target',
  StartNextTurnSelf = 'start_next_turn_self',
  TurnEndSelf = 'turn_end_self',
  TurnEndTarget = 'turn_end_target',
  TurnStartSelf = 'turn_start_self',
  TurnStartTarget = 'turn_start_target',
}

export function normalizeDurationKey(duration?: string): string {
  const d = String(duration || '').trim().toLowerCase()
  if (d === 'end_next_turn_target' || d === 'next_turn_end_target') return 'next_turn_end_target'
  if (d === 'end_next_turn_self' || d === 'next_turn_end_self') return 'next_turn_end_self'
  if (d === 'start_next_turn_target' || d === 'next_turn_start_target') return 'next_turn_start_target'
  if (d === 'start_next_turn_self' || d === 'next_turn_start_self') return 'next_turn_start_self'
  if (d === 'turn_end_self' || d === 'end_turn_self') return 'end_turn_self'
  if (d === 'turn_end_target' || d === 'end_turn_target') return 'end_turn_target'
  if (d === 'turn_start_self' || d === 'start_turn_self') return 'start_turn_self'
  if (d === 'turn_start_target' || d === 'start_turn_target') return 'start_turn_target'
  return d
}

export const EffectDurationText = function (duration: string | EffectDuration): string {
  const norm = normalizeDurationKey(duration as string)
  const te = i18n?.global?.te?.bind(i18n.global)
  const t = i18n?.global?.t?.bind(i18n.global)

  const translateOr = (key: string, fallback: string): string => {
    if (te && t && te(key)) {
      return t(key)
    }
    return fallback
  }

  switch (norm) {
    case 'start_turn_self':
      return translateOr('ui.combat.durations.startTurnSelf', 'the start of your turn')
    case 'start_turn_target':
      return translateOr('ui.combat.durations.startTurnTarget', "the start of target's turn")
    case 'end_turn_self':
      return translateOr('ui.combat.durations.endTurnSelf', 'the end of your turn')
    case 'end_turn_target':
      return translateOr('ui.combat.durations.endTurnTarget', "the end of target's turn")
    case 'next_turn_end_self':
      return translateOr('ui.combat.durations.nextTurnEndSelf', 'the end of your next turn')
    case 'next_turn_end_target':
      return translateOr('ui.combat.durations.nextTurnEndTarget', "the end of target's next turn")
    case 'next_turn_start_self':
      return translateOr('ui.combat.durations.nextTurnStartSelf', 'the start of your next turn')
    case 'next_turn_start_target':
      return translateOr('ui.combat.durations.nextTurnStartTarget', "the start of target's next turn")
    default:
      return translateOr('ui.combat.durations.endOfEncounter', 'the end of the encounter')
  }
}

