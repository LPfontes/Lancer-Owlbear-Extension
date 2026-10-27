<template>
  <cc-dialog
    v-model="open"
    :title="$t('active.burnCheck.title')"
    :close-on-click="false"
    @update:model-value="onToggle"
  >
    <p
      v-html-safe="$t('active.burnCheck.prompt', { n: burn })"
      class="body-text text-text mb-3 pa-2"
    />

    <div class="pa-2 border-s-xl border-accent">
      <div class="body-text mb-1">
        {{ $t('active.structureCheck.saveCheck', { check: 'ENGINEERING' }) }}
      </div>
      <accuracy-difficulty-row
        v-model="acc"
        v-model:bonus="bonus"
      />
      <div
        class="d-flex align-center flex-wrap mt-1"
        style="gap: 8px"
      >
        <cc-button
          size="x-small"
          prepend-icon="mdi-dice-d20"
          :loading="isRolling"
          @click="roll"
        >
          {{ $t('active.structureCheck.rollCheck', { check: 'ENGINEERING' }) }}
        </cc-button>
        <span
          v-if="detail"
          v-html-safe="detail"
          class="body-text"
        />
      </div>
      <div class="mt-2">
        <v-btn-toggle
          v-model="outcome"
          density="compact"
          variant="outlined"
          divided
        >
          <v-btn
            value="success"
            size="small"
            color="success"
          >
            {{ $t('active.structureCheck.success') }}
          </v-btn>
          <v-btn
            value="fail"
            size="small"
            color="error"
          >
            {{ $t('active.structureCheck.fail') }}
          </v-btn>
        </v-btn-toggle>
      </div>
      <div
        v-if="outcome"
        class="text-cc-overline mt-2"
        :class="outcome === 'success' ? 'text-success' : 'text-error'"
      >
        {{
          outcome === 'success'
            ? $t('active.burnCheck.onSuccess')
            : $t('active.burnCheck.onFail', { n: burn })
        }}
      </div>
    </div>

    <v-divider />
    <v-card-actions>
      <cc-button
        variant="text"
        @click="ignore"
      >
        {{ $t('active.burnCheck.ignore') }}
      </cc-button>
      <v-spacer />
      <cc-button
        color="primary"
        prepend-icon="mdi-check"
        :disabled="!outcome"
        @click="apply"
      >
        {{ $t('active.burnCheck.resolveEndTurn') }}
      </cc-button>
    </v-card-actions>
  </cc-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { DiceRoller, D20RollResult } from '@/classes/dice/DiceRoller'
  import AccuracyDifficultyRow from '@/ui/components/chips/_activeeffect/_shared/AccuracyDifficultyRow.vue'
  import { StatKey } from '@/classes/components/combat/stats/Stats'
  import type { CombatController } from '@/classes/components/combat/CombatController'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const props = defineProps<{ modelValue: boolean; cc: CombatController }>()
  const emit = defineEmits<{
    'update:modelValue': [boolean]
    resolved: [answer: { success?: boolean; skip?: boolean; rolled?: number }]
  }>()

  const open = computed({
    get: () => props.modelValue,
    set: v => emit('update:modelValue', v),
  })

  const burn = computed(() => props.cc.StatController.getCurrent(StatKey.BURN))

  const bonus = ref(0)
  const acc = ref(0)
  const detail = ref('')
  const outcome = ref<'success' | 'fail' | undefined>(undefined)
  const rolled = ref<number | undefined>(undefined)
  const isRolling = ref(false)

  function seed() {
    bonus.value = props.cc.getCheckBonus('Eng')
    acc.value = 0
    detail.value = ''
    outcome.value = undefined
    rolled.value = undefined
    isRolling.value = false
  }

  async function roll() {
    if (isRolling.value) return
    isRolling.value = true

    const finalBonus = Number(bonus.value) || 0
    const finalAcc = Number(acc.value) || 0
    let r: any = null

    try {
      if (dddiceService.config.enabled) {
        try {
          const rollRes = await dddiceService.rollDice({
            diceString: '1d20',
            flatBonus: finalBonus,
            accuracy: finalAcc,
            label: `Teste de Engenharia [${props.cc.CombatName || 'Combatente'}]`,
            external_id: props.cc.CombatName || undefined,
          })

          if (rollRes && rollRes.values && rollRes.values.length > 0) {
            const d20Die = rollRes.values.find((v: any) => v.type?.toLowerCase() === 'd20' || v.type === '20')
            const rawD20 = d20Die && typeof d20Die.value !== 'undefined' ? Number(d20Die.value) : DiceRoller.rollDie(20)

            const d6Dice = rollRes.values.filter((v: any) => (v.type?.toLowerCase() === 'd6' || v.type === '6') && !v.is_dropped) || []
            const neededAcc = Math.abs(finalAcc)
            const rawAccuracyRolls: number[] = []

            for (let i = 0; i < neededAcc; i++) {
              if (i < d6Dice.length && typeof d6Dice[i].value !== 'undefined') {
                rawAccuracyRolls.push(Number(d6Dice[i].value))
              } else {
                rawAccuracyRolls.push(DiceRoller.rollDie(6))
              }
            }

            let accuracyResult = 0
            if (finalAcc > 0 && rawAccuracyRolls.length > 0) {
              accuracyResult = Math.max(...rawAccuracyRolls)
            } else if (finalAcc < 0 && rawAccuracyRolls.length > 0) {
              accuracyResult = -Math.max(...rawAccuracyRolls)
            }

            const total = rawD20 + finalBonus + accuracyResult
            r = new D20RollResult(total, rawD20, finalBonus, finalAcc, rawAccuracyRolls, accuracyResult)
          }
        } catch (e) {
          console.warn('[BurnCheckModal] Erro ao rolar com dddice:', e)
        }
      }

      // Se a rolagem da extensão não estiver habilitada ou falhar, rola localmente
      if (!r) {
        r = DiceRoller.rollSkillCheck(finalBonus, finalAcc)
      }

      detail.value = r.toString()
      rolled.value = Number(r.total) || 0
      outcome.value = Number(r.total) >= 10 ? 'success' : 'fail'

      const isCritical = Number(r.total) >= 20 || Number(r.rawDieRoll) === 20
      const actorName = props.cc.CombatName || 'Combatente'
      const formulaStr = `1d20${finalBonus >= 0 ? '+' : ''}${finalBonus}${finalAcc !== 0 ? (finalAcc > 0 ? ` +${finalAcc}A` : ` ${finalAcc}D`) : ''}`
      const tags = ['Queimadura', outcome.value === 'success' ? 'Sucesso' : 'Falha']
      if (isCritical) tags.push('CRÍTICO')

      void useTableActionStore().postAction({
        senderName: actorName,
        category: 'roll',
        title: 'Teste de Engenharia (Queimadura / Burn)',
        detail: r.toString ? r.toString() : String(r.total),
        roll: {
          total: Number(r.total) || 0,
          formula: formulaStr,
          isCrit: isCritical,
          accuracy: finalAcc,
        },
        tags,
      })
    } finally {
      isRolling.value = false
    }
  }

  watch(
    () => props.modelValue,
    v => {
      if (v) seed()
    },
    { immediate: true }
  )

  function onToggle(v: boolean) {
    if (v) seed()
  }

  function ignore() {
    open.value = false
    emit('resolved', { skip: true })
  }

  function apply() {
    if (!outcome.value) return
    open.value = false
    emit('resolved', { success: outcome.value === 'success', rolled: rolled.value })
  }
</script>
