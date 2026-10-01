<template>
  <v-col
    v-if="visibleDamageEvents.length"
    :cols="mobile ? 12 : cols"
  >
    <v-row
      v-for="(d, d_idx) in visibleDamageEvents"
      :key="`damageEvent_${event.ID}_${d_idx}`"
      no-gutters
    >
      <v-col :cols="mobile ? '' : 'auto'">
        <div class="text-cc-overline text-disabled">{{ $t('ui.fields.damageType') }}</div>
        <v-select
          :model-value="d.DamageType"
          :items="damageOptions"
          density="compact"
          hide-details
          variant="outlined"
          flat
          tile
        />
      </v-col>

      <v-col
        cols="auto"
        class="ml-4"
      >
        <div class="text-cc-overline text-disabled ml-1">{{ $t('ui.combat.damageValue') }}</div>

        <div class="d-flex align-center ga-2 mb-1">
          <cc-button
            size="small"
            color="error"
            prepend-icon="mdi-dice-multiple"
            @click="rollDamage(d)"
          >
            {{ d.DamageRolledValue !== undefined ? $t('ui.combat.rerollDamage') : $t('ui.combat.rollDamage') }}
            <span v-if="d.DamageRollString" class="text-caption ml-1 font-weight-regular opacity-80">
              ({{ d.DamageRollString }})
            </span>
          </cc-button>

          <v-text-field
            :model-value="d.DamageRolledValue"
            :placeholder="d.DamageRollString"
            type="number"
            density="compact"
            hide-spin-buttons
            variant="outlined"
            flat
            :hide-details="!damageHints(d).length"
            persistent-hint
            :hint="damageHints(d)"
            tile
            :error="isNaN(Number(d.DamageRolledValue))"
            width="120px"
            @update:model-value="d.DamageRolledValue = Number($event)"
          >
            <template #prepend>
              <dice-roll-interface :roll-data="d" />
            </template>
          </v-text-field>
        </div>

        <div
          v-if="d.Bonus && d.BonusDamageEvent"
          class="pt-1"
        >
          <div class="text-cc-overline text-disabled ml-1">{{ $t('ui.combat.bonusDamage') }}</div>
          <div class="d-flex align-center ga-2">
            <cc-button
              size="small"
              color="warning"
              prepend-icon="mdi-dice-multiple"
              @click="rollBonus(d)"
            >
              {{ d.BonusDamageEvent.DamageRolledValue !== undefined ? $t('ui.combat.rerollDamage') : $t('ui.combat.rollBonusDamage') }}
              <span v-if="d.BonusDamageEvent.DamageRollString" class="text-caption ml-1 font-weight-regular opacity-80">
                ({{ d.BonusDamageEvent.DamageRollString }})
              </span>
            </cc-button>

            <v-text-field
              v-model="d.BonusDamageEvent.DamageRolledValue"
              :placeholder="d.BonusDamageEvent?.DamageRollString"
              class="bonusField"
              type="number"
              density="compact"
              hide-spin-buttons
              hide-details
              variant="outlined"
              flat
              tile
              width="120px"
            >
              <template #prepend>
                <dice-roll-interface :roll-data="d.BonusDamageEvent!" />
              </template>
              <template #append>
                <v-tooltip
                  v-if="aoe"
                  location="top"
                  max-width="250"
                >
                  <template #activator="{ props }">
                    <v-icon
                      v-bind="props"
                      class="mr-n4 ml-n2"
                      size="25"
                      icon="mdi-alert-outline"
                    />
                  </template>
                  <div class="text-center">{{ $t('ui.combat.bonusDamageHalved') }}</div>
                </v-tooltip>
              </template>
            </v-text-field>
          </div>
        </div>
        <damage-effect-options
          :damage-effect="d"
          class="ml-1 mt-1"
        />
        <div
          v-if="d.OverkillHeat"
          class="text-right"
        >
          <cc-chip
            bg-color="damage--heat"
            class="mr-4"
          >
            <v-icon icon="cc:heat" />
            {{ $t('ui.combat.overkillHeat', { n: d.OverkillHeat }) }}
          </cc-chip>
        </div>
      </v-col>
    </v-row>
  </v-col>
</template>

<script setup lang="ts">
  import type { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import DiceRollInterface from './DiceRollInterface.vue'
  import DamageEffectOptions from './DamageEffectOptions.vue'
  import { DamageEvent } from '@/classes/components/feature/active_effects/effect_events/damageEvent'
  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import { dddiceService } from '@/services/dddiceService'
  import { useI18n } from 'vue-i18n'
  const { t } = useI18n()

  const { mdAndDown: mobile } = useDisplay()

  const props = withDefaults(
    defineProps<{
      event: ActiveEffectEvent
      aoe?: boolean
      cols?: number | string
    }>(),
    {
      cols: 'auto',
    }
  )

  const visibleDamageEvents = computed(() => {
    const targets = props.event.Targets.filter(t => t && t.Combatant)
    return (props.event.DamageEvents || []).filter(d => {
      if (d.DamageType.toLowerCase() !== 'heat') return true
      return !(targets.length > 0 && targets.every(t => t.HeatExempt))
    })
  })

  const damageOptions = [
    { title: t('ui.titles.kinetic'), value: 'kinetic' },
    { title: t('ui.titles.energy'), value: 'energy' },
    { title: t('ui.titles.explosive'), value: 'explosive' },
    { title: t('ui.titles.heat'), value: 'heat' },
    { title: t('ui.titles.burn'), value: 'burn' },
  ]

  function damageHints(d: DamageEvent) {
    const hints = [] as string[]
    if (d.AP) hints.push(`AP`)
    if (d.IsCrit) hints.push(`Critical Hit`)
    if (d.Irreducible) hints.push(`Irreducible`)
    if (d.Overkill) hints.push(`Overkill`)
    if (d.Reliable) hints.push(`Reliable ${d.Reliable}`)

    return hints.join(' // ')
  }

  import { useTableActionStore } from '@/stores/tableActionStore'

  function rollDamage(d: DamageEvent) {
    let rollResult: any
    if (d.DamageRollString && d.DamageRollString.includes('d')) {
      rollResult = DiceRoller.rollDamage(
        d.DamageRollString,
        d.IsCrit,
        d.Overkill,
        d.Reliable
      )
    } else {
      const val = Number(d.DamageRollString) || 0
      rollResult = { total: val, toString: () => val.toString() }
    }
    d.ApplyRoll(rollResult)

    if (d.DamageRollString && d.DamageRollString.includes('d')) {
      void dddiceService.rollDice({
        diceString: d.DamageRollString,
        label: `Dano [${d.DamageType}]`,
      })
    }

    const actorName =
      (props.event.Initiator as any)?.actor?.CombatController?.CombatName ||
      (props.event.Initiator as any)?.actor?.Name ||
      (props.event.Initiator as any)?.Name ||
      'Piloto'
    const targetName =
      props.event.Targets?.map((t: any) => t?.Combatant?.actor?.CombatName || t?.TargetDefense || 'Alvo').filter(Boolean).join(', ') ||
      undefined

    const tags: string[] = [d.DamageType]
    if (d.IsCrit) tags.push('CRÍTICO')
    if (d.AP) tags.push('AP')
    if (d.Overkill) tags.push('EXAGERO')

    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'damage',
      title: `Dano [${d.DamageType}]`,
      detail: rollResult.toString ? rollResult.toString() : String(rollResult.total),
      targetName,
      roll: {
        total: Number(rollResult.total) || 0,
        formula: d.DamageRollString || String(rollResult.total),
        isCrit: !!d.IsCrit,
      },
      tags,
    })
  }

  function rollBonus(d: DamageEvent) {
    if (!d.BonusDamageEvent) return
    const bd = d.BonusDamageEvent
    let rollResult: any
    if (bd.DamageRollString && bd.DamageRollString.includes('d')) {
      rollResult = DiceRoller.rollDamage(
        bd.DamageRollString,
        bd.IsCrit,
        bd.Overkill,
        bd.Reliable
      )
    } else {
      const val = Number(bd.DamageRollString) || 0
      rollResult = { total: val, toString: () => val.toString() }
    }
    bd.ApplyRoll(rollResult)

    if (bd.DamageRollString && bd.DamageRollString.includes('d')) {
      void dddiceService.rollDice({
        diceString: bd.DamageRollString,
        label: `Dano Bônus [${bd.DamageType}]`,
      })
    }

    const actorName =
      (props.event.Initiator as any)?.actor?.CombatController?.CombatName ||
      (props.event.Initiator as any)?.actor?.Name ||
      (props.event.Initiator as any)?.Name ||
      'Piloto'
    const targetName =
      props.event.Targets?.map((t: any) => t?.Combatant?.actor?.CombatName || t?.TargetDefense || 'Alvo').filter(Boolean).join(', ') ||
      undefined

    const tags: string[] = [`${bd.DamageType} (Bônus)`]
    if (bd.IsCrit) tags.push('CRÍTICO')
    if (bd.AP) tags.push('AP')

    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'damage',
      title: `Dano Bônus [${bd.DamageType}]`,
      detail: rollResult.toString ? rollResult.toString() : String(rollResult.total),
      targetName,
      roll: {
        total: Number(rollResult.total) || 0,
        formula: bd.DamageRollString || String(rollResult.total),
        isCrit: !!bd.IsCrit,
      },
      tags,
    })
  }
</script>
