<template>
  <div class="hud-container pa-3">
    <!-- Action Header -->
    <div
      v-if="!embedded && !hideInput"
      class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm"
    >
      <div class="d-flex align-center ga-2">
        <v-icon
          :icon="headerIcon"
          :color="headerColor"
          size="24"
        />
        <div>
          <div class="text-subtitle-1 font-weight-bold">{{ headerName }}</div>
          <div
            v-if="subtitleText"
            class="text-caption text-disabled"
          >
            {{ subtitleText }}
            <cc-lcp-info
              v-if="!actionTerse && activeEffect.Origin.Name"
              :item="activeEffect.Origin"
            />
          </div>
        </div>
      </div>

      <div class="d-flex align-center flex-wrap ga-1">
        <v-chip
          v-if="activeEffect.Frequency"
          color="panel-border"
          size="small"
          variant="elevated"
          class="font-weight-bold"
        >
          <v-icon
            :icon="frequencyIcon(activeEffect.Frequency)"
            start
            size="16"
          />
          {{ activeEffect.Frequency.ToString() }}
        </v-chip>
        <v-chip
          v-if="activeEffect.Activation"
          :color="headerColor"
          size="small"
          variant="elevated"
          class="font-weight-bold"
        >
          {{ $enum('activationType', activeEffect.Activation) }}
        </v-chip>
      </div>
    </div>

    <!-- Origin caption (callers that provide their own header, e.g. hide-input) -->
    <div
      v-else-if="!embedded && subtitleText"
      class="text-right text-caption text-disabled mb-1"
    >
      <i>
        {{ subtitleText }}
        <cc-lcp-info
          v-if="!actionTerse && activeEffect.Origin.Name"
          :item="activeEffect.Origin"
        />
      </i>
    </div>

    <v-row
      v-if="event.AttackBonus || event.Accuracy"
      dense
      align="center"
      justify="end"
      class="bg-panel rounded border-sm heading h3 py-1 mb-3 px-3"
    >
      <v-col
        v-if="event.AttackBonus"
        cols="auto"
      >
        <cc-npc-attack-bonus :attack-bonus="event.AttackBonus" />
      </v-col>
      <v-col
        v-if="event.Accuracy"
        cols="auto"
      >
        <cc-npc-accuracy-element :accuracy="event.Accuracy" />
      </v-col>
    </v-row>

    <div v-if="!hideInput">
      <div
        v-if="activeEffect.getCondition(owner.actor.CombatController.Tier)"
        class="pa-3 mb-2 rounded bg-panel border-sm"
      >
        <span class="text-overline font-weight-bold text-accent">
          <v-icon
            icon="mdi-information-outline"
            size="16"
            class="mr-1"
          />
          {{ $t('ui.combat.ifLabel') }}
        </span>
        <div
          v-html-safe="activeEffect.getCondition(owner.actor.CombatController.Tier)"
          class="text-body-2"
        />
      </div>

      <div
        v-if="(activeEffect as any).Trigger"
        class="pa-3 mb-2 rounded bg-panel border-sm"
      >
        <span class="text-overline font-weight-bold text-accent">
          <v-icon
            icon="mdi-flash"
            size="16"
            class="mr-1"
          />
          {{ $t('common.trigger') }}
        </span>
        <div
          v-html-safe="activeEffect.getTrigger(owner.actor.CombatController.Tier)"
          class="text-body-2"
        />
      </div>

      <div class="pa-3 mb-2 rounded bg-panel border-sm">
        <div
          v-html-safe="activeEffect.getDetail(owner.actor.CombatController.Tier)"
          class="text-text"
        />
      </div>
    </div>

    <confirm-kill-bar
      v-if="!embedded"
      :event="<ActiveEffectEvent>event"
    />

    <template v-if="!embedded">
      <v-divider class="my-3" />
      <apply-button
        :event="<ActiveEffectEvent>event"
        :encounter-instance="encounterInstance"
        :owner="owner"
        :action="action"
        :disabled="disabled"
        :close="close"
        @reset="reset($event)"
        @apply="$emit('apply')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { CombatantData } from '@/classes/encounter/Encounter'
  import { ActivePeriod, type Frequency } from '@/classes/Frequency'

  import { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
  import ApplyButton from './ApplyButton.vue'
  import ConfirmKillBar from './_shared/ConfirmKillBar.vue'
  import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { Action } from '@/classes/Action'
  import {
    ActiveEffect,
    ActiveEffectLike,
  } from '@/classes/components/feature/active_effects/ActiveEffect'

  const props = withDefaults(
    defineProps<{
      activeEffect: ActiveEffectLike
      encounterInstance: EncounterInstance
      owner: CombatantData
      close: () => void
      hideInput?: boolean
      embedded?: boolean
      color?: string
      overrideMissingInputs?: boolean
      initialTargets?: any[]
      action?: Action
      disabled?: boolean
    }>(),
    {
      hideInput: false,
      embedded: false,
      disabled: false,
      color: 'panel',
      overrideMissingInputs: false,
      initialTargets: () => [],
    }
  )

  const emit = defineEmits<{
    apply: []
    reset: [...args: any[]]
  }>()

  const { t } = useI18n()

  const event = ref({} as ActiveEffectEvent)

  const headerName = computed((): string => props.action?.Name || props.activeEffect.Name || '')

  const headerIcon = computed(
    (): string =>
      props.action?.Icon ||
      (props.activeEffect as any).Icon ||
      props.activeEffect.Origin?.Icon ||
      'mdi-rhombus-outline'
  )

  const headerColor = computed(
    (): string =>
      props.action?.Color ||
      (props.activeEffect as any).Color ||
      props.activeEffect.Origin?.Color ||
      'primary'
  )

  const actionTerse = computed((): string => props.action?.Terse || '')

  const originDetail = computed((): string => {
    const origin: any = props.activeEffect.Origin || {}
    if (origin.Source) return `(${origin.Type}, ${origin.Source})`
    if (origin.Origin) {
      const itemType = String(origin.Origin.ItemType || '').replace(/([a-z])([A-Z])/g, '$1 $2')
      return `(${origin.Origin.Name}, ${itemType})`
    }
    return ''
  })

  const subtitleText = computed((): string => {
    if (actionTerse.value) return actionTerse.value
    const originName = props.activeEffect.Origin?.Name
    if (!originName) return ''
    const detail = originDetail.value
    return `${t('ui.combat.fromOrigin', { name: originName })}${detail ? ` ${detail}` : ''}`
  })

  function frequencyIcon(frequency?: Frequency): string {
    switch (frequency?.Duration) {
      case ActivePeriod.Round:
        return 'mdi-alpha-r-circle'
      case ActivePeriod.Turn:
        return 'mdi-alpha-t-circle'
      case ActivePeriod.Scene:
        return 'mdi-alpha-e-circle'
      case ActivePeriod.Mission:
        return 'mdi-alpha-m-circle'
      default:
        return 'mdi-timer-sand'
    }
  }

  function reset(clearAction = false) {
    if (clearAction)
      props.owner.actor.CombatController.ActiveActor.CombatController.ClearActionUsed(
        props.activeEffect.ID
      )
    const self = props.encounterInstance.Combatants.find(
      (c: CombatantData) =>
        c.actor.CombatController.RootActor.ID === props.owner.actor.CombatController.RootActor.ID
    )
    if (!self) {
      throw new Error('Owner combatant not found in encounterInstance')
    }
    event.value = new ActiveEffectEvent(
      self,
      props.activeEffect as ActiveEffect,
      props.encounterInstance
    )
  }

  reset()
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
</style>
