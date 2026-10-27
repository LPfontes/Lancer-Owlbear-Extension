<template>
  <v-dialog
    :fullscreen="mobile"
    :max-width="mobile ? '' : '620px'"
    scrim="black"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        size="small"
        variant="tonal"
        color="error"
        icon="cc:eclipse"
        class="rounded-0"
        style="height: 32px; width: 32px;"
        :disabled="!combatant?.actor?.CombatController"
        :title="$t('active.damageApply.title')"
      />
    </template>

    <template #default="{ isActive }">
      <v-card class="bg-panel">
        <v-toolbar
          height="40"
          color="error"
          class="text-center"
        >
          <v-icon
            icon="cc:eclipse"
            class="mt-n1 ml-2"
            start
          />
          <span class="heading h3 mt-1">{{ $t('active.damageApply.title') }}</span>
          <v-spacer />
          <v-btn
            icon
            @click="isActive.value = false"
          >
            <v-icon icon="mdi-close" />
          </v-btn>
        </v-toolbar>

        <v-card-text>
          <div class="text-cc-overline text-accent mb-1">
            {{ combatant?.actor?.Callsign || combatant?.actor?.Name || combatant?.id }}
          </div>

          <v-row dense>
            <v-col
              cols="12"
              md="6"
            >
              <div class="text-cc-overline text-disabled">{{ $t('active.damageApply.incoming') }}</div>
              <v-text-field
                v-model="value"
                type="number"
                min="0"
                density="compact"
                variant="outlined"
                tile
                hide-details
                class="mt-1"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <div class="text-cc-overline text-disabled">{{ $t('active.damageApply.dice') }}</div>
              <div class="d-flex align-center ga-2 mt-1">
                <v-text-field
                  v-model="dice"
                  placeholder="2d6"
                  density="compact"
                  variant="outlined"
                  tile
                  hide-details
                />
                <v-btn
                  size="small"
                  variant="tonal"
                  color="accent"
                  class="rounded-0"
                  prepend-icon="mdi-dice-multiple"
                  @click="rollDice"
                >
                  {{ $t('hud.roll') }}
                </v-btn>
              </div>
            </v-col>
          </v-row>

          <div class="text-cc-overline text-disabled mt-3">{{ $t('active.damageApply.type') }}</div>
          <v-btn-toggle
            v-model="type"
            mandatory
            density="compact"
            variant="outlined"
            class="mt-1 d-flex flex-wrap"
          >
            <v-btn
              v-for="option in damageTypes"
              :key="option.value"
              :value="option.value"
              size="small"
              class="rounded-0"
            >
              <v-icon
                :icon="option.icon"
                :color="option.color"
                start
                size="18"
              />
              {{ option.label }}
            </v-btn>
          </v-btn-toggle>

          <v-row
            dense
            class="mt-2"
          >
            <v-col cols="auto">
              <v-checkbox
                v-model="half"
                :label="$t('active.damageApply.half')"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="auto">
              <v-checkbox
                v-model="ap"
                :label="$t('active.damageApply.ap')"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="auto">
              <v-checkbox
                v-model="irreducible"
                :label="$t('active.damageApply.irreducible')"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col
              cols="12"
              md="3"
            >
              <v-text-field
                v-model="burn"
                type="number"
                min="0"
                density="compact"
                variant="outlined"
                tile
                hide-details
                :label="$t('active.damageApply.burnStack')"
              />
            </v-col>
          </v-row>

          <!-- Prévia: é a mesma função que aplica, então o número bate com o resultado. -->
          <v-card
            flat
            tile
            color="background"
            class="mt-3 pa-2"
          >
            <div class="d-flex align-center justify-space-between">
              <div class="text-cc-overline">
                {{ $t('active.damageApply.preview') }}
                <b class="text-accent ml-1">{{ preview?.incoming ?? 0 }}</b>
                <v-icon
                  icon="mdi-arrow-right"
                  size="14"
                  class="mx-1"
                />
                <b class="text-accent">{{ preview?.final ?? 0 }}</b>
              </div>
              <div class="text-caption">
                <span v-if="preview?.armorReduced" class="text-disabled mr-2">
                  ARMOR −{{ preview.armorReduced }}
                </span>
                <span
                  v-if="conditionLabel"
                  class="text-accent"
                >
                  {{ conditionLabel }}
                </span>
              </div>
            </div>
            <div
              v-if="lethal"
              class="text-caption text-error mt-1"
            >
              {{ $t('active.damageApply.lethal') }}
            </div>
            <div
              v-if="burnValue > 0"
              class="text-caption text-warning mt-1"
            >
              {{ $t('active.damageApply.burnNote', { n: burnValue }) }}
            </div>
          </v-card>

          <v-row
            dense
            justify="end"
            class="mt-3"
          >
            <v-col cols="auto">
              <v-btn
                variant="text"
                color="disabled"
                @click="isActive.value = false"
              >
                {{ $t('hud.cancel') }}
              </v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn
                color="error"
                variant="elevated"
                class="font-weight-bold px-4 rounded-0"
                prepend-icon="mdi-check"
                :disabled="!canApply"
                @click="apply(isActive)"
              >
                {{ $t('active.damageApply.apply') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useI18n } from 'vue-i18n'
  import { DamageType } from '@/classes/enums'
  import { StatKey } from '@/classes/components/combat/stats/Stats'
  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import {
    applyDamageToCombatant,
    previewDamage,
    publishDamageReport,
    type DamageInput,
    type DamageReport,
  } from '@/services/damageApplication'

  const props = defineProps<{ combatant: any }>()
  const emit = defineEmits<{ applied: [report: DamageReport] }>()

  const { t } = useI18n()
  const { smAndDown: mobile } = useDisplay()

  const value = ref(0)
  const dice = ref('')
  const type = ref<DamageType>(DamageType.Kinetic)
  const half = ref(false)
  const ap = ref(false)
  const irreducible = ref(false)
  const burn = ref(0)

  const damageTypes = computed(() => [
    { value: DamageType.Kinetic, icon: 'cc:kinetic', color: 'damage--kinetic', label: t('active.damageApply.kinetic') },
    { value: DamageType.Energy, icon: 'cc:energy', color: 'damage--energy', label: t('active.damageApply.energy') },
    { value: DamageType.Explosive, icon: 'cc:explosive', color: 'damage--explosive', label: t('active.damageApply.explosive') },
    { value: DamageType.Heat, icon: 'cc:heat', color: 'damage--heat', label: t('active.damageApply.heat') },
    { value: DamageType.Burn, icon: 'cc:burn', color: 'damage--burn', label: t('active.damageApply.burn') },
  ])

  const burnValue = computed(() => Math.max(0, Number(burn.value) || 0))

  const input = computed(
    (): DamageInput => ({
      type: type.value,
      value: Number(value.value) || 0,
      half: half.value,
      ap: ap.value,
      irreducible: irreducible.value,
      burn: burnValue.value,
    })
  )

  const preview = computed(() => previewDamage(props.combatant, input.value))

  const conditionLabel = computed(() => {
    const condition = preview.value?.condition
    if (!condition || condition === 'nominal') return ''
    return t(`active.damageApply.condition.${condition}`, t('active.damageApply.condition.other'))
  })

  /** O dano previsto mata o alvo? (a prévia não mexe em nada, então lemos o HP atual) */
  const lethal = computed(() => {
    const actor = props.combatant?.actor
    if (!preview.value) return false
    const controller = actor?.ActiveMech?.CombatController ?? actor?.CombatController
    const hp = controller?.StatController?.getCurrent?.(StatKey.HP)
    if (typeof hp !== 'number') return false
    return preview.value.final >= hp
  })

  const canApply = computed(
    () => !!preview.value && (input.value.value > 0 || burnValue.value > 0)
  )

  function rollDice() {
    const expression = String(dice.value || '').trim()
    if (!expression) return
    try {
      value.value = DiceRoller.roll(expression)
    } catch (err) {
      console.warn('[DamageApplication] Expressão de dados inválida:', expression, err)
    }
  }

  async function apply(isActive: { value: boolean }) {
    if (!canApply.value) return

    const report = applyDamageToCombatant(props.combatant, input.value)
    if (!report) return

    // Publica na ficha sincronizada (só o Mestre passa; a função recusa o resto).
    const published = await publishDamageReport(report)
    if (!published) {
      console.warn(
        '[DamageApplication] Dano aplicado localmente, mas não publicado na mesa (sem permissão ou sem delta).'
      )
    }

    emit('applied', report)
    isActive.value = false
  }
</script>
