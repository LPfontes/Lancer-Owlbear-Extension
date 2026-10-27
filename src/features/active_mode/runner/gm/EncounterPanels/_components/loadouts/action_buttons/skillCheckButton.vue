<template>
  <combat-action-button
    :action="action"
    min-width="720px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Action Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-6"
              color="action--full"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ action.Name }}
              </div>
              <div class="text-caption text-disabled">
                {{ action.Terse || action.Detail }}
              </div>
            </div>
          </div>
          <v-chip
            color="action--full"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            {{ $enum('activationType', action.Activation || 'Full') }}
          </v-chip>
        </div>

        <!-- HASE Interactive Stat Cards -->
        <div class="mb-3">
          <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1">
            <v-icon icon="mdi-tune" size="14" class="mr-1" />
            {{ $t('active.skillCheck.checkStat') }}
          </div>
          <v-row dense>
            <v-col
              v-for="stat in haseOptions"
              :key="stat.value"
              cols="6"
              sm="auto"
              class="flex-grow-1"
            >
              <div
                class="hase-card pa-2 rounded text-center cursor-pointer transition-swing"
                :class="{ 'hase-card--active': selectedHase === stat.value }"
                @click="selectedHase = stat.value"
              >
                <div class="d-flex align-center justify-center ga-1 mb-1">
                  <v-icon
                    :icon="stat.icon"
                    size="18"
                    :color="selectedHase === stat.value ? 'primary' : 'disabled'"
                  />
                  <span class="text-caption font-weight-bold" :class="selectedHase === stat.value ? 'text-white' : 'text-disabled'">
                    {{ stat.title }}
                  </span>
                </div>
                <div class="text-caption font-weight-bold" :class="selectedHase === stat.value ? 'text-primary' : 'text-disabled'">
                  {{ stat.bonusText }}
                </div>
              </div>
            </v-col>
          </v-row>
        </div>

        <!-- Check Mode & Modifiers Section -->
        <div class="pa-3 mb-3 bg-panel rounded border-sm">
          <v-row dense align="center">
            <!-- Check Type: Standard vs Contested -->
            <v-col cols="12" sm="auto">
              <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1">
                {{ $t('active.skillCheck.checkType') }}
              </div>
              <v-btn-toggle
                v-model="checkType"
                density="compact"
                color="primary"
                mandatory
                variant="outlined"
              >
                <v-btn
                  value="standard"
                  size="small"
                  class="font-weight-bold"
                >
                  <v-icon icon="mdi-bullseye-arrow" start size="16" />
                  {{ $t('active.skillCheck.standard') }}
                </v-btn>
                <v-btn
                  value="contested"
                  size="small"
                  class="font-weight-bold"
                >
                  <v-icon icon="mdi-sword-cross" start size="16" />
                  {{ $t('active.skillCheck.contested') }}
                </v-btn>
              </v-btn-toggle>
            </v-col>

            <!-- Standard Options: Target DC & Risk Tier -->
            <template v-if="checkType === 'standard'">
              <v-col cols="12" sm="auto">
                <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1">
                  {{ $t('active.skillCheck.targetValue') }}
                </div>
                <div class="d-flex align-center ga-1">
                  <v-btn
                    v-for="dc in [10, 15, 20]"
                    :key="dc"
                    size="x-small"
                    :variant="targetVal === dc ? 'elevated' : 'outlined'"
                    :color="targetVal === dc ? 'primary' : 'disabled'"
                    class="font-weight-bold"
                    @click="targetVal = dc"
                  >
                    {{ dc }}
                  </v-btn>
                  <v-text-field
                    v-model.number="targetVal"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    hide-spin-buttons
                    style="width: 60px;"
                    class="ml-1"
                  />
                </div>
              </v-col>

              <v-col cols="12" sm="auto" class="flex-grow-1">
                <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1">
                  {{ $t('active.skillCheck.modifiers') }}
                </div>
                <div class="d-flex align-center flex-wrap ga-2">
                  <v-btn-toggle
                    v-model="modifier"
                    density="compact"
                    color="primary"
                    variant="outlined"
                  >
                    <v-btn value="" size="small">{{ $t('common.none') }}</v-btn>
                    <v-btn value="risky" size="small">{{ $t('active.skillCheck.risky') }}</v-btn>
                    <v-btn value="heroic" size="small">{{ $t('active.skillCheck.heroic') }}</v-btn>
                  </v-btn-toggle>

                  <v-chip
                    filter
                    :variant="difficult ? 'elevated' : 'outlined'"
                    :color="difficult ? 'warning' : 'disabled'"
                    size="small"
                    class="font-weight-bold cursor-pointer"
                    @click="difficult = !difficult"
                  >
                    <v-icon :icon="difficult ? 'mdi-check-bold' : 'mdi-plus'" start size="14" />
                    {{ $t('active.skillCheck.difficult') }} (+1D)
                  </v-chip>
                </div>
              </v-col>
            </template>

            <!-- Contested Option: Target Combatant Selector -->
            <v-col v-else cols="12" sm="auto" class="flex-grow-1">
              <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1">
                {{ $t('ui.fields.selectTarget') }}
              </div>
              <v-select
                v-model="selectedTarget"
                :items="targets"
                density="compact"
                variant="outlined"
                :item-title="targetLabel"
                return-object
                hide-details
                :placeholder="$t('ui.combat.noTarget')"
              />
            </v-col>
          </v-row>
        </div>

        <!-- Roll Execution Area -->
        <div class="roll-area mb-3">
          <!-- Standard Check -->
          <div v-if="checkType === 'standard'">
            <skill-check-base
              ref="check"
              :controller="controller"
              :selected-hase="selectedHase"
              :difficult="difficult"
            />

            <!-- Standard Outcome Banner -->
            <v-slide-y-transition>
              <div
                v-if="outcome && check?.roll !== null"
                class="outcome-banner pa-3 mt-2 rounded d-flex align-center justify-space-between flex-wrap ga-2"
                :class="outcome === 'success' ? 'outcome-banner--success' : 'outcome-banner--fail'"
              >
                <div class="d-flex align-center ga-2">
                  <v-icon
                    :icon="outcome === 'success' ? 'mdi-check-decagram' : 'mdi-close-octagon'"
                    size="28"
                  />
                  <div>
                    <div class="text-subtitle-1 font-weight-bold">
                      {{ outcome === 'success' ? $t('active.skillCheck.checkSuccess') : $t('active.skillCheck.checkFail') }}
                    </div>
                    <div class="text-caption">
                      {{ check?.roll }} vs DC {{ targetVal }}
                    </div>
                  </div>
                </div>

                <v-btn
                  size="small"
                  variant="text"
                  @click="check?.overrideRoll(targetVal)"
                >
                  <v-icon icon="mdi-swap-horizontal" start size="16" />
                  {{ $t('ui.combat.clickToOverride') }}
                </v-btn>
              </div>
            </v-slide-y-transition>
          </div>

          <!-- Contested Check -->
          <div v-else>
            <v-row dense align="center">
              <v-col cols="12" md="5">
                <skill-check-base
                  ref="check"
                  :controller="controller"
                  :selected-hase="selectedHase"
                  :difficult="difficult"
                />
              </v-col>

              <v-col cols="12" md="2" class="text-center my-2 my-md-0">
                <div class="vs-circle mx-auto d-flex align-center justify-center font-weight-black text-h6">
                  VS
                </div>
              </v-col>

              <v-col cols="12" md="5">
                <div v-if="selectedTarget">
                  <skill-check-base
                    ref="contest"
                    :controller="selectedTarget.CombatController"
                    :selected-hase="selectedHase"
                  />
                </div>
                <div
                  v-else
                  class="pa-6 text-center text-disabled bg-panel rounded border-sm"
                >
                  <v-icon icon="mdi-target-variant" size="32" class="mb-2" />
                  <div>{{ $t('ui.combat.noTarget') }}</div>
                </div>
              </v-col>
            </v-row>

            <!-- Contested Outcome Alert -->
            <v-slide-y-transition>
              <div
                v-if="outcome === 'win' || outcome === 'lose'"
                class="outcome-banner pa-3 mt-3 rounded d-flex align-center justify-center ga-2 text-center"
                :class="outcome === 'win' ? 'outcome-banner--success' : 'outcome-banner--fail'"
              >
                <v-icon
                  :icon="outcome === 'win' ? 'mdi-trophy-variant' : 'mdi-alert-circle'"
                  size="24"
                />
                <span class="text-subtitle-1 font-weight-bold">
                  {{ controller.CombatName }}
                  {{ outcome === 'win' ? $t('active.skillCheck.wins') : $t('active.skillCheck.loses') }}
                </span>
              </div>
            </v-slide-y-transition>
          </div>
        </div>

        <menu-input
          :key="controller.RootActor.ID"
          :owner="owner"
          :encounter-instance="encounterInstance"
          hide-input
          :active-effect="action"
          :close="close"
          @apply="apply"
          @reset="reset"
        />
      </div>
    </template>
  </combat-action-button>
</template>

<script setup lang="ts">
  import { computed, ref, shallowRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { Action } from '@/classes/Action'
  import { useEncounterContext } from '../../../encounterContext'
  import CombatActionButton from './CombatActionButton.vue'
  import MenuInput from '@/ui/components/chips/_activeeffect/_ae_menu_input.vue'
  import SkillCheckBase from './_skillCheckBase.vue'
  import {
    SkillCheckFlow,
    skillCheckState,
    type ISkillCheckState,
    type CheckTier,
  } from '@/classes/components/combat/flows/SkillCheckFlow'
  import type { IFlowResult } from '@/classes/components/combat/flows/Flow'
  import { checkSources, totalBonus } from '@/classes/components/combat/SkillCheckRules'

  const { t } = useI18n()
  const { owner, encounterInstance, activeController: controller } = useEncounterContext()

  const props = defineProps<{
    action: Action
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const check = ref<InstanceType<typeof SkillCheckBase> | null>(null)
  const contest = ref<InstanceType<typeof SkillCheckBase> | null>(null)

  const targetVal = ref(10)
  const selectedHase = ref('hull')
  const checkType = ref('standard')
  const difficult = ref(false)
  const modifier = ref('')
  const selectedTarget = ref<any>(null)

  const haseOptions = computed(() => {
    const list = [
      {
        title: t('active.titles.hull') || 'Casco',
        value: 'hull',
        icon: 'mdi-shield-half-full',
      },
      {
        title: t('stats.agility') || 'Agilidade',
        value: 'agility',
        icon: 'mdi-run-fast',
      },
      {
        title: t('stats.systems') || 'Sistemas',
        value: 'systems',
        icon: 'mdi-chip',
      },
      {
        title: t('stats.engineering') || 'Engenharia',
        value: 'engineering',
        icon: 'mdi-wrench',
      },
      {
        title: t('common.none') || 'Geral',
        value: '',
        icon: 'mdi-dice-multiple',
      },
    ]

    return list.map(item => {
      const src = checkSources(controller.value, item.value)
      const b = totalBonus(src, false)
      const bonusText = b >= 0 ? `+${b}` : `${b}`
      return {
        ...item,
        bonusText,
      }
    })
  })

  function targetLabel(actor: any) {
    const combatant = encounterInstance.value.Combatants.find(
      (c: any) => c.actor?.CombatController?.ActiveActor?.ID === actor.ID
    )
    return combatant
      ? combatant.Label
      : actor.CombatController?.RootActor?.CombatController?.CombatName || actor.Name
  }

  const targets = computed(() => {
    if (!encounterInstance.value?.Combatants) return []
    return encounterInstance.value.Combatants.filter(
      (c: any) =>
        c.actor?.ID !== controller.value.ActiveActor.ID &&
        c.actor?.ID !== controller.value.RootActor.ID
    ).map((x: any) => x.actor?.CombatController?.ActiveActor || x.actor)
  })

  function newState(): ISkillCheckState {
    return skillCheckState({
      cc: controller.value,
      stat: selectedHase.value,
      tier: modifier.value as CheckTier,
      difficult: difficult.value,
      contested: checkType.value === 'contested',
      target: selectedTarget.value?.CombatController,
      targetValue: Number(targetVal.value),
    })
  }

  const state = ref<ISkillCheckState>(newState())
  const result = shallowRef<IFlowResult<ISkillCheckState> | null>(null)

  const outcome = computed(() => state.value.outcome)

  function run() {
    result.value = SkillCheckFlow.Begin(state.value)
  }

  function reseed() {
    state.value = newState()
    result.value = null
  }

  watch([selectedHase, checkType, difficult, modifier, selectedTarget, targetVal], reseed)

  watch(
    () => check.value?.roll,
    value => {
      if (typeof value !== 'number') return
      state.value.roll = value
      run()
    }
  )

  watch(
    () => contest.value?.roll,
    value => {
      if (typeof value !== 'number') return
      state.value.contestRoll = value
      run()
    }
  )

  function apply() {
    emit('activate', props.action.ID)
  }

  function reset() {
    reseed()
    controller.value.UndoActivation(props.action.Activation, { actionId: props.action.ID })
  }
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
  .hase-card {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 90px;
    user-select: none;
  }
  .hase-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.5);
    background: rgba(var(--v-theme-primary), 0.08);
  }
  .hase-card--active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.18);
    box-shadow: 0 0 10px rgba(var(--v-theme-primary), 0.35);
  }
  .vs-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(var(--v-theme-primary), 0.15);
    border: 2px solid rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 12px rgba(var(--v-theme-primary), 0.3);
  }
  .outcome-banner {
    border: 1px solid transparent;
  }
  .outcome-banner--success {
    background: rgba(76, 175, 80, 0.15);
    border-color: rgba(76, 175, 80, 0.4);
    color: #81c784;
  }
  .outcome-banner--fail {
    background: rgba(244, 67, 54, 0.15);
    border-color: rgba(244, 67, 54, 0.4);
    color: #e57373;
  }
</style>
