<template>
  <div class="hud-section mb-3">
    <div class="section-label">{{ $t('hud.flatModifier') }}</div>
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 pa-2">
      <div class="d-flex align-center ga-1 text-body-2">
        <span class="text-disabled">{{ label || $t('hud.grit') }}:</span>
        <b class="text-accent">+{{ gritBonus }}</b>
      </div>

      <div class="d-flex align-center ga-1">
        <span class="text-caption text-disabled mr-1">{{ $t('hud.manualAdjust') }}:</span>
        <v-btn
          icon
          size="x-small"
          variant="tonal"
          color="primary"
          :aria-label="$t('hud.decreaseFlatBonus')"
          @click="flatAdjust--"
        >
          <v-icon icon="mdi-minus" />
        </v-btn>
        <span class="px-2 font-weight-bold font-mono">
          {{ flatAdjust >= 0 ? `+${flatAdjust}` : flatAdjust }}
        </span>
        <v-btn
          icon
          size="x-small"
          variant="tonal"
          color="primary"
          :aria-label="$t('hud.increaseFlatBonus')"
          @click="flatAdjust++"
        >
          <v-icon icon="mdi-plus" />
        </v-btn>
      </div>

      <div class="text-body-2 font-weight-bold">
        <span class="text-disabled">{{ $t('hud.total') }}:</span>
        <span class="text-primary ml-1">+{{ total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      gritBonus: number
      label?: string
    }>(),
    {
      label: undefined,
    }
  )

  const flatAdjust = ref(0)

  const total = computed(() => props.gritBonus + flatAdjust.value)

  defineExpose({ flatAdjust, total })
</script>

<style scoped>
  .hud-section {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
  }
  .section-label {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
  }
  .font-mono {
    font-family: monospace;
  }
</style>
