<template>
  <!-- Accuracy & Difficulty Grid -->
  <div class="hud-section mb-3">
    <v-row no-gutters>
      <!-- Accuracy Column -->
      <v-col
        cols="12"
        sm="6"
        class="border-e-sm border-panel-border pa-2"
      >
        <div class="column-header text-success d-flex align-center ga-1 mb-2">
          <v-icon
            icon="mdi-plus-circle"
            size="18"
          />
          <span>{{ $t('hud.accuracy') }}</span>
        </div>
        <v-checkbox
          v-model="accMods.accurate"
          density="compact"
          hide-details
          :label="$t('hud.accurateMod')"
          color="success"
        />
        <v-checkbox
          v-model="accMods.smart"
          density="compact"
          hide-details
          :label="$t('hud.smartMod')"
          color="success"
        />
        <v-checkbox
          v-model="accMods.seeking"
          density="compact"
          hide-details
          :label="$t('hud.seekingMod')"
          color="success"
        />
        <v-checkbox
          v-model="accMods.lockOn"
          density="compact"
          hide-details
          :label="$t('hud.lockOnMod')"
          color="success"
        />
      </v-col>

      <!-- Difficulty Column -->
      <v-col
        cols="12"
        sm="6"
        class="pa-2"
      >
        <div class="column-header text-error d-flex align-center ga-1 mb-2">
          <v-icon
            icon="mdi-minus-circle"
            size="18"
          />
          <span>{{ $t('hud.difficulty') }}</span>
        </div>
        <v-checkbox
          v-model="diffMods.inaccurate"
          density="compact"
          hide-details
          :label="$t('hud.inaccurateMod')"
          color="error"
        />
        <v-checkbox
          v-model="diffMods.impaired"
          density="compact"
          hide-details
          :label="$t('hud.impairedMod')"
          color="error"
        />
        <v-checkbox
          v-model="diffMods.engaged"
          density="compact"
          hide-details
          :label="$t('hud.engagedMod')"
          color="error"
        />
        <v-checkbox
          v-model="diffMods.lightCover"
          density="compact"
          hide-details
          :label="$t('hud.lightCoverMod')"
          color="error"
        />
        <v-checkbox
          v-model="diffMods.heavyCover"
          density="compact"
          hide-details
          :label="$t('hud.heavyCoverMod')"
          color="error"
        />
        <v-checkbox
          v-model="diffMods.bracedTarget"
          density="compact"
          hide-details
          label="Alvo Suportando (+1 Dif)"
          color="teal"
        />
      </v-col>
    </v-row>
  </div>

  <!-- Manual Adjust + Total Badge -->
  <manual-adjust-badge
    v-model="manualAdjust"
    :net-acc-diff="netAccDiff"
  />
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch } from 'vue'
  import ManualAdjustBadge from './ManualAdjustBadge.vue'

  interface AccMods {
    accurate: boolean
    smart: boolean
    seeking: boolean
    lockOn: boolean
  }

  interface DiffMods {
    inaccurate: boolean
    impaired: boolean
    engaged: boolean
    lightCover: boolean
    heavyCover: boolean
    bracedTarget: boolean
  }

  interface TalentModifier {
    acc: number
    diff: number
  }

  const props = defineProps<{
    initialAccMods?: Partial<AccMods>
    initialDiffMods?: Partial<DiffMods>
    talentModifiers?: TalentModifier[]
  }>()

  const accMods = reactive<AccMods>({
    accurate: false,
    smart: false,
    seeking: false,
    lockOn: false,
  })

  const diffMods = reactive<DiffMods>({
    inaccurate: false,
    impaired: false,
    engaged: false,
    lightCover: false,
    heavyCover: false,
    bracedTarget: false,
  })

  const manualAdjust = ref(0)

  // Quando o pai atualiza as props iniciais (ex: ao abrir o modal), sincroniza os estados
  watch(
    () => props.initialAccMods,
    (val) => { if (val) Object.assign(accMods, val) },
    { immediate: true }
  )
  watch(
    () => props.initialDiffMods,
    (val) => { if (val) Object.assign(diffMods, val) },
    { immediate: true }
  )

  const netAccDiff = computed(() => {
    let acc = 0
    let diff = 0

    if (accMods.accurate) acc += 1
    if (accMods.lockOn) acc += 1
    if (diffMods.inaccurate) diff += 1
    if (diffMods.impaired) diff += 1
    if (diffMods.engaged) diff += 1
    if (diffMods.lightCover) diff += 1
    if (diffMods.heavyCover) diff += 2
    if (diffMods.bracedTarget) diff += 1

    acc += manualAdjust.value > 0 ? manualAdjust.value : 0
    diff += manualAdjust.value < 0 ? Math.abs(manualAdjust.value) : 0

    for (const t of (props.talentModifiers ?? [])) {
      acc += t.acc
      diff += t.diff
    }

    return acc - diff
  })

  function reset() {
    manualAdjust.value = 0
    Object.assign(accMods, { accurate: false, smart: false, seeking: false, lockOn: false })
    Object.assign(diffMods, { inaccurate: false, impaired: false, engaged: false, lightCover: false, heavyCover: false })
  }

  defineExpose({ netAccDiff, accMods, diffMods, manualAdjust, reset })
</script>

<style scoped>
  .hud-section {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
  }
  .column-header {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
</style>
