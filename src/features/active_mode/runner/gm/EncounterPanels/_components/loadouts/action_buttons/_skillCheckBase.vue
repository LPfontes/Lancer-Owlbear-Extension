<template>
  <div class="skill-check-hud pa-3 rounded bg-panel border-sm mb-3">
    <!-- Header with Actor info -->
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3 pb-2 border-b-subtle">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-account-circle-outline" size="20" class="text-primary" />
        <span class="text-subtitle-2 font-weight-bold text-white">
          {{ controller.CombatName || 'Mech' }}
        </span>
        <v-chip
          v-if="selectedHase"
          size="x-small"
          color="primary"
          variant="outlined"
          class="text-uppercase font-weight-bold"
        >
          {{ selectedHaseLabel }}
        </v-chip>
      </div>

      <div class="d-flex align-center ga-1">
        <v-chip
          size="x-small"
          :color="netAccDiff > 0 ? 'accent' : netAccDiff < 0 ? 'warning' : 'disabled'"
          variant="tonal"
          class="font-weight-bold"
        >
          {{ netAccDiffText }}
        </v-chip>
      </div>
    </div>

    <!-- Modifiers & Steppers Grid -->
    <v-row dense class="mb-3">
      <!-- Flat Bonus Column -->
      <v-col cols="12" sm="6">
        <div class="hud-box pa-2 rounded h-100">
          <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1 d-flex align-center justify-space-between">
            <span>{{ $t('common.bonus') }}</span>
            <span class="text-primary font-weight-bold">{{ bonus >= 0 ? `+${bonus}` : bonus }}</span>
          </div>

          <div class="d-flex align-center ga-2 mb-2">
            <v-btn
              icon
              size="small"
              variant="tonal"
              color="primary"
              density="comfortable"
              @click="bonus--"
            >
              <v-icon icon="mdi-minus" size="18" />
            </v-btn>

            <v-text-field
              v-model.number="bonus"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              hide-spin-buttons
              class="text-center font-weight-bold"
            />

            <v-btn
              icon
              size="small"
              variant="tonal"
              color="primary"
              density="comfortable"
              @click="bonus++"
            >
              <v-icon icon="mdi-plus" size="18" />
            </v-btn>
          </div>

          <!-- Bonus Sources Pills -->
          <div v-if="applicableBonuses.bonuses.length" class="d-flex flex-wrap ga-1">
            <v-chip
              v-for="(b, idx) in applicableBonuses.bonuses"
              :key="`b-${idx}`"
              size="x-small"
              variant="outlined"
              color="primary"
            >
              {{ b.Value >= 0 ? `+${b.Value}` : b.Value }} {{ b.Source }}
            </v-chip>
          </div>
        </div>
      </v-col>

      <!-- Accuracy / Difficulty Column -->
      <v-col cols="12" sm="6">
        <div class="hud-box pa-2 rounded h-100">
          <div class="text-caption text-disabled text-uppercase font-weight-bold mb-1 d-flex align-center justify-space-between">
            <span>{{ accDiff < 0 ? $t('common.difficulty') : $t('common.accuracy') }}</span>
            <span :class="accDiff > 0 ? 'text-accent' : accDiff < 0 ? 'text-warning' : 'text-disabled'" class="font-weight-bold">
              {{ accDiff > 0 ? `+${accDiff}A` : accDiff < 0 ? `${Math.abs(accDiff)}D` : '0' }}
            </span>
          </div>

          <div class="d-flex align-center ga-2 mb-2">
            <v-btn
              icon
              size="small"
              variant="tonal"
              :color="accDiff < 0 ? 'warning' : 'primary'"
              density="comfortable"
              @click="accDiff--"
            >
              <v-icon icon="mdi-minus" size="18" />
            </v-btn>

            <v-text-field
              v-model.number="accDiff"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              hide-spin-buttons
              class="text-center font-weight-bold"
            />

            <v-btn
              icon
              size="small"
              variant="tonal"
              :color="accDiff > 0 ? 'accent' : 'primary'"
              density="comfortable"
              @click="accDiff++"
            >
              <v-icon icon="mdi-plus" size="18" />
            </v-btn>
          </div>

          <!-- Acc/Diff Sources & Difficult Indicator -->
          <div class="d-flex flex-wrap ga-1">
            <v-chip
              v-if="difficult"
              size="x-small"
              variant="elevated"
              color="warning"
              class="font-weight-bold"
            >
              {{ $t('active.skillCheck.difficultMod') }}
            </v-chip>
            <v-chip
              v-for="(a, idx) in applicableBonuses.accDiff"
              :key="`ad-${idx}`"
              size="x-small"
              variant="outlined"
              :color="a.Accuracy > 0 ? 'accent' : 'warning'"
            >
              {{ a.Accuracy > 0 ? `+${a.Accuracy}A` : `${a.Accuracy}D` }} ({{ a.Source }})
            </v-chip>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Slot for VS or Targets -->
    <slot />

    <!-- Roll Action Button -->
    <v-btn
      v-if="!readOnlySession"
      block
      height="40"
      color="primary"
      variant="elevated"
      class="cyber-roll-btn font-weight-bold mt-2"
      :loading="isRolling"
      @click="rollCheck"
    >
      <v-icon icon="mdi-dice-d20" start size="22" class="cyber-dice-icon" />
      <span>{{ $t('common.roll_verb') }} {{ selectedHaseLabel ? `(${selectedHaseLabel})` : '' }}</span>
    </v-btn>

    <!-- Roll Results Banner -->
    <v-slide-y-transition>
      <div
        v-if="roll !== null"
        class="result-card pa-3 mt-3 rounded bg-surface border-sm"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <!-- Left: Big D20 Badge & Total -->
          <div class="d-flex align-center ga-3">
            <div class="d20-badge d-flex flex-column align-center justify-center">
              <span class="d20-value">{{ lastBaseRoll || roll }}</span>
              <span class="d20-label">d20</span>
            </div>

            <div>
              <div class="d-flex align-center ga-2">
                <span class="text-h5 font-weight-black" :class="isCrit ? 'text-exotic' : 'text-primary'">
                  {{ roll }}
                </span>
                <v-chip
                  v-if="isCrit"
                  size="x-small"
                  color="exotic"
                  variant="elevated"
                  class="font-weight-bold"
                >
                  CRÍTICO
                </v-chip>
              </div>
              <div class="text-caption text-disabled">
                {{ rollSummaryDetail }}
              </div>
            </div>
          </div>

          <!-- Right: Quick Override Button -->
          <div class="d-flex align-center ga-1">
            <v-tooltip location="top">
              <template #activator="{ props: tipProps }">
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="disabled"
                  v-bind="tipProps"
                  @click="overrideRoll(10)"
                >
                  <v-icon icon="mdi-swap-horizontal" size="18" />
                </v-btn>
              </template>
              <span>{{ $t('ui.combat.clickToOverride') }}</span>
            </v-tooltip>
          </div>
        </div>
      </div>
    </v-slide-y-transition>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { CombatController } from '@/classes/components/combat/CombatController'
  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import {
    checkSources,
    totalBonus,
    totalAccDiff,
  } from '@/classes/components/combat/SkillCheckRules'
  import { isSheetReadOnlySession } from '@/services/sheetReadOnlySession'

  const { t } = useI18n()

  const props = withDefaults(
    defineProps<{
      controller: CombatController
      difficult?: boolean
      selectedHase?: string
    }>(),
    {
      difficult: false,
      selectedHase: '',
    }
  )

  const isRolling = ref(false)
  const roll = ref<number | null>(null)
  const lastBaseRoll = ref<number | null>(null)
  const rollResults = ref('')

  const readOnlySession = computed((): boolean => isSheetReadOnlySession())

  const applicableBonuses = computed(() =>
    checkSources(props.controller, props.selectedHase)
  )

  const bonus = ref(totalBonus(applicableBonuses.value, props.difficult))
  const accDiff = ref(totalAccDiff(applicableBonuses.value))

  // Dynamically update bonus and accDiff when selectedHase or difficult prop changes
  watch(
    [() => props.selectedHase, () => props.difficult],
    () => {
      bonus.value = totalBonus(applicableBonuses.value, props.difficult)
      accDiff.value = totalAccDiff(applicableBonuses.value)
    },
    { immediate: true }
  )

  const selectedHaseLabel = computed(() => {
    if (!props.selectedHase) return ''
    const labels: Record<string, string> = {
      hull: t('active.titles.hull') || 'Casco',
      agility: t('stats.agility') || 'Agilidade',
      systems: t('stats.systems') || 'Sistemas',
      engineering: t('stats.engineering') || 'Engenharia',
    }
    return labels[props.selectedHase.toLowerCase()] || props.selectedHase.toUpperCase()
  })

  const netAccDiff = computed(() => accDiff.value)

  const netAccDiffText = computed(() => {
    if (netAccDiff.value > 0) return `+${netAccDiff.value} Precisão`
    if (netAccDiff.value < 0) return `${Math.abs(netAccDiff.value)} Dificuldade`
    return 'Normal'
  })

  const isCrit = computed(() => (roll.value ?? 0) >= 20)

  const rollSummaryDetail = computed(() => {
    if (roll.value === null) return ''
    const base = lastBaseRoll.value ?? roll.value
    const bStr = bonus.value !== 0 ? ` ${bonus.value > 0 ? '+' : '-'} ${Math.abs(bonus.value)}` : ''
    const aStr =
      accDiff.value !== 0
        ? ` ${accDiff.value > 0 ? '+ Acerto' : '- Dif.'} ${Math.abs(accDiff.value)}`
        : ''
    return `d20 (${base})${bStr}${aStr}`
  })

  async function rollCheck() {
    isRolling.value = true
    try {
      const result = DiceRoller.rollSkillCheck(Number(bonus.value), accDiff.value, 0)
      const baseRoll = result.rawDieRoll
      const finalAccDiff = result.accuracyResult

      lastBaseRoll.value = baseRoll
      roll.value = result.total

      rollResults.value = `Base Roll: ${baseRoll}${bonus.value ? ` ${bonus.value > 0 ? '+' : '-'} ${Math.abs(bonus.value)}` : ''}${finalAccDiff ? `, ${finalAccDiff > 0 ? 'Accuracy: +' : 'Difficulty: -'} ${Math.abs(finalAccDiff)}` : ''} = <strong>${roll.value}</strong>`

      const haseName = selectedHaseLabel.value || 'Skill'
      const actorName = props.controller.CombatName || 'Mech'
      const crit = Number(roll.value) >= 20

      if (dddiceService.config.enabled) {
        void dddiceService.rollDice({
          diceString: '1d20',
          flatBonus: Number(bonus.value) || 0,
          accuracy: accDiff.value,
          label: `Teste de ${haseName} [${actorName}]`,
          external_id: actorName || undefined,
        })
      }

      void useTableActionStore().postAction({
        senderName: actorName,
        category: 'roll',
        title: `Teste de ${haseName}`,
        detail: `d20 (${baseRoll})${bonus.value ? ` ${bonus.value > 0 ? '+' : '-'} ${Math.abs(bonus.value)}` : ''}${finalAccDiff ? `, ${finalAccDiff > 0 ? 'Acerto: +' : 'Dificuldade: -'} ${Math.abs(finalAccDiff)}` : ''}`,
        roll: {
          total: Number(roll.value) || 0,
          formula: `1d20${bonus.value >= 0 ? '+' : ''}${bonus.value}`,
          isCrit: crit,
          accuracy: accDiff.value,
        },
        tags: [haseName, ...(crit ? ['CRÍTICO'] : [])],
      })
    } finally {
      isRolling.value = false
    }
  }

  function overrideRoll(target: number) {
    roll.value = (roll.value ?? 0) < target ? 20 : 1
  }

  defineExpose({ roll, rollCheck, overrideRoll })
</script>

<style scoped>
  .skill-check-hud {
    background: rgba(18, 22, 28, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .border-b-subtle {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .hud-box {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .cyber-roll-btn {
    letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow: 0 0 12px rgba(var(--v-theme-primary), 0.35);
  }
  .d20-badge {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: rgba(var(--v-theme-primary), 0.15);
    border: 1px solid rgba(var(--v-theme-primary), 0.4);
    box-shadow: 0 0 8px rgba(var(--v-theme-primary), 0.25);
  }
  .d20-value {
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    color: rgb(var(--v-theme-primary));
  }
  .d20-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.6);
  }
  .result-card {
    border: 1px solid rgba(var(--v-theme-primary), 0.3);
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.3);
  }
</style>
