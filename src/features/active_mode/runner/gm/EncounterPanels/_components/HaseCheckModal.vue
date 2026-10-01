<template>
  <cc-dialog
    v-model="open"
    :title="`TESTE DE ATRIBUTO - ${currentStatLabel.toUpperCase()}`"
    icon="mdi-dice-d20"
    max-width="540px"
    :close-on-click="false"
  >
    <div class="hase-modal-body pa-3">
      <!-- Cabeçalho do Ator -->
      <div class="actor-header-box d-flex align-center justify-space-between px-3 py-2 mb-3 rounded border">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-account" color="accent" size="18" />
          <span class="font-weight-bold text-subtitle-2">{{ actorName }}</span>
        </div>
        <v-chip size="x-small" color="accent" variant="tonal" class="font-weight-bold text-uppercase">
          {{ currentStatLabel.toUpperCase() }}
        </v-chip>
      </div>



      <!-- Ajustes de Rolagem: Modificador Fixo e Acerto/Dificuldade -->
      <div class="modifiers-panel px-3 py-3 rounded border mb-3">
        <div class="text-caption text-disabled text-uppercase font-weight-bold mb-2">
          Modificadores do Teste
        </div>

        <div class="d-flex align-center justify-space-between flex-wrap ga-3">
          <!-- Bônus Fixo / Modificador -->
          <div class="d-flex align-center ga-2">
            <span class="text-caption text-grey">Bônus:</span>
            <v-text-field
              v-model.number="bonus"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              style="width: 80px;"
              class="text-center"
              prefix="+"
            />
          </div>

          <!-- Acerto / Dificuldade (+ / - d6) -->
          <div class="d-flex align-center ga-1">
            <span class="text-caption text-grey mr-1">Acerto/Dif:</span>
            <v-btn
              icon="mdi-minus"
              size="x-small"
              variant="tonal"
              color="error"
              title="Adicionar 1 Dificuldade (-1d6)"
              @click="acc--"
            />
            <v-chip
              size="small"
              :color="acc > 0 ? 'success' : acc < 0 ? 'error' : 'grey'"
              variant="flat"
              class="font-weight-bold px-2 mx-1"
              style="min-width: 58px; justify-content: center;"
            >
              {{ acc > 0 ? `+${acc} A` : acc < 0 ? `${acc} D` : '0' }}
            </v-chip>
            <v-btn
              icon="mdi-plus"
              size="x-small"
              variant="tonal"
              color="success"
              title="Adicionar 1 Acerto (+1d6)"
              @click="acc++"
            />
          </div>
        </div>

        <!-- Indicativo da fórmula calculada -->
        <div class="text-caption text-disabled mt-2 d-flex align-center ga-1">
          <v-icon icon="mdi-information-outline" size="13" />
          <span>
            Fórmula: <strong>1d20{{ bonus >= 0 ? `+${bonus}` : `${bonus}` }}</strong>
            <span v-if="acc !== 0" :class="acc > 0 ? 'text-success' : 'text-error'">
              {{ acc > 0 ? ` + ${acc}d6` : ` - ${Math.abs(acc)}d6` }}
            </span>
          </span>
        </div>
      </div>

      <!-- Botão de Ação: Rolar Dados -->
      <v-btn
        block
        color="accent"
        size="large"
        class="font-weight-bold text-black mb-3"
        :loading="isRolling"
        @click="executeRoll"
      >
        <v-icon icon="mdi-dice-multiple" start size="20" />
        <span>ROLAR TESTE DE {{ currentStatLabel.toUpperCase() }}</span>
      </v-btn>

      <!-- Painel de Resultado da Rolagem (quando houver resultado) -->
      <div
        v-if="lastRoll"
        class="result-card pa-3 rounded border"
        :class="resultCardClass"
      >
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="d-flex align-center ga-2">
            <v-chip
              size="small"
              :color="isSuccess ? 'success' : 'error'"
              variant="flat"
              class="font-weight-bold text-uppercase"
            >
              {{ isSuccess ? 'Sucesso' : 'Falha' }}
            </v-chip>
            <v-chip
              v-if="isCrit"
              size="small"
              color="warning"
              variant="flat"
              class="font-weight-bold text-uppercase text-black"
            >
              Crítico!
            </v-chip>
          </div>

          <div class="d-flex align-center ga-1">
            <span class="text-caption text-disabled mr-1">Total:</span>
            <span class="text-h5 font-weight-black" :class="totalColorClass">
              {{ lastRoll.total }}
            </span>
          </div>
        </div>

        <!-- Detalhe da Rolagem (com suporte a tags HTML formatadas) -->
        <div class="result-breakdown text-caption text-grey-lighten-1 pa-2 rounded mb-2">
          <div v-html-safe="lastRoll.toString()" />
        </div>
      </div>
    </div>

    <v-divider />

    <v-card-actions class="pa-2 d-flex justify-space-between">
      <v-btn
        v-if="lastRoll"
        variant="tonal"
        color="accent"
        size="small"
        prepend-icon="mdi-refresh"
        :loading="isRolling"
        @click="executeRoll"
      >
        Rolar Novamente
      </v-btn>
      <v-spacer v-else />

      <v-btn
        variant="text"
        size="small"
        @click="open = false"
      >
        Fechar
      </v-btn>
    </v-card-actions>
  </cc-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DiceRoller, D20RollResult } from '@/classes/dice/DiceRoller'
import { dddiceService } from '@/services/dddiceService'
import { useTableActionStore } from '@/stores/tableActionStore'
import type { CombatController } from '@/classes/components/combat/CombatController'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    cc?: CombatController
    initialStat?: string
    actorName?: string
    stats?: {
      grit: number
      hull: number
      agility: number
      systems: number
      engineering: number
    }
  }>(),
  {
    initialStat: 'grit',
    actorName: 'Piloto',
    stats: () => ({
      grit: 0,
      hull: 0,
      agility: 0,
      systems: 0,
      engineering: 0,
    }),
  }
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  rolled: [result: D20RollResult]
}>()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const selectedStat = ref(props.initialStat || 'grit')
const bonus = ref(0)
const acc = ref(0)
const isRolling = ref(false)
const lastRoll = ref<D20RollResult | null>(null)

const statOptions = computed(() => [
  { key: 'grit', label: 'BRIO', bonus: props.stats.grit ?? 0, color: '#3b82f6' },
  { key: 'hull', label: 'CASCO', bonus: props.stats.hull ?? 0, color: '#10b981' },
  { key: 'agility', label: 'AGILIDADE', bonus: props.stats.agility ?? 0, color: '#06b6d4' },
  { key: 'systems', label: 'SISTEMAS', bonus: props.stats.systems ?? 0, color: '#8b5cf6' },
  { key: 'engineering', label: 'ENGENHARIA', bonus: props.stats.engineering ?? 0, color: '#f59e0b' },
])

const currentStatLabel = computed(() => {
  const found = statOptions.value.find(s => s.key === selectedStat.value)
  return found ? found.label : selectedStat.value.toUpperCase()
})

const isSuccess = computed(() => {
  if (!lastRoll.value) return false
  return Number(lastRoll.value.total) >= 10
})

const isCrit = computed(() => {
  if (!lastRoll.value) return false
  return Number(lastRoll.value.total) >= 20 || Number(lastRoll.value.rawDieRoll) === 20
})

const resultCardClass = computed(() => {
  if (!lastRoll.value) return ''
  if (isCrit.value) return 'border-warning'
  return isSuccess.value ? 'border-success' : 'border-error'
})

const totalColorClass = computed(() => {
  if (!lastRoll.value) return ''
  if (isCrit.value) return 'text-warning'
  return isSuccess.value ? 'text-success' : 'text-error'
})

function selectStat(statKey: string) {
  selectedStat.value = statKey
  const opt = statOptions.value.find(s => s.key === statKey)
  bonus.value = opt ? opt.bonus : 0
  lastRoll.value = null
}

function syncInitial() {
  selectedStat.value = props.initialStat || 'grit'
  const opt = statOptions.value.find(s => s.key === selectedStat.value)
  bonus.value = opt ? opt.bonus : 0
  acc.value = 0
  lastRoll.value = null
}

watch(
  () => props.modelValue,
  val => {
    if (val) {
      syncInitial()
    }
  },
  { immediate: true }
)

watch(
  () => props.initialStat,
  newStat => {
    if (newStat) {
      selectedStat.value = newStat
      const opt = statOptions.value.find(s => s.key === newStat)
      bonus.value = opt ? opt.bonus : 0
    }
  }
)

async function executeRoll() {
  isRolling.value = true
  try {
    const statName = currentStatLabel.value
    const finalBonus = Number(bonus.value) || 0
    const finalAcc = Number(acc.value) || 0
    let rollResult: D20RollResult | null = null

    if (dddiceService.config.enabled) {
      try {
        const rollRes = await dddiceService.rollDice({
          diceString: '1d20',
          flatBonus: finalBonus,
          accuracy: finalAcc,
          label: `Teste de ${statName} [${props.actorName}]`,
          external_id: props.actorName || undefined,
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
          rollResult = new D20RollResult(total, rawD20, finalBonus, finalAcc, rawAccuracyRolls, accuracyResult)
        }
      } catch (e) {
        console.warn('[HaseCheckModal] Erro ao rolar com dddice:', e)
      }
    }

    if (!rollResult) {
      rollResult = DiceRoller.rollSkillCheck(finalBonus, finalAcc)
    }

    lastRoll.value = rollResult
    emit('rolled', rollResult)

    const isCritical = Number(rollResult.total) >= 20 || Number(rollResult.rawDieRoll) === 20
    const success = Number(rollResult.total) >= 10
    const formulaStr = `1d20${finalBonus >= 0 ? '+' : ''}${finalBonus}${finalAcc !== 0 ? (finalAcc > 0 ? ` +${finalAcc}A` : ` ${finalAcc}D`) : ''}`

    const tags = [statName, success ? 'Sucesso' : 'Falha']
    if (isCritical) tags.push('CRÍTICO')

    void useTableActionStore().postAction({
      senderName: props.actorName || 'Piloto',
      category: 'roll',
      title: `Teste de ${statName}`,
      detail: rollResult.toString(),
      roll: {
        total: Number(rollResult.total) || 0,
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
</script>

<style scoped>
.hase-modal-body {
  background: rgba(14, 18, 24, 0.98);
}

.actor-header-box {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.modifiers-panel {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.result-card {
  background: rgba(0, 0, 0, 0.35);
  border-width: 1px !important;
  border-style: solid !important;
}

.result-breakdown {
  background: rgba(0, 0, 0, 0.2);
  font-family: 'Consolas', monospace;
  font-size: 11px;
}

.result-breakdown :deep(sub) {
  font-size: 9px;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
  bottom: -0.2em;
}

.result-breakdown :deep(.text-accent) {
  color: rgb(var(--v-theme-accent, 255, 102, 0)) !important;
}
</style>
