import { markRaw } from 'vue'
import { Flow, step } from './Flow'
import type { IFlowStep } from './Flow'
import { StatKey } from '../stats/Stats'
import { ActivePeriod } from '@/classes/Frequency'
import { BRACED_COMBAT_ACTIONS, DEFAULT_COMBAT_ACTIONS } from '../ActionPoolController'
import { TimedEffect } from '../../feature/active_effects/TimedEffect'
import { expiredIn } from '../Duration'
import { statusRef } from '../log/refs'
import type { CombatController } from '../CombatController'
import { combatLogHooks } from './logHooks'

export interface IEndTurnState {
  cc: CombatController
  encounter?: any
  burnResolved: boolean
}

interface IEndRoundState {
  cc: CombatController
  encounter?: any
  silent?: boolean
}

const burnCheck: IFlowStep<IEndTurnState> = {
  Name: 'burn-check',
  Run: (s, input) => {
    if (s.burnResolved) return 'continue'
    if (!s.cc.StatController.getCurrent(StatKey.BURN)) return 'continue'
    const answer = input as { success?: boolean; skip?: boolean; rolled?: number } | undefined
    if (!answer) return 'await'
    if (answer.skip) {
      s.burnResolved = true
      return 'continue'
    }
    if (typeof answer.success !== 'boolean') return 'await'
    s.cc.ResolveBurn(answer.success, answer.rolled)
    s.burnResolved = true
    return 'continue'
  },
  Request: () => ({ kind: 'check', label: 'burn' }),
}

const pendingChecks: IFlowStep<IEndTurnState> = {
  Name: 'pending-checks',
  Run: s => (s.cc.PendingChecks.length ? 'await' : 'continue'),
  Request: s => ({
    kind: 'check',
    label: 'structureOrStressCheck',
    pending: s.cc.PendingChecks.map(p => p.kind),
  }),
}

const clearOvercharge = step<IEndTurnState>('clear-overcharge', s => {
  s.cc.ActionPoolController.InOvercharge = false
})

const spendActivation = step<IEndTurnState>('spend-activation', s => {
  s.cc.StatController.bumpCurrentStat(StatKey.ACTIVATIONS, -1)
  s.cc.Record('turn.end', {
    activationsRemaining: s.cc.StatController.getCurrent(StatKey.ACTIVATIONS),
  })
})

const clearTurnUses = step<IEndTurnState>('clear-turn-uses', s => {
  s.cc.ClearUses(ActivePeriod.Turn)
  s.cc.Counterpart?.ClearUses(ActivePeriod.Turn)
})

const nextActivation = step<IEndTurnState>('next-activation', s => {
  const remaining = s.cc.StatController.getCurrent(StatKey.ACTIVATIONS)
  if (remaining < 1) return
  s.cc.Reset(ActivePeriod.Turn)
  if (s.cc.RefreshesReactionsEachTurn) s.cc.ActionPoolController.ClearReactionUses()
  s.cc.StartTurn()
  s.cc.StatController.setCurrentStat(StatKey.ACTIVATIONS, remaining)
  s.cc.Turn++
  s.cc.Record('turn.start', {
    activationsRemaining: s.cc.StatController.getCurrent(StatKey.ACTIVATIONS),
  })
})

const refreshTableReactions = step<IEndTurnState>('refresh-table-reactions', s => {
  s.cc.RefreshTurnReactions(s.encounter)
})

const clearBraced = step<IEndTurnState>('clear-braced', s => {
  if (!s.cc.Braced) return

  const now = Date.now()
  // Se esta mesma transição de fim de turno já foi processada recentemente (ex: chamadas
  // encadeadas no mesmo clique entre ficha, piloto e activeMech), ignora chamadas redundantes.
  if (s.cc.LastBraceTransitionTime && now - s.cc.LastBraceTransitionTime < 1000) {
    return
  }

  if (s.cc.BracedPenaltyPending || !s.cc.BracedPenaltyActive) {
    // O turno que está sendo encerrado é o turno onde o Suportar foi gasto (ou ativado).
    // O efeito do Suportar NÃO deve ser limpo aqui: ele permanece ativo (+1 Dificuldade,
    // ícone no token) e a penalidade (1 ação rápida) é armada para o PRÓXIMO turno.
    s.cc.BracedPenaltyPending = false
    s.cc.BracedPenaltyActive = true
    s.cc.LastBraceTransitionTime = now
    s.cc.CombatActions = { ...BRACED_COMBAT_ACTIONS }
    if (s.cc.Counterpart) {
      s.cc.Counterpart.BracedPenaltyPending = false
      s.cc.Counterpart.BracedPenaltyActive = true
      s.cc.Counterpart.LastBraceTransitionTime = now
      s.cc.Counterpart.CombatActions = { ...BRACED_COMBAT_ACTIONS }
    }
    return
  }

  // O turno com a penalidade do Suportar (1 ação rápida) acaba de ser concluído:
  // agora sim o Suportar é encerrado, o ícone é removido e o pool de ações é restaurado.
  s.cc.LastBraceTransitionTime = now
  s.cc.SetBraced(false)
  s.cc.ResetCombatActions()
})

export const EndTurnFlow = new Flow<IEndTurnState>(
  'EndTurnFlow',
  [
    burnCheck,
    pendingChecks,
    clearOvercharge,
    spendActivation,
    clearTurnUses,
    nextActivation,
    clearBraced,
    refreshTableReactions,
  ],
  combatLogHooks
)

const braceTeardown = step<IEndRoundState>('brace-teardown', s => {
  s.cc.Turn = 1
  s.cc.ClearBoost()
  
  if (s.cc.Braced) {
    s.cc.BracedPenaltyActive = true
    s.cc.BracedPenaltyPending = false
    s.cc.CombatActions = { ...BRACED_COMBAT_ACTIONS }
    if (s.cc.Counterpart) {
      s.cc.Counterpart.BracedPenaltyActive = true
      s.cc.Counterpart.BracedPenaltyPending = false
      s.cc.Counterpart.CombatActions = { ...BRACED_COMBAT_ACTIONS }
    }
  } else {
    s.cc.CombatActions = { ...DEFAULT_COMBAT_ACTIONS }
    s.cc.StatController.setCurrentStat(StatKey.SPEED, s.cc.StatController.getMax(StatKey.SPEED))
  }
})

const spendRemainingActivation = step<IEndRoundState>('spend-remaining-activation', s => {
  if (s.cc.StatController.getCurrent(StatKey.ACTIVATIONS) < 1) return
  s.cc.StatController.bumpCurrentStat(StatKey.ACTIVATIONS, -1)
  if (s.silent) return
  s.cc.Record('turn.end', {
    activationsRemaining: s.cc.StatController.getCurrent(StatKey.ACTIVATIONS),
  })
})

const refillActivations = step<IEndRoundState>('refill-activations', s => {
  s.cc.ActionPoolController.ClearReactionUses()
  s.cc.StatController.setCurrentStat(
    StatKey.ACTIVATIONS,
    s.cc.StatController.getMax(StatKey.ACTIVATIONS)
  )
  if (s.cc.Counterpart) {
    s.cc.Counterpart.ActionPoolController.ClearReactionUses()
    s.cc.Counterpart.StatController.setCurrentStat(
      StatKey.ACTIVATIONS,
      s.cc.Counterpart.StatController.getMax(StatKey.ACTIVATIONS)
    )
  }
  s.cc.ClearUses(ActivePeriod.Round)
  s.cc.Counterpart?.ClearUses(ActivePeriod.Round)
  clearEquipmentUses(s.cc)
  if (s.cc.Counterpart) clearEquipmentUses(s.cc.Counterpart)
})

function clearEquipmentUses(cc: CombatController): void {
  for (const item of cc.AllEquipment) {
    const limited = item?.IsLimited ?? item?.Tags?.some((t: any) => t.IsLimited)
    if (item?.Used && !item.IsLoading && !item.Recharge && !limited) item.Used = false
  }
}

const expireStatuses = step<IEndRoundState>('expire-statuses', s => {
  const newEffects: TimedEffect[] = []

  s.cc.getExpiredStatuses(s.cc.Round, s.cc.Parent.ID).forEach(x => {
    s.cc.Record('status.lose', { status: statusRef(x.status), reason: 'expired' })
    newEffects.push(
      new TimedEffect({
        nameKey: 'active.timedEffect.statusExpiredName',
        detailKey: 'active.timedEffect.statusExpiredDetail',
        detailParams: { name: x.status.Name },
        round: s.cc.Round,
        remove: { status: [x.status.ID] },
      })
    )
  })

  expiredIn(s.cc.CustomStatuses, s.cc.DurationContext()).forEach(x => {
    s.cc.Record('status.lose', { status: statusRef(x.status), reason: 'expired' })
    newEffects.push(
      new TimedEffect({
        nameKey: 'active.timedEffect.specialExpiredName',
        detailKey: 'active.timedEffect.specialExpiredDetail',
        detailParams: { attribute: x.status.Attribute },
        round: s.cc.Round,
        remove: { special: [{ attribute: x.status.Attribute, detail: x.status.Detail }] },
      })
    )
  })

  if (newEffects.length) s.cc.TimedEffects.push(...newEffects.map(markRaw))
})

const advanceRound = step<IEndRoundState>('advance-round', s => {
  if (!s.silent) s.cc.Record('round.end', { round: s.cc.Round })
  s.cc.Round++
  s.cc.StartRound()
  if (!s.silent) s.cc.Record('round.start', { round: s.cc.Round })
})

export const EndRoundFlow = new Flow<IEndRoundState>(
  'EndRoundFlow',
  [spendRemainingActivation, braceTeardown, refillActivations, expireStatuses, advanceRound],
  combatLogHooks
)
