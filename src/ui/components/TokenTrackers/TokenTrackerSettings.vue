<template>
  <v-card variant="outlined" class="rounded-0 border-grey-darken-3">
    <v-card-title class="text-caption font-weight-bold text-uppercase d-flex align-center ga-2 py-2">
      <v-icon icon="mdi-tune-variant" size="16" />
      {{ t('active.tokenTrackers.settingsTitle') }}
    </v-card-title>

    <v-card-text class="pt-0 d-flex flex-column ga-2">
      <v-switch
        :model-value="config.enabled"
        :label="t('active.tokenTrackers.enabled')"
        color="accent"
        density="compact"
        hide-details
        :disabled="disabled"
        @update:model-value="patch({ enabled: !!$event })"
      />

      <v-switch
        :model-value="config.invertSquares"
        :label="t('active.tokenTrackers.invertSquares')"
        color="accent"
        density="compact"
        hide-details
        :disabled="disabled || !config.enabled"
        @update:model-value="patch({ invertSquares: !!$event })"
      />

      <v-switch
        :model-value="config.showBlindagemWhenZero"
        :label="t('active.tokenTrackers.showBlindagemWhenZero')"
        color="accent"
        density="compact"
        hide-details
        :disabled="disabled || !config.enabled"
        @update:model-value="patch({ showBlindagemWhenZero: !!$event })"
      />

      <div class="d-flex align-center ga-2">
        <span class="text-caption text-grey-lighten-1">{{ t('active.tokenTrackers.maxSquares') }}</span>
        <v-text-field
          :model-value="config.maxSquares"
          type="number"
          min="1"
          max="40"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 90px"
          :disabled="disabled || !config.enabled"
          @update:model-value="patch({ maxSquares: Number($event) || 1 })"
        />
      </div>

      <div class="d-flex align-center ga-2">
        <span class="text-caption text-grey-lighten-1">{{ t('active.tokenTrackers.panelGap') }}</span>
        <v-text-field
          :model-value="config.panelGap"
          type="number"
          min="-30"
          max="30"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 90px"
          :disabled="disabled || !config.enabled"
          @update:model-value="patch({ panelGap: Number($event) || 0 })"
        />
      </div>
      <div class="text-caption text-grey-lighten-1" style="font-size: 11px">
        {{ t('active.tokenTrackers.panelGapHint') }}
      </div>

      <div class="text-caption text-grey-lighten-1 mt-1">
        {{ t('active.tokenTrackers.slotsLabel') }}
      </div>
      <div class="d-flex flex-wrap ga-1">
        <v-chip
          v-for="slot in slots"
          :key="slot.id"
          size="small"
          :color="isSlotEnabled(slot.id) ? 'accent' : 'default'"
          :variant="isSlotEnabled(slot.id) ? 'flat' : 'outlined'"
          :class="{ 'text-black': isSlotEnabled(slot.id) }"
          :disabled="disabled || !config.enabled"
          @click="toggleSlot(slot.id)"
        >
          {{ t(slot.labelKey) }}
        </v-chip>
      </div>

      <v-divider class="my-1" />

      <div class="text-caption font-weight-bold text-uppercase">
        {{ t('active.tokenTrackers.visibilityLabel') }}
      </div>
      <div class="text-caption text-grey-lighten-1" style="font-size: 11px">
        {{ t('active.tokenTrackers.visibilityHint') }}
      </div>
      <div class="d-flex flex-wrap ga-1">
        <v-chip
          size="small"
          :color="config.playerVisibility.allies ? 'accent' : 'default'"
          :variant="config.playerVisibility.allies ? 'flat' : 'outlined'"
          :class="{ 'text-black': config.playerVisibility.allies }"
          :disabled="disabled"
          @click="patchVisibility('allies')"
        >
          <v-icon start icon="mdi-account-group-outline" size="14" />
          {{ t('active.tokenTrackers.allies') }}
        </v-chip>
        <v-chip
          size="small"
          :color="config.playerVisibility.enemies ? 'error' : 'default'"
          :variant="config.playerVisibility.enemies ? 'flat' : 'outlined'"
          :class="{ 'text-black': config.playerVisibility.enemies }"
          :disabled="disabled"
          @click="patchVisibility('enemies')"
        >
          <v-icon start icon="mdi-skull-outline" size="14" />
          {{ t('active.tokenTrackers.enemies') }}
        </v-chip>
        <v-chip
          size="small"
          :color="config.playerVisibility.neutral ? 'accent' : 'default'"
          :variant="config.playerVisibility.neutral ? 'flat' : 'outlined'"
          :class="{ 'text-black': config.playerVisibility.neutral }"
          :disabled="disabled"
          @click="patchVisibility('neutral')"
        >
          <v-icon start icon="mdi-cube-outline" size="14" />
          {{ t('active.tokenTrackers.neutral') }}
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  LANCER_TOKEN_TRACKER_SLOTS,
  type TokenTrackerConfig,
  type TokenTrackerSlotId,
} from '@/types/token-tracker'

/**
 * Config dos trackers da SALA (GM). Presentational: quem grava é o painel.
 */

const props = defineProps<{
  config: TokenTrackerConfig
  disabled?: boolean
}>()

const emit = defineEmits<{ update: [config: TokenTrackerConfig] }>()

const { t } = useI18n()

const slots = LANCER_TOKEN_TRACKER_SLOTS

function isSlotEnabled(slot: TokenTrackerSlotId): boolean {
  return props.config.slots[slot] !== false
}

function patch(changes: Partial<TokenTrackerConfig>): void {
  emit('update', { ...props.config, ...changes })
}

function toggleSlot(slot: TokenTrackerSlotId): void {
  patch({ slots: { ...props.config.slots, [slot]: !isSlotEnabled(slot) } })
}

function patchVisibility(key: 'allies' | 'enemies' | 'neutral'): void {
  emit('update', {
    ...props.config,
    playerVisibility: {
      ...props.config.playerVisibility,
      [key]: !props.config.playerVisibility[key],
    },
  })
}
</script>
