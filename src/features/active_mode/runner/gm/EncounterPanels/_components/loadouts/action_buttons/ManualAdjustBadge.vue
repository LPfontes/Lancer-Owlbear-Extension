<template>
  <!-- Manual Adjust -->
  <div class="hud-section d-flex align-center justify-center ga-3 pa-2 mb-3">
    <v-btn
      icon
      size="small"
      variant="outlined"
      color="error"
      :title="$t('hud.addGlobalDifficulty')"
      @click="decrement"
    >
      <v-icon icon="mdi-minus" />
    </v-btn>

    <div class="text-center px-3">
      <div class="text-caption text-disabled">{{ $t('hud.manualAdjust') }}</div>
      <div
        class="text-h6 font-weight-bold"
        :class="modelValue > 0 ? 'text-success' : modelValue < 0 ? 'text-error' : ''"
      >
        {{ modelValue > 0 ? `+${modelValue}` : modelValue }}
        <span class="text-caption font-weight-regular text-disabled">
          {{ modelValue > 0 ? $t('hud.accuracy') : modelValue < 0 ? $t('hud.difficulty') : '' }}
        </span>
      </div>
    </div>

    <v-btn
      icon
      size="small"
      variant="outlined"
      color="success"
      :title="$t('hud.addGlobalAccuracy')"
      @click="increment"
    >
      <v-icon icon="mdi-plus" />
    </v-btn>
  </div>

  <!-- Total Accuracy / Difficulty Badge -->
  <div class="total-badge-box text-center pa-2 mb-2">
    <div
      class="text-h5 font-weight-bold"
      :class="netAccDiff > 0 ? 'text-success' : netAccDiff < 0 ? 'text-error' : 'text-text'"
    >
      <v-icon
        :icon="netAccDiff > 0 ? 'mdi-plus-circle-outline' : netAccDiff < 0 ? 'mdi-minus-circle-outline' : 'mdi-circle-outline'"
        class="mr-1"
      />
      {{ netAccDiff > 0
        ? `+${netAccDiff} ${$t('hud.accuracy')}`
        : netAccDiff < 0
          ? `${Math.abs(netAccDiff)} ${$t('hud.difficulty')}`
          : `0 (${$t('hud.neutral')})` }}
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    /** Valor atual do ajuste manual (v-model) */
    modelValue: number
    /** Resultado líquido acc/diff calculado pelo pai */
    netAccDiff: number
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: number): void
  }>()

  function increment() {
    emit('update:modelValue', props.modelValue + 1)
  }

  function decrement() {
    emit('update:modelValue', props.modelValue - 1)
  }
</script>

<style scoped>
  .hud-section {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
  }
  .total-badge-box {
    border: 1px solid rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
    border-radius: 4px;
  }
</style>
