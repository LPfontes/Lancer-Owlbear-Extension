<template>
  <v-col
    v-if="event.Attack"
    cols="auto"
  >
    <div
      v-if="!mobile"
      class="text-cc-overline text-disabled"
    >
      {{ $t('ui.combat.vsStat', { stat: event.AttackStat }) }}
    </div>
    <v-row
      v-for="(s, idx) in event.Targets"
      :key="`target-${idx}`"
      dense
      align="center"
    >
      <v-col
        cols="auto"
        class="mt-1"
      >
        <v-row
          v-if="!s"
          no-gutters
          align="center"
          justify="center"
        >
          <v-col
            cols="auto"
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
      </v-col>

      <v-col cols="auto">
        <v-menu open-on-hover>
          <template #activator="{ props }">
            <v-btn
              stacked
              :color="
                !s.HitResult
                  ? ''
                  : s.HitResult === 'crit'
                    ? 'exotic'
                    : s.HitResult === 'hit'
                      ? 'success'
                      : 'error'
              "
              flat
              :disabled="!s.HitResult"
              tile
              height="45"
              v-bind="s.HitResult === 'crit' ? {} : props"
            >
              <v-icon
                size="25"
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
              <template v-if="s.HitResult">
                {{
                  s.HitResult === 'crit'
                    ? $t('ui.combat.crit')
                    : s.HitResult === 'hit'
                      ? $t('ui.combat.hit')
                      : $t('ui.combat.miss')
                }}
              </template>
            </v-btn>
          </template>
          <v-card class="pa-2">
            <v-list-item
              class="text-center"
              :title="
                s.HitResult !== 'crit'
                  ? $t('ui.combat.noAttackRolled')
                  : s.HitResult === 'crit'
                    ? $t('ui.combat.criticalHit')
                    : s.HitResult === 'hit'
                      ? $t('ui.combat.successfulAttack')
                      : $t('ui.combat.miss')
              "
              :subtitle="$t('ui.subtitles.selectResult')"
            />
            <v-divider class="my-2" />
            <v-list-item
              :title="$t('ui.titles.successfulHit')"
              prepend-icon="mdi-check-circle"
              class="bg-success"
              @click="setHitResult(s, 'hit')"
            />
            <v-list-item
              :title="$t('ui.combat.miss')"
              prepend-icon="mdi-cancel"
              class="bg-error"
              @click="setHitResult(s, 'miss')"
            />
          </v-card>
        </v-menu>
      </v-col>
    </v-row>
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

  function setHitResult(s: ActiveEventTarget, val: 'hit' | 'miss') {
    s.OverrideHitResult(s.HitResultOverride === val ? undefined : val)
    if (s.HitResult === 'crit' && props.event.Effect?.CanCrit) props.event.SetCrit()
    else props.event.UnsetCrit()
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
