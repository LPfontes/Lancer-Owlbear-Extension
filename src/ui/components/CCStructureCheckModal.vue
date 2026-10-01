<template>
  <cc-dialog
    v-model="open"
    :title="dialogTitle"
    :close-on-click="false"
    @update:model-value="onToggle"
  >
    <p
      v-if="dialogDescription"
      v-html-safe="dialogDescription"
      class="body-text text-text mb-3 pa-2"
    />

    <div v-if="!result">
      <div class="text-cc-overline mb-2">
        {{
          $t('active.structureCheck.rollPrompt', {
            n: marked,
            die: table?.Die,
          })
        }}
      </div>
      <cc-button
        color="primary"
        block
        prepend-icon="mdi-dice-d6"
        :loading="isRolling"
        :disabled="isRolling"
        @click="roll"
      >
        {{ $t('active.structureCheck.rollLabel', { n: marked, die: table?.Die }) }}
      </cc-button>
    </div>

    <div v-else>
      <div
        class="d-flex flex-wrap align-center my-1"
        style="gap: 6px"
      >
        <span class="text-cc-overline mr-1">{{ $t('active.structureCheck.rolled') }}:</span>
        <v-chip
          v-for="(d, i) in result.dice"
          :key="i"
          :color="d === result.lowest ? 'accent' : undefined"
          :variant="d === result.lowest ? 'flat' : 'tonal'"
          size="small"
        >
          {{ d }}
        </v-chip>
        <v-chip
          v-if="result.multipleOnes"
          color="error"
          size="small"
          class="ml-2"
        >
          {{ $t('ui.rollTable.multipleOnes') }}
        </v-chip>
        <v-spacer />
        <cc-button
          size="x-small"
          variant="text"
          prepend-icon="mdi-dice-multiple"
          :loading="isRolling"
          :disabled="isRolling"
          @click="roll"
        >
          {{ $t('active.structureCheck.reroll') }}
        </cc-button>
      </div>

      <v-divider class="my-2" />
      <div class="heading h2 text-accent">{{ displayRowTitle }}</div>
      <p
        v-html-safe="displayRowResult"
        class="body-text text-text mt-1"
      />

      <div v-if="resolution.steps.length">
        <v-divider class="my-2" />
        <div class="text-cc-overline mb-1">{{ $t('active.structureCheck.resolution') }}</div>

        <div
          v-for="step in resolution.steps"
          :key="step.path"
          class="my-1"
        >
          <div
            v-if="step.kind === 'apply'"
            class="d-flex align-center"
          >
            <v-icon
              size="small"
              color="accent"
              class="mr-2"
            >
              mdi-chevron-right
            </v-icon>
            <span class="body-text text-uppercase">{{ formatStepLabel(step) }}</span>
          </div>

          <div
            v-else-if="step.kind === 'branch'"
            class="heading h3 text-accent"
          >
            {{ formatStepLabel(step) }}
          </div>

          <div
            v-else-if="step.kind === 'subroll'"
            class="d-flex align-center"
          >
            <v-chip
              size="small"
              color="primary"
              class="mr-2"
            >
              {{ step.rolled }}
            </v-chip>
            <span class="body-text">{{ formatStepLabel(step) }}</span>
          </div>

          <div
            v-else-if="step.kind === 'damage'"
            class="d-flex align-center"
          >
            <v-chip
              size="small"
              color="damage--kinetic"
              class="mr-2"
            >
              {{ step.rolled }}
            </v-chip>
            <span class="body-text">
              {{ formatStepLabel(step) }} ({{ $t('active.structureCheck.applyManual') }})
            </span>
          </div>

          <cc-alert
            v-else-if="step.kind === 'note'"
            color="background"
            class="border-s-xl border-accent"
            icon="mdi-information-outline"
          >
            <div class="text-caption">{{ formatStepLabel(step) }}</div>
          </cc-alert>

          <div
            v-else-if="step.kind === 'save'"
            class="pa-2 border-s-xl border-accent"
          >
            <div class="body-text mb-1">
              {{
                $t(
                  step.mode === 'save'
                    ? 'active.structureCheck.saveSave'
                    : 'active.structureCheck.saveCheck',
                  { check: formatCheckStat(step.check) }
                )
              }}
            </div>
            <accuracy-difficulty-row
              v-model="saveAcc[step.path]"
              v-model:bonus="saveBonus[step.path]"
            />
            <div
              class="d-flex align-center flex-wrap mt-1"
              style="gap: 8px"
            >
              <cc-button
                size="x-small"
                prepend-icon="mdi-dice-d20"
                @click="rollSave(step.path)"
              >
                {{ $t('active.structureCheck.rollCheck', { check: formatCheckStat(step.check) }) }}
              </cc-button>
              <span
                v-if="saveRolls[step.path]"
                v-html-safe="saveRolls[step.path].detail"
                class="body-text"
              />
            </div>
            <div class="mt-2">
              <v-btn-toggle
                v-model="saveChoices[step.path]"
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
          </div>

          <cc-flow-request
            v-else-if="step.kind === 'equip'"
            v-model="equipChoices[step.path]"
            :request="getStepRequest(step)"
          />
        </div>
      </div>
    </div>

    <div v-if="result">
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <cc-button
          color="primary"
          prepend-icon="mdi-check"
          :disabled="!resolution.complete"
          @click="apply"
        >
          {{
            hasActions
              ? $t('active.structureCheck.applyResolve')
              : $t('active.structureCheck.markResolved')
          }}
        </cc-button>
      </v-card-actions>
    </div>
  </cc-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import AccuracyDifficultyRow from '@/ui/components/chips/_activeeffect/_shared/AccuracyDifficultyRow.vue'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import type { CombatController } from '@/classes/components/combat/CombatController'
  import type {
    ICheckRollResult,
    IPendingCheck,
    Effect,
  } from '@/classes/components/combat/StructureCheck'
  import {
    getCheckTable,
    rollCheck,
    markedPoints,
    effectsFor,
    prerollEffects,
    resolveEffects,
    applyCheckEffects,
    recordCheckRoll,
    requestFor,
  } from '@/classes/components/combat/StructureCheck'
  import { withLogGroup } from '@/classes/components/combat/log/CombatLogRecorder'

  const props = defineProps<{
    modelValue: boolean
    cc: CombatController
    pending: IPendingCheck
  }>()

  const emit = defineEmits<{
    'update:modelValue': [boolean]
    'rolled': [ICheckRollResult]
    'resolved': []
  }>()
  const { t } = useI18n()

  const open = computed({
    get: () => props.modelValue,
    set: v => emit('update:modelValue', v),
  })

  const dialogTitle = computed(() => {
    if (props.pending.kind === 'stress') return t('active.structureCheck.stress')
    return t('active.structureCheck.structure')
  })

  const dialogDescription = computed(() => {
    if (props.pending.kind === 'stress') {
      return 'Quando o calor de um mecha ultrapassa sua Capacidade de Calor, ele sofre Dano de Estresse e rola nesta tabela. Escolha o menor resultado.'
    }
    return 'Quando o PV de um mecha é reduzido a 0, ele sofre 1 Dano de Estrutura e rola nesta tabela. Escolha o menor resultado.'
  })

  const TABLE_ROW_TRANSLATIONS: Record<string, { title: string; result: string }> = {
    'Glancing Blow': {
      title: 'Golpe de Raspão (5-6)',
      result: 'Os sistemas de emergência estabilizam o mecha. No entanto, seu mecha fica <strong>Debilitado</strong> até o final do seu próximo turno.',
    },
    'System Trauma': {
      title: 'Trauma de Sistema (2-4)',
      result: 'Partes do seu mecha foram arrancadas ou danificadas pelo impacto. Role 1d6 para determinar o que foi destruído.',
    },
    'Direct Hit': {
      title: 'Acerto Devastador (1)',
      result: 'Seu mecha sofre dano estrutural massivo baseado na sua Estrutura restante.',
    },
    'Crushing Hit': {
      title: 'Golpe Esmagador (Múltiplos 1s)',
      result: '<b class="heading h2 text-error">// MECHA DESTRUÍDO //</b><br>O mecha sofreu dano estrutural catastrófico e foi totalmente destruído.',
    },
    'Emergency Shunt': {
      title: 'Desvio de Emergência (5-6)',
      result: 'Os sistemas de resfriamento contêm o pico térmico. No entanto, seu mecha fica <strong>Debilitado</strong> até o final do seu próximo turno.',
    },
    'Destabilized Power Plant': {
      title: 'Gerador Desestabilizado (2-4)',
      result: 'O reator de energia do seu mecha fica instável. Seu mecha fica <strong>Exposto</strong>.',
    },
    'Meltdown': {
      title: 'Fusão do Reator (1)',
      result: 'O reator atinge temperatura crítica catastrófica e entra em processo de fusão!',
    },
    'Irreversible Meltdown': {
      title: 'Fusão Irreversível (Múltiplos 1s)',
      result: '<b class="heading h2 text-error">// FUSÃO CATASTRÓFICA //</b><br>O reator do mecha sofre uma explosão termonuclear imediata!',
    },
  }

  const displayRowTitle = computed(() => {
    const orig = result.value?.row?.title || ''
    return TABLE_ROW_TRANSLATIONS[orig]?.title || orig
  })

  const displayRowResult = computed(() => {
    const orig = result.value?.row?.title || ''
    return TABLE_ROW_TRANSLATIONS[orig]?.result || result.value?.row?.result || ''
  })

  const STATUS_NAMES_PT: Record<string, string> = {
    impaired: 'DEBILITADO',
    stunned: 'ATORDOADO',
    exposed: 'EXPOSTO',
    downandout: 'FORA DE COMBATE',
    shredded: 'DILACERADO',
    slowed: 'LENTIFICADO',
    immobilized: 'IMOBILIZADO',
    lockon: 'MIRA FIXADA',
    jammed: 'BLOQUEADO',
  }

  const STEP_LABEL_TRANSLATIONS: Record<string, string> = {
    'All weapons on one mount are destroyed': 'Todas as armas em um encaixe são destruídas',
    'One system is destroyed': 'Um sistema é destruído',
    'Nothing destroyable, Direct Hit': 'Nada destrutível, sofre Acerto Direto',
    'Mount to destroy': 'Encaixe a destruir',
    'System to destroy': 'Sistema a destruir',
    '3+ Structure': '3+ de Estrutura',
    '2 Structure': '2 de Estrutura',
    '1 Structure': '1 de Estrutura',
    '3+ Stress': '3+ de Estresse',
    '2 Stress': '2 de Estresse',
    '1 Stress': '1 de Estresse',
    'Destroyed': 'Destruído',
    'Reactor meltdown': 'Fusão do Reator',
    'until the end of its next turn': 'até o final do seu próximo turno',
    'for the rest of the scene': 'pelo restante da cena',
    'after 1d6 of your turns': 'após 1d6 dos seus turnos',
    'at the end of your next turn': 'ao final do seu próximo turno',
    'kinetic damage': 'dano cinético',
    'energy damage': 'dano de energia',
    'explosive damage': 'dano explosivo',
    'burn damage': 'dano de queimadura',
  }

  function getStepRequest(step: any) {
    const req = requestFor(step)
    if (!req) return undefined
    let label = req.label || ''
    if (STEP_LABEL_TRANSLATIONS[label]) {
      label = STEP_LABEL_TRANSLATIONS[label]
    }
    return {
      ...req,
      label,
    }
  }

  function formatStepLabel(step: any): string {
    if (!step?.label) return ''
    let text = step.label

    if (text.startsWith('active.') || text.startsWith('common.') || text.startsWith('stats.')) {
      text = t(text)
    }

    if (STEP_LABEL_TRANSLATIONS[text]) {
      return STEP_LABEL_TRANSLATIONS[text]
    }

    for (const [en, pt] of Object.entries(STEP_LABEL_TRANSLATIONS)) {
      if (text.toLowerCase().includes(en.toLowerCase())) {
        const reg = new RegExp(en, 'gi')
        text = text.replace(reg, pt)
      }
    }

    for (const [id, pt] of Object.entries(STATUS_NAMES_PT)) {
      const reg = new RegExp(`\\b${id}\\b`, 'gi')
      text = text.replace(reg, pt)
    }

    return text
  }

  function formatCheckStat(stat?: string): string {
    if (!stat) return ''
    const s = stat.toLowerCase()
    if (s === 'hull') return 'CASCO'
    if (s === 'agi') return 'AGILIDADE'
    if (s === 'sys') return 'SISTEMAS'
    if (s === 'eng') return 'ENGENHARIA'
    return stat.toUpperCase()
  }

  const table = computed(() => getCheckTable(props.pending.kind, props.cc))
  const marked = computed(() => markedPoints(props.cc, props.pending.kind))

  const result = ref<ICheckRollResult | null>(null)
  const effects = ref<Effect[]>([])
  const rolls = ref<Record<string, number>>({})
  const saveChoices = reactive<Record<string, 'success' | 'fail'>>({})
  const equipChoices = reactive<Record<string, string>>({})
  const saveRolls = reactive<Record<string, { detail: string }>>({})
  const saveBonus = reactive<Record<string, number>>({})
  const saveAcc = reactive<Record<string, number>>({})

  const resolution = computed(() =>
    resolveEffects(
      effects.value,
      {
        currentStructure: props.cc.CurrentStructure,
        currentStress: props.cc.CurrentStress,
        rolls: rolls.value,
        saveChoices,
        equipChoices,
      },
      props.cc
    )
  )

  const hasActions = computed(() => resolution.value.actions.length > 0)

  const CHECK_STAT: Record<string, 'Hull' | 'Agi' | 'Sys' | 'Eng'> = {
    hull: 'Hull',
    agi: 'Agi',
    sys: 'Sys',
    eng: 'Eng',
  }

  function clearChoices() {
    ;[saveChoices, equipChoices, saveRolls, saveBonus, saveAcc].forEach(rec =>
      Object.keys(rec).forEach(k => delete rec[k])
    )
  }

  watch(
    resolution,
    r => {
      r.steps.forEach(s => {
        if (s.kind === 'save' && saveBonus[s.path] === undefined) {
          saveBonus[s.path] = props.cc.getCheckBonus(CHECK_STAT[s.check || ''] || 'Hull')
          saveAcc[s.path] = 0
        }
      })
    },
    { immediate: true }
  )

  const isRolling = ref(false)

  async function roll() {
    const t = table.value
    if (!t) return
    clearChoices()
    isRolling.value = true

    const diceCount = Math.max(1, marked.value)
    let dddiceDice: number[] | undefined

    try {
      const rollRes = await dddiceService.rollDice({
        diceString: `${diceCount}d6`,
        label: `${(t as any)?.Name || (props.pending.kind === 'structure' ? 'Structure Check' : 'Overheat Check')} [${props.cc?.CombatName || 'Mech'}]`,
        external_id: props.cc?.CombatName || undefined,
      })

      if (rollRes && rollRes.values && rollRes.values.length > 0) {
        // Usa os valores reais rolados no dddice
        dddiceDice = rollRes.values
          .filter(v => !v.is_dropped)
          .map(v => Number(v.value))
      }
    } catch (e) {
      console.warn('[StructureCheck] Erro ao rolar no dddice, usando fallback local:', e)
    } finally {
      isRolling.value = false
    }

    const r = rollCheck(t, marked.value, dddiceDice)
    result.value = r
    effects.value = r.row ? effectsFor(t.ID, r.row) : []
    rolls.value = prerollEffects(effects.value)
    emit('rolled', r)

    const actorName = props.cc?.CombatName || 'Mech'
    const checkKind = props.pending.kind === 'structure' ? 'Estrutura (Structure Check)' : 'Superaquecimento (Overheat Check)'
    
    let translatedTitle = r.row?.title || ''
    if (r.row?.title && TABLE_ROW_TRANSLATIONS[r.row.title]) {
      translatedTitle = TABLE_ROW_TRANSLATIONS[r.row.title].title.split(' (')[0]
    }
    const rowTitle = translatedTitle ? ` - ${translatedTitle}` : ''
    
    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'roll',
      title: `Teste de ${checkKind}`,
      detail: `Rolou ${diceCount}d6: [${r.dice.join(', ')}] -> Mínimo: ${r.lowest}${rowTitle}`,
      roll: {
        total: r.lowest,
        formula: `${diceCount}d6`,
        isCrit: false,
      },
      tags: [props.pending.kind === 'structure' ? 'Estrutura' : 'Superaquecimento'],
    })
  }

  async function rollSave(path: string) {
    const acc = saveAcc[path] || 0
    const bonus = Number(saveBonus[path]) || 0

    let d20Val: number | undefined
    let accVals: number[] = []

    try {
      const rollRes = await dddiceService.rollDice({
        diceString: '1d20',
        flatBonus: bonus,
        accuracy: acc,
        label: `Structure Save [${props.cc?.CombatName || 'Mech'}]`,
        external_id: props.cc?.CombatName || undefined,
      })

      if (rollRes && rollRes.values && rollRes.values.length > 0) {
        const foundD20 = rollRes.values.find(v => v.type === 'd20' || v.type === '20')
        if (foundD20) d20Val = Number(foundD20.value)
        accVals = rollRes.values
          .filter(v => (v.type === 'd6' || v.type === '6') && !v.is_dropped)
          .map(v => Number(v.value))
      }
    } catch (e) {
      console.warn('[StructureCheck] Erro ao rolar save no dddice, usando fallback:', e)
    }

    let totalVal = 0
    if (d20Val !== undefined) {
      let accVal = 0
      if (accVals.length > 0) {
        accVal = Math.max(...accVals) * (acc > 0 ? 1 : -1)
      }
      totalVal = d20Val + bonus + accVal
      saveRolls[path] = { detail: `${d20Val} + ${bonus}${accVal !== 0 ? ` + (${accVal})` : ''} = ${totalVal}` }
      saveChoices[path] = totalVal >= 10 ? 'success' : 'fail'
    } else {
      const r = DiceRoller.rollSkillCheck(bonus, acc)
      totalVal = r.total
      saveRolls[path] = { detail: r.toString() }
      saveChoices[path] = r.total >= 10 ? 'success' : 'fail'
    }

    const actorName = props.cc?.CombatName || 'Mech'
    const isSuccess = saveChoices[path] === 'success'
    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'roll',
      title: `Salvaguarda de Emergência (${props.pending.kind === 'structure' ? 'Estrutura' : 'Superaquecimento'})`,
      detail: saveRolls[path]?.detail || String(totalVal),
      roll: {
        total: Number(totalVal) || 0,
        formula: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
        isCrit: false,
        accuracy: acc,
      },
      tags: ['Salvaguarda', isSuccess ? 'Sucesso' : 'Falha'],
    })
  }

  function reset() {
    result.value = null
    effects.value = []
    rolls.value = {}
    clearChoices()
  }

  function onToggle(v: boolean) {
    if (!v) reset()
  }

  function apply() {
    if (!resolution.value.complete) return
    withLogGroup(() => {
      if (result.value)
        recordCheckRoll(
          props.cc,
          props.pending.kind,
          result.value,
          marked.value,
          resolution.value.actions
        )
      applyCheckEffects(props.cc, resolution.value.actions)
    })
    props.cc.RemovePendingCheck(props.pending.id)
    emit('resolved')
    open.value = false
  }
</script>
