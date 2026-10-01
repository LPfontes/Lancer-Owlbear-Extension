<template>
  <template v-if="activeEffect">
    <cc-button
      v-if="activeEffect.IsPassive && !embedded"
      block
      size="x-small"
      color="panel"
      prepend-icon="mdi-close"
      @click="close()"
    >
      {{ $t('common.dismiss') }}
    </cc-button>

    <div
      v-else-if="!embedded"
      class="d-flex flex-column"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mt-2">
        <v-btn
          variant="plain"
          color="disabled"
          @click="cancel(close)"
        >
          {{ $t('common.cancel') }}
        </v-btn>

        <v-btn
          v-if="!ready"
          :color="color"
          variant="elevated"
          class="font-weight-bold px-4"
          height="36"
          :disabled="mandatoryRemaining"
          @click="stage(false)"
        >
          <v-icon
            v-if="icon"
            :icon="icon"
            start
            size="18"
          />
          <span v-if="activation">{{ $t('ui.combat.activate') }}</span>
          <span v-else>{{ canOverride ? $t('ui.combat.applyAll') : $t('common.confirm') }}</span>
        </v-btn>

        <v-btn
          v-else
          :color="color"
          variant="elevated"
          class="font-weight-bold px-4"
          height="36"
          :disabled="disabled"
          @click="apply(close)"
        >
          <v-icon icon="mdi-check-all" start size="18" />
          <span>{{ $t('common.confirm') }}</span>
        </v-btn>
      </div>

      <cc-force-override
        v-model="overridePrompt"
        :reason="blockReason"
        :action="activeEffect.Name"
        @confirm="apply(close, true)"
      />

      <div class="text-center text-cc-overline text-disabled mt-2">
        <div
          v-if="confirmedKills"
          style="max-width: 220px; margin: 0 auto;"
        >
          {{ $t('ui.combat.confirmKillHint', { n: confirmedKills }) }}
        </div>
        <div v-if="isApplied">{{ $t('ui.combat.alreadyActivated') }}</div>
        <div v-if="noAction">{{ $t('ui.combat.insufficientActionsShort') }}</div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
  import { WeaponAttackEvent } from '@/classes/components/feature/active_effects/WeaponAttackEvent'
  import { Action } from '@/classes/Action'
  import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { CombatantData } from '@/classes/encounter/Encounter'
  import CcForceOverride from '@/ui/components/modals/CCForceOverride.vue'
  import { killTargets } from './_shared/killTargets'

  const props = withDefaults(
    defineProps<{
      event: ActiveEffectEvent | ActiveEffectEvent[]
      weaponEvent?: WeaponAttackEvent | WeaponAttackEvent[]
      action?: Action
      actionId?: string | string[]
      activationOverride?: string
      encounterInstance: EncounterInstance
      owner: CombatantData
      close: () => void
      embedded?: boolean
      disabled?: boolean
    }>(),
    {
      weaponEvent: undefined,
      action: undefined,
      actionId: undefined,
      activationOverride: undefined,
      embedded: false,
      disabled: false,
    }
  )

  const emit = defineEmits<{
    stage: []
    apply: []
    reset: [...args: any[]]
  }>()

  const ready = ref(false)
  const isFree = ref(false)
  const overridePrompt = ref(false)

  const events = computed((): ActiveEffectEvent[] =>
    Array.isArray(props.event) ? (props.event as ActiveEffectEvent[]) : [props.event]
  )

  const weaponAttackEvents = computed((): WeaponAttackEvent[] =>
    props.weaponEvent
      ? Array.isArray(props.weaponEvent)
        ? (props.weaponEvent as WeaponAttackEvent[])
        : [props.weaponEvent]
      : []
  )

  const actionIds = computed((): string[] =>
    props.actionId
      ? Array.isArray(props.actionId)
        ? (props.actionId as string[])
        : [props.actionId]
      : []
  )

  const activeEffect = computed(() => events.value[0]?.Effect)

  const icon = computed(
    () =>
      props.action?.Icon || (activeEffect.value as any).Icon || activeEffect.value.Origin.Icon || ''
  )

  const color = computed(() => {
    if (isFree.value) return 'action--free'
    if (overchargeUse.value) return 'action--overcharge'
    return (
      props.action?.Color ||
      (activeEffect.value as any).Color ||
      activeEffect.value.Origin.Color ||
      'primary'
    )
  })

  const isApplied = computed((): boolean => {
    if (actionIds.value.length) {
      return actionIds.value.every(id =>
        props.owner.actor.CombatController.ActiveActor.CombatController.IsActionUsed(id)
      )
    }
    return props.owner.actor.CombatController.ActiveActor.CombatController.IsActionUsed(
      activeEffect.value.ID
    )
  })

  const overchargeUse = computed((): boolean =>
    props.owner.actor.CombatController.ActiveActor.CombatController.CanRepeatAsOvercharge(
      props.action?.ID ?? activeEffect.value.ID,
      props.activationOverride ||
        props.action?.Activation ||
        (activeEffect.value as any).Activation ||
        'free'
    )
  )

  const ordnanceBlocked = computed((): boolean => {
    const cc = props.owner.actor.CombatController.ActiveActor.CombatController
    const events = Array.isArray(props.weaponEvent)
      ? props.weaponEvent
      : props.weaponEvent
        ? [props.weaponEvent]
        : []
    return events.some(e => e?.Weapon && !cc.CanFireWeapon(e.Weapon))
  })

  const activationName = computed(
    (): string =>
      props.activationOverride ||
      props.action?.Activation ||
      (activeEffect.value as any).Activation ||
      'free'
  )

  const noAction = computed((): boolean => {
    const cc = props.owner.actor.CombatController.ActiveActor.CombatController
    if (ordnanceBlocked.value) return true
    if (!cc.CanActivate(activationName.value)) return true
    return !cc.CanTakeAction(
      activeEffect.value.ID,
      activationName.value,
      actionIds.value.length === 1 ? actionIds.value[0] : undefined
    )
  })

  const blockReason = computed((): string => {
    if (ordnanceBlocked.value) return 'ordnance'
    const cc = props.owner.actor.CombatController.ActiveActor.CombatController
    if (!cc.CanActivate(activationName.value)) return 'insufficient'
    const frequency = activeEffect.value.Frequency
    return !frequency || frequency.Unlimited ? 'duplicate' : 'no_uses'
  })

  const canOverride = computed(
    () =>
      activeEffect.value.AddOther?.length ||
      activeEffect.value.AddResist?.length ||
      activeEffect.value.AddStatus?.length ||
      activeEffect.value.AddSpecial?.length ||
      activeEffect.value.Damage.length > 0
  )

  const hasAction = computed(
    () =>
      activeEffect.value.AddOther ||
      activeEffect.value.AddResist ||
      activeEffect.value.AddStatus ||
      activeEffect.value.AddSpecial ||
      activeEffect.value.Damage.length ||
      activeEffect.value.Save
  )

  const activation = computed((): boolean => (activeEffect.value as any).Activation != null)

  const isPcLocal = computed((): boolean => props.encounterInstance?.ItemType === 'PilotSheet')

  const confirmedTargets = computed((): any[] =>
    isPcLocal.value ? killTargets(events.value).filter(t => t.ConfirmedKill) : []
  )

  const confirmedKills = computed((): number => confirmedTargets.value.length)

  const frequencyText = computed((): string => activeEffect.value.Frequency?.ToString() || '')

  const mandatoryRemaining = computed(
    (): boolean => props.disabled || !events.value.every(x => x.Ready)
  )

  function stage(asFree: boolean) {
    events.value.forEach(e => (e.Staged = true))
    isFree.value = asFree || false
    ready.value = true
    emit('stage')
  }

  function cancel(close: () => void) {
    confirmedTargets.value.forEach((t: any) => (t.ConfirmedKill = false))
    close()
  }

  function apply(close: () => void, force = false) {
    if (!ready.value) return
    if (!force && !isFree.value && noAction.value) {
      overridePrompt.value = true
      return
    }
    if (!isFree.value) {
      const cc = props.owner.actor.CombatController.ActiveActor.CombatController
      const spent = cc.Activate(activationName.value, {
        actionId: activeEffect.value.ID,
        useId: actionIds.value.length === 1 ? actionIds.value[0] : undefined,
        frequency: activeEffect.value.Frequency,
        heat: weaponAttackEvents.value.length ? 0 : props.action?.HeatCost || 0,
        force,
        recorded: true,
      })
      if (!spent) {
        overridePrompt.value = true
        return
      }
    }
    if (weaponAttackEvents.value.length)
      weaponAttackEvents.value.forEach(we => {
        we.Force = force || isFree.value
        we.ApplyAll()
      })
    else events.value.forEach(e => e.ApplyAll())
    const killRecorder = props.owner.actor.CombatController.ActiveActor.CombatController
    confirmedTargets.value.forEach((t: any) => {
      killRecorder.Record('actor.destroy', { selfReported: true })
      t.ConfirmedKill = false
    })
    isFree.value = false
    emit('apply')
    close()
  }
</script>
