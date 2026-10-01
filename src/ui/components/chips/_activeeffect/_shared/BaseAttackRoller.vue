<template>
  <v-col
    v-if="event.Attack"
    cols="auto"
    class="mt-1"
  >
    <div
      v-if="!mobile"
      class="text-cc-overline text-disabled"
    >
      {{ $t('ui.combat.vsStat', { stat: event.AttackStat }) }}
    </div>
    <div
      v-for="(s, idx) in event.Targets"
      :key="`target-${idx}`"
    >
      <v-row
        v-if="!s"
        no-gutters
        align="center"
        justify="center"
      >
        <v-col
          cols="auto"
          align-self="center"
          class="mt-1"
        >
          <i class="text-caption text-disabled">{{ $t('ui.combat.noTarget') }}</i>
        </v-col>
      </v-row>
      <v-row
        v-else
        no-gutters
        align="center"
        class="ga-2"
      >
        <v-col cols="auto">
          <cc-button
            size="small"
            color="primary"
            prepend-icon="mdi-dice-d20"
            @click="rollAttack(s)"
          >
            {{ s.AttackRolledValue !== undefined ? $t('ui.combat.rerollAttack') : $t('ui.combat.rollAttack') }}
          </cc-button>
        </v-col>
        <v-col cols="auto">
          <v-text-field
            :model-value="s.AttackRolledValue"
            density="compact"
            variant="outlined"
            :class="mobile ? 'short' : 'mb-1'"
            type="number"
            :width="mobile ? 65 : 85"
            hide-spin-buttons
            flat
            :error="!s.AttackRolledValue"
            hide-details
            tile
            @update:model-value="handleAttackRoll(s, $event)"
          >
            <template #prepend>
              <check-roll-interface
                :roll-data="s"
                @rolled="onAttackRolled($event)"
              />
            </template>
          </v-text-field>
        </v-col>
        <v-col
          cols="auto"
          align-self="center"
        >
          <div class="text-center text-cc-overline px-2">{{ $t('ui.combat.vs') }}</div>
        </v-col>
        <v-col align-self="center">
          <v-text-field
            :key="s.Combatant?.id || `defense_${idx}`"
            v-model="s.TargetDefenseValue"
            density="compact"
            :class="mobile ? 'short' : 'mb-1'"
            variant="outlined"
            type="number"
            width="100"
            hide-spin-buttons
            :error="!s.TargetDefenseValue"
            flat
            tile
            hide-details
            @update:model-value="s.TargetDefenseValue = Number($event)"
          >
            <template #append>
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <v-btn
                    icon
                    size="x-small"
                    flat
                    tile
                    class="ml-n1"
                    color="transparent"
                    v-bind="props"
                    @click="overrideSave(s)"
                  >
                    <v-icon
                      size="25"
                      :color="
                        !s.HitResult
                          ? ''
                          : s.HitResult === 'crit'
                            ? 'exotic'
                            : s.HitResult === 'hit'
                              ? 'success'
                              : 'error'
                      "
                      :icon="
                        !s.HitResult
                          ? 'mdi-circle-outline'
                          : s.HitResult === 'crit'
                            ? 'mdi-check-decagram'
                            : s.HitResult === 'hit'
                              ? 'mdi-check-circle'
                              : 'mdi-cancel'
                      "
                    />
                  </v-btn>
                </template>

                <div class="text-center">
                  {{
                    s.HitResult !== 'crit'
                      ? $t('ui.combat.noAttackRolled')
                      : s.HitResult === 'crit'
                        ? $t('ui.combat.criticalHit')
                        : s.HitResult === 'hit'
                          ? $t('ui.combat.successfulAttack')
                          : $t('ui.combat.failedAttack')
                  }}

                  <div>
                    <i class="text-caption text-disabled">{{ $t('ui.combat.clickToOverride') }}</i>
                  </div>
                </div>
              </v-tooltip>
            </template>
          </v-text-field>
        </v-col>
      </v-row>
      <div
        v-if="s && s.HitResult === 'miss' && reliableDamageEvents.length"
        class="text-center"
      >
        <v-chip
          v-for="de in reliableDamageEvents"
          :key="de.DamageType"
          size="x-small"
          color="core"
          class="mr-1"
        >
          {{ $t('ui.combat.reliableOnMiss', { n: de.Reliable, type: de.DamageType }) }}
        </v-chip>
      </div>
    </div>
  </v-col>
</template>

<script setup lang="ts">
  import type { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import CheckRollInterface from './CheckRollInterface.vue'

  const { mdAndDown: mobile } = useDisplay()

  const props = withDefaults(
    defineProps<{
      event: ActiveEffectEvent
      crits?: boolean
    }>(),
    {
      crits: false,
    }
  )

  const reliableDamageEvents = computed(() =>
    (props.event.DamageEvents || []).filter((de: any) => de.Reliable > 0)
  )

  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import type { ActiveEventTarget } from '@/classes/components/feature/active_effects/effect_events/eventTarget'

  function rollAttack(s: ActiveEventTarget) {
    const lockOn = s.ConsumingLockOn ? 1 : 0
    const totalAccuracy = (s.AttackAccuracy || 0) + (s.StatusAccuracy || 0) + lockOn

    const rollResult = DiceRoller.rollSkillCheck(
      Number(s.AttackBonus) || 0,
      totalAccuracy
    )
    s.AttackRollResult = rollResult
    s.AttackRolledValue = rollResult.total

    if (Number(rollResult.total) >= 20 && props.event.Effect?.CanCrit) {
      props.event.SetCrit()
    } else {
      props.event.UnsetCrit()
    }

    void dddiceService.rollDice({
      diceString: '1d20',
      flatBonus: Number(s.AttackBonus) || 0,
      accuracy: totalAccuracy,
      label: `Ataque vs ${s.TargetDefense || 'Alvo'}`,
      external_id: s.Event?.Initiator?.actor?.CombatController?.CombatName || undefined,
    })

    const actorName = s.Event?.Initiator?.actor?.CombatController?.CombatName || 'Piloto'
    const targetName = (s as any).Target?.actor?.Name || s.TargetDefense || 'Alvo'
    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'roll',
      title: `Rolou Ataque vs ${targetName}`,
      targetName,
      roll: {
        total: Number(rollResult.total),
        formula: `1d20${Number(s.AttackBonus) >= 0 ? '+' : ''}${s.AttackBonus || 0}`,
        isCrit: Number(rollResult.total) >= 20 && props.event.Effect?.CanCrit,
        accuracy: totalAccuracy,
      },
    })
  }

  function overrideSave(s: ActiveEventTarget) {
    if (!s.HitResult) return
    if (s.HitResult === 'crit') {
      s.AttackRolledValue = 1
      props.event.UnsetCrit()
    } else if (s.HitResult === 'miss') {
      s.AttackRolledValue = s.TargetDefenseValue
    } else {
      s.AttackRolledValue = 20
      if (props.event.Effect?.CanCrit) props.event.SetCrit()
    }
  }

  function handleAttackRoll(s: ActiveEventTarget, val: any) {
    s.AttackRolledValue = Number(val)
    if (Number(val) >= 20 && props.event.Effect?.CanCrit) props.event.SetCrit()
    else props.event.UnsetCrit()
  }

  function onAttackRolled(val: any) {
    if (Number(val) >= 20 && props.event.Effect?.CanCrit) props.event.SetCrit()
    else props.event.UnsetCrit()
  }
</script>

<style scoped>
  ::v-deep(.short .v-field__input) {
    min-height: 28px !important;
    padding: 4px !important;
    padding-left: 8px !important;
  }

  ::v-deep(.short .v-field) {
    height: 28px !important;
  }
</style>
