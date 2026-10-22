<template>
  <end-round-dialog
    label-key="active.endRound.finishTurn"
    title-key="active.endRound.confirmFinishTurn"
    icon="mdi-check-all"
  >
    <template #default="{ isActive }">
      <v-card-text>
        <cc-alert
          v-if="hasRemainingActions"
          color="error"
          icon="mdi-alert"
          variant="outlined"
          :title="$t('active.titles.youHaveRemainingActions')"
        >
          <v-row
            class="my-1 mx-4 px-2 text-text bg-panel flex-nowrap"
            justify="space-around"
          >
            <end-round-action-chips
              :controller="controller"
              large
            />
          </v-row>
          <div class="heading text-center">
            {{ $t('active.pcEndRound.forfeitActions') }}
          </div>
        </cc-alert>

        <cc-alert
          v-if="remainingMovement"
          color="warning"
          icon="mdi-run-fast"
          variant="outlined"
          :title="$t('active.pcEndRound.movementRemainingTitle')"
        >
          <div class="heading text-center">
            {{ $t('active.pcEndRound.movementRemaining', { n: remainingMovement }) }}
          </div>
        </cc-alert>

        <v-divider class="my-4" />
        <cc-button
          id="npc-runner-finish-turn"
          color="primary"
          block
          prepend-icon="mdi-check-all"
          @click="endTurn(isActive)"
        >
          {{ $t('active.endRound.finishTurn') }}
        </cc-button>
      </v-card-text>
    </template>
  </end-round-dialog>

  <burn-check-modal
    v-if="controller"
    v-model="burnDialog"
    :cc="controller"
    @resolved="resumeTurn"
  />

  <v-dialog
    v-model="holdDialog"
    max-width="480"
  >
    <v-card class="pa-4">
      <div class="heading h3 mb-2">{{ $t('active.structureCheck.blocksTurn') }}</div>
      <cc-flow-request :request="pendingTurn?.request" />
      <v-card-actions>
        <v-spacer />
        <cc-button
          variant="text"
          @click="holdDialog = false"
        >
          {{ $t('common.close') }}
        </cc-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, shallowRef } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import type { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import type { IFlowResult } from '@/classes/components/combat/flows/Flow'
  import type { IEndTurnState } from '@/classes/components/combat/flows/LifecycleFlow'
  import { StatKey } from '@/classes/components/combat/stats/Stats'
  import { ActivePeriod } from '@/classes/Frequency'
  import EndRoundDialog from '../../_shared/_EndRoundDialog.vue'
  import EndRoundActionChips from '../../_components/EndRoundActionChips.vue'
  import BurnCheckModal from '../../gm/EncounterPanels/_components/BurnCheckModal.vue'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { tokenMovementCapture } from '@/services/tokenMovementCapture'

  defineOptions({ name: 'NpcEndTurn' })

  /**
   * Fim de TURNO de um único NPC (ficha avulsa do NPC). Diferente do
   * `GmEndRoundPanel`, não encerra a rodada nem o encontro: só passa este NPC
   * pelo `EndTurnFlow` (queimadura/checagens) e devolve ações e movimento.
   */
  const props = defineProps<{
    combatant: CombatantData
    encounterInstance: EncounterInstance
    sheetId?: string
  }>()

  const { t } = useI18n()

  const controller = computed<any>(
    () => (props.combatant?.actor as any)?.CombatController?.ActiveActor?.CombatController ?? null
  )
  const hasRemainingActions = computed(() => !!controller.value?.HasRemainingActions)
  const remainingMovement = computed(() => {
    const c = controller.value
    if (!c || c.IsBracedTurn) return 0
    return c.StatController.getCurrent(StatKey.SPEED) || 0
  })

  const burnDialog = ref(false)
  const holdDialog = ref(false)
  const pendingTurn = shallowRef<IFlowResult<IEndTurnState> | null>(null)

  function endTurn(isActive: { value: boolean }) {
    isActive.value = false
    const c = controller.value
    if (!c) return
    hold(c.EndTurn(props.encounterInstance))
  }

  function resumeTurn(answer: { success?: boolean; skip?: boolean; rolled?: number }) {
    if (!pendingTurn.value || !controller.value) return
    hold(controller.value.ResumeEndTurn(pendingTurn.value, answer))
  }

  function hold(result: IFlowResult<IEndTurnState>) {
    if (result.outcome !== 'awaiting') {
      pendingTurn.value = null
      burnDialog.value = false
      holdDialog.value = false
      if (result.outcome === 'complete') void afterTurn()
      return
    }
    pendingTurn.value = result
    burnDialog.value = result.pending === 'burn-check'
    holdDialog.value = !burnDialog.value && !!result.request
  }

  async function afterTurn() {
    const c = controller.value
    if (c) {
      c.ResetCombatActions()
      c.ClearBoost()
      const speed = c.Braced && c.BracedPenaltyActive ? 0 : c.StatController.getMax(StatKey.SPEED)
      c.StatController.setCurrentStat(StatKey.SPEED, speed, { silent: true })
      c.ClearUses(ActivePeriod.Turn)
      c.ActionPoolController.ClearReactionUses()
      c.CombatLogVersion++
    }

    void (props.encounterInstance as any)?.Save?.()

    try {
      const name = c?.CombatName || (props.combatant?.actor as any)?.Name || 'NPC'
      void useTableActionStore().postAction({
        senderName: name,
        category: 'full_action',
        title: t('active.endRound.turnEndedTitle', { name }),
        detail: t('active.endRound.turnEndedDetail'),
      })
    } catch {
      // store indisponível nesta janela
    }

    const sheetId = props.sheetId || (props.combatant?.actor as any)?.ID
    if (sheetId) await tokenMovementCapture.resetRoundMovements({ filter: { sheetId } })
  }
</script>
