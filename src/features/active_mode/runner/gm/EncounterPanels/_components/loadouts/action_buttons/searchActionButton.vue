<script setup lang="ts">
import { computed, ref } from 'vue'
import { Action } from '@/classes/Action'
import { useEncounterContext } from '../../../encounterContext'
import { useI18n } from 'vue-i18n'
import { notify } from '@/util/notify'
import type { CombatantData } from '@/classes/encounter/Encounter'
import { ActiveEffect } from '@/classes/components/feature/active_effects/ActiveEffect'
import { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
import CombatActionButton from './CombatActionButton.vue'
import CcForceOverride from '@/ui/components/modals/CCForceOverride.vue'
import FlatModifierSection from './FlatModifierSection.vue'
import ManualAdjustBadge from './ManualAdjustBadge.vue'
import { dddiceService } from '@/services/dddiceService'
import { checkSources, totalBonus } from '@/classes/components/combat/SkillCheckRules'
import { DiceRoller, D20RollResult } from '@/classes/dice/DiceRoller'
import { useTableActionStore } from '@/stores/tableActionStore'

const { encounterInstance, activeController: controller } = useEncounterContext()
const { t } = useI18n()

const props = defineProps<{
  action: Action
}>()

const action = computed(() => props.action)

const overridePrompt = ref(false)

const activation = computed(
  () => controller.value.ActivationFor(props.action.ID) ?? props.action.Activation
)
const blockReason = computed(() =>
  controller.value.BlockedReasonFor(activation.value, { actionId: props.action.ID })
)

const flatModifierRef = ref<InstanceType<typeof FlatModifierSection> | null>(null)

const lastRollResult = ref<D20RollResult | null>(null)
const rollDetails = ref('')
const manualAdjust = ref(0)

const gritBonus = computed(() =>
  controller.value?.RootActor?.StatController?.getMax('grit') || 0
)

const systemsBonus = computed(() => {
  const sources = checkSources(controller.value, 'systems')
  const baseBonus = totalBonus(sources, false)
  const flat = flatModifierRef.value?.flatAdjust
  const flatVal = typeof flat === 'number' ? flat : 0
  return baseBonus + flatVal
})

const netAccDiff = computed(() => {
  const acc = manualAdjust.value > 0 ? manualAdjust.value : 0
  const diff = manualAdjust.value < 0 ? Math.abs(manualAdjust.value) : 0
  return acc - diff
})

async function rollSystems() {
  let res: D20RollResult | null = null
  if (dddiceService.config.enabled) {
    try {
      const result = await dddiceService.rollDice({
        diceString: '1d20',
        flatBonus: systemsBonus.value || 0,
        accuracy: netAccDiff.value,
        label: `Sistemas [${controller.value.CombatName || 'Mecha'}]`,
        external_id: controller.value.CombatName || undefined,
      })

      if (result && result.values && result.values.length > 0) {
        const d20 = result.values.find((v: any) => v.type === 'd20' || v.type === '20')
        const rawDie = d20 && typeof d20.value !== 'undefined' ? Number(d20.value) : DiceRoller.rollDie(20)
        const d6Dice = result.values.filter((v: any) => (v.type === 'd6' || v.type === '6') && !v.is_dropped) || []
        const needed = Math.abs(netAccDiff.value)
        const accRolls: number[] = []
        for (let i = 0; i < needed; i++) {
          if (i < d6Dice.length && typeof d6Dice[i].value !== 'undefined') {
            accRolls.push(Number(d6Dice[i].value))
          } else {
            accRolls.push(DiceRoller.rollDie(6))
          }
        }
        let accRes = 0
        if (netAccDiff.value > 0 && accRolls.length > 0) accRes = Math.max(...accRolls)
        else if (netAccDiff.value < 0 && accRolls.length > 0) accRes = -Math.max(...accRolls)
        const total = rawDie + (systemsBonus.value || 0) + accRes
        res = new D20RollResult(total, rawDie, systemsBonus.value || 0, netAccDiff.value, accRolls, accRes)
      }
    } catch (e) {
      console.warn('[searchActionButton] dddice error, fallback to local:', e)
    }
  }

  if (!res) {
    res = DiceRoller.rollSkillCheck(systemsBonus.value || 0, netAccDiff.value)
  }
  lastRollResult.value = res

  const actorName = controller.value.CombatName || 'Mecha'
  const isCrit = Number(res.total) >= 20
  void useTableActionStore().postAction({
    senderName: actorName,
    category: 'roll',
    title: 'Teste de Sistemas (Procurar)',
    detail: res.toString ? res.toString() : String(res.total),
    roll: {
      total: Number(res.total) || 0,
      formula: `1d20${systemsBonus.value >= 0 ? '+' : ''}${systemsBonus.value}`,
      isCrit,
      accuracy: netAccDiff.value,
    },
    tags: ['Sistemas', 'Procurar', ...(isCrit ? ['CRÍTICO'] : [])],
  })
}

function newEvent(): ActiveEffectEvent {
  const self = encounterInstance.value.Combatants.find(
    (c: CombatantData) => c.actor.CombatController.RootActor.ID === controller.value.RootActor.ID
  )
  if (!self) throw new Error('Owner combatant not found')
  return new ActiveEffectEvent(
    self,
    new ActiveEffect(
      {
        id: props.action.ID,
        name: props.action.Name,
        detail: props.action.Detail,
        activation: props.action.Activation,
      } as any,
      self.actor
    ),
    encounterInstance.value
  )
}

const event = ref<ActiveEffectEvent>(newEvent())

function reset() {
  lastRollResult.value = null
  rollDetails.value = ''
}

function apply(close: () => void, force = false) {
  if (!force && blockReason.value) {
    overridePrompt.value = true
    return
  }

  controller.value.PerformAction(props.action.ID, {
    force,
  })

  // Broadcast para a mesa Owlbear
  const actorName = controller.value.CombatName || 'Piloto'
  void useTableActionStore().broadcastCombatAction({
    actorName,
    actionName: props.action.Name,
    actionType: 'quick_action',
    detail: lastRollResult.value ? `Teste de Sistemas: ${lastRollResult.value.total}` : undefined,
  })

  notify({
    title: props.action.Name,
    text: `${props.action.Name} executado!`,
  })

  event.value = newEvent()
  reset()
  close()
}
</script>

<template>
  <combat-action-button :action="action" min-width="560px">
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Action Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-hexagon-slice-3" color="action--quick" size="24" />
            <div>
              <div class="text-subtitle-1 font-weight-bold">{{ action.Name }}</div>
              <div class="text-caption text-disabled">{{ action.Terse || action.Detail }}</div>
            </div>
          </div>
          <v-chip color="action--quick" size="small" variant="elevated" class="font-weight-bold">
            {{ $enum('activationType', action.Activation) }}
          </v-chip>
        </div>

        <!-- Systems Roll Panel -->
        <div class="pa-3 mb-3 rounded bg-panel border-sm">
          <!-- Header row -->
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-overline font-weight-bold text-accent">
              <v-icon icon="mdi-cpu-64-bit" size="16" class="mr-1" />
              Teste de Sistemas
            </span>
            <v-chip size="x-small" color="secondary" variant="tonal">
              B&ocirc;nus: {{ systemsBonus >= 0 ? '+' : '' }}{{ systemsBonus }}
            </v-chip>
          </div>

          <!-- Flat Modifier Section -->
          <flat-modifier-section
            ref="flatModifierRef"
            :grit-bonus="gritBonus"
          />

          <!-- Manual Adjust + Total Badge -->
          <manual-adjust-badge
            v-model="manualAdjust"
            :net-acc-diff="netAccDiff"
          />

          <!-- Roll button -->
          <v-btn
            block
            flat
            tile
            color="primary"
            size="small"
            class="mb-2"
            @click="rollSystems"
          >
            <v-icon icon="mdi-dice-d20" start size="18" />
            Rolar Sistemas
          </v-btn>

          <!-- Roll Result Banner -->
          <v-slide-y-transition>
            <div
              v-if="lastRollResult"
              class="roll-result-banner pa-3 mt-2 rounded bg-panel border-sm border-panel-border"
            >
              <div class="d-flex align-center justify-space-between">
                <div>
                  <div class="text-overline text-disabled font-weight-bold">{{ $t('hud.attackRollResult') }}</div>
                  <div class="text-h5 font-weight-black text-white">
                    {{ $t('hud.total') }}: {{ lastRollResult.total }}
                    <span
                      v-if="lastRollResult.total >= 20"
                      class="ml-2 text-subtitle-1 text-warning font-weight-bold"
                    >
                      [{{ $t('hud.critical') }}]
                    </span>
                  </div>
                  <div
                    v-html-safe="lastRollResult.total.toString()"
                    class="text-caption text-disabled mt-1"
                  />
                </div>
              </div>
            </div>
          </v-slide-y-transition>
        </div>

        <cc-force-override
          v-model="overridePrompt"
          :reason="blockReason || 'unavailable'"
          :action="action.Name"
          @confirm="apply(close, true)"
        />

        <!-- Footer Actions -->
        <v-divider class="my-3" />
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <v-btn
            variant="plain"
            color="disabled"
            @click="close"
          >
            {{ $t('hud.cancel') }}
          </v-btn>

          <v-btn
            :color="action.Activation === 'Full' ? 'action--full' : 'action--quick'"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            @click="apply(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>{{ $t('hud.finish') }} {{ action.Name }}</span>
          </v-btn>
        </div>
      </div>
    </template>
  </combat-action-button>
</template>

<style scoped>
.hud-container {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
.font-mono {
  font-family: monospace;
}
</style>