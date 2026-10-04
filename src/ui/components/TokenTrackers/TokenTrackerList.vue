<template>
  <v-card variant="outlined" class="rounded-0 border-grey-darken-3">
    <v-card-title class="text-caption font-weight-bold text-uppercase d-flex align-center ga-2 py-2">
      <v-icon icon="mdi-format-list-bulleted" size="16" />
      {{ t('active.tokenTrackers.listTitle') }}
      <v-chip size="x-small" color="grey-darken-2" class="ml-auto">{{ tokens.length }}</v-chip>
    </v-card-title>

    <v-card-text class="pt-0">
      <div v-if="!tokens.length" class="text-caption text-grey-lighten-1 py-2">
        {{ t('active.tokenTrackers.noTokens') }}
      </div>

      <div v-else class="d-flex flex-column ga-1">
        <div
          v-for="token in sortedTokens"
          :key="token.tokenId"
          class="d-flex align-center ga-2 py-1 px-1 rounded-0 token-row"
        >
          <v-checkbox-btn
            :model-value="token.tracked"
            color="accent"
            density="compact"
            hide-details
            :title="t('active.tokenTrackers.watchHint')"
            @update:model-value="emit('toggle-token', token.tokenId)"
          />

          <div class="flex-grow-1 text-truncate">
            <div class="text-caption text-truncate">{{ token.name }}</div>
            <div class="d-flex align-center ga-1">
              <v-chip :color="sideColor(token.side)" size="x-small" variant="flat" class="text-black">
                {{ t(sideLabelKey(token.side)) }}
              </v-chip>
              <v-chip :color="statusColor(token)" size="x-small" variant="outlined">
                {{ t(statusLabelKey(token)) }}
              </v-chip>
            </div>
          </div>

          <v-btn
            v-if="isGm && token.binding.combatantId"
            icon
            variant="text"
            size="x-small"
            :color="isHidden(token) ? 'error' : 'grey-lighten-1'"
            :title="isHidden(token) ? t('active.tokenTrackers.showToPlayers') : t('active.tokenTrackers.hideFromPlayers')"
            @click="emit('toggle-hidden', token.tokenId)"
          >
            <v-icon :icon="isHidden(token) ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="16" />
          </v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TokenTrackerTokenDescription } from '@/services/tokenTrackerService'
import type { TokenTrackerSide } from '@/types/token-tracker'

/**
 * Lista multi-token (plano §7.4): quais tokens ESTA janela acompanha, com o lado
 * e o motivo de (não) aparecer no mapa. Presentational: quem age é o painel.
 */

const props = defineProps<{
  tokens: TokenTrackerTokenDescription[]
  isGm: boolean
  hiddenCombatantIds: string[]
}>()

const emit = defineEmits<{
  'toggle-token': [tokenId: string]
  'toggle-hidden': [tokenId: string]
}>()

const { t } = useI18n()

/** Os acompanhados primeiro; depois, alfabético. */
const sortedTokens = computed(() =>
  [...props.tokens].sort((a, b) => {
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1
    return a.name.localeCompare(b.name)
  })
)

function isHidden(token: TokenTrackerTokenDescription): boolean {
  const combatantId = token.binding.combatantId
  if (combatantId && props.hiddenCombatantIds.includes(combatantId)) return true
  return token.hiddenForPlayers
}

function sideLabelKey(side: TokenTrackerSide | 'unknown'): string {
  switch (side) {
    case 'ally':
      return 'active.tokenTrackers.sideAlly'
    case 'enemy':
      return 'active.tokenTrackers.sideEnemy'
    case 'neutral':
      return 'active.tokenTrackers.sideNeutral'
    default:
      return 'active.tokenTrackers.sideUnknown'
  }
}

function sideColor(side: TokenTrackerSide | 'unknown'): string {
  switch (side) {
    case 'ally':
      return 'accent'
    case 'enemy':
      return 'error'
    case 'neutral':
      return 'grey-darken-1'
    default:
      return 'grey-darken-3'
  }
}

/** Traduz o motivo devolvido pelo serviço (é ele que decide o desenho). */
function statusLabelKey(token: TokenTrackerTokenDescription): string {
  if (token.reason === 'hidden-from-players') return 'active.tokenTrackers.statusHidden'
  if (token.reason === 'side-blocked') return 'active.tokenTrackers.statusBlocked'
  if (token.reason === 'no-data') return 'active.tokenTrackers.statusNoData'
  if (token.reason === 'not-tracked') return 'active.tokenTrackers.statusNotTracked'
  if (token.reason === 'disabled') return 'active.tokenTrackers.statusDisabled'
  return token.localValues
    ? 'active.tokenTrackers.statusLocal'
    : 'active.tokenTrackers.statusFromToken'
}

function statusColor(token: TokenTrackerTokenDescription): string {
  return token.reason === 'ok' ? 'accent' : 'grey-darken-2'
}
</script>

<style scoped>
.token-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
</style>
