<template>
  <div class="token-trackers-panel d-flex flex-column ga-3 pa-3">
    <!-- Sub-navegação entre Trackers de Atributos, Estados & Condições e Ícones de Status -->
    <div class="d-flex align-center ga-1 panel-subtabs">
      <v-btn
        size="small"
        :variant="activeSection === 'statuses' ? 'flat' : 'tonal'"
        :color="activeSection === 'statuses' ? 'error' : 'grey-darken-3'"
        prepend-icon="mdi-shield-alert-outline"
        class="flex-1-1 text-caption font-weight-bold"
        @click="activeSection = 'statuses'"
      >
        {{ t('active.tokenStatus.sectionStatuses') }}
      </v-btn>
      <v-btn
        size="small"
        :variant="activeSection === 'trackers' ? 'flat' : 'tonal'"
        :color="activeSection === 'trackers' ? 'primary' : 'grey-darken-3'"
        prepend-icon="mdi-radar"
        class="flex-1-1 text-caption font-weight-bold"
        @click="activeSection = 'trackers'"
      >
        {{ t('active.tokenStatus.sectionTrackers') }}
      </v-btn>
      <v-btn
        size="small"
        :variant="activeSection === 'icons' ? 'flat' : 'tonal'"
        :color="activeSection === 'icons' ? 'deep-purple-accent-2' : 'grey-darken-3'"
        prepend-icon="mdi-palette-outline"
        class="flex-1-1 text-caption font-weight-bold"
        @click="activeSection = 'icons'"
      >
        {{ t('active.tokenStatus.sectionIcons') }}
      </v-btn>
    </div>

    <template v-if="activeSection === 'statuses'">
      <TokenStatusMenu />
    </template>

    <template v-else-if="activeSection === 'icons'">
      <TokenStatusSettings />
    </template>

    <template v-else>
      <div v-if="!isGm" class="text-caption text-grey-lighten-1">
        {{ t('active.tokenTrackers.playerHint') }}
      </div>

      <TokenTrackerSettings v-if="isGm" :config="config" :disabled="saving" @update="saveConfig" />

      <TokenTrackerList
        :tokens="tokens"
        :is-gm="isGm"
        :hidden-combatant-ids="config.playerVisibility.hiddenCombatantIds"
        @toggle-token="toggleToken"
        @toggle-hidden="toggleHidden"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TokenTrackerSettings from './TokenTrackerSettings.vue'
import TokenTrackerList from './TokenTrackerList.vue'
import TokenStatusMenu from '@/ui/components/TokenStatus/TokenStatusMenu.vue'
import TokenStatusSettings from '@/ui/components/TokenStatus/TokenStatusSettings.vue'
import { obrBridge } from '@/services/obrBridge'
import { tokenTrackerService, type TokenTrackerTokenDescription } from '@/services/tokenTrackerService'
import { addToWatchlist, removeFromWatchlist } from '@/services/tokenTrackerWatchlist'
import { DEFAULT_TOKEN_TRACKER_CONFIG, type TokenTrackerConfig } from '@/types/token-tracker'
import { isGmClient, obrReady } from '@/services/obrRuntime'

/**
 * Painel de gestão dos token trackers e Estados/Condições LANCER nativo.
 */

const { t } = useI18n()

const activeSection = ref<'trackers' | 'statuses' | 'icons'>('statuses')
const isGm = computed(() => isGmClient())
const config = ref<TokenTrackerConfig>({ ...DEFAULT_TOKEN_TRACKER_CONFIG })
const tokens = ref<TokenTrackerTokenDescription[]>([])
const saving = ref(false)

async function loadConfig(): Promise<void> {
  config.value = await obrBridge.getRoomTokenTrackerConfig()
}

async function loadTokens(): Promise<void> {
  tokens.value = await tokenTrackerService.describeTokens()
}

async function saveConfig(next: TokenTrackerConfig): Promise<void> {
  config.value = next
  saving.value = true
  try {
    await obrBridge.saveRoomTokenTrackerConfig(next)
    await tokenTrackerService.refreshAll()
    await loadTokens()
  } finally {
    saving.value = false
  }
}

/** Liga/desliga o acompanhamento deste token NESTA janela (watchlist local). */
async function toggleToken(tokenId: string): Promise<void> {
  const entry = tokens.value.find(item => item.tokenId === tokenId)
  const current = tokenTrackerService.getPrefs()
  const next = entry?.tracked
    ? removeFromWatchlist(current, tokenId)
    : addToWatchlist(current, tokenId)
  await tokenTrackerService.setPrefs(next)
}

/** Oculta/mostra o combatente para os jogadores (Fog of War do GM). */
async function toggleHidden(tokenId: string): Promise<void> {
  if (!isGm.value) return
  const combatantId = tokens.value.find(item => item.tokenId === tokenId)?.binding.combatantId
  if (!combatantId) return

  const hidden = new Set(config.value.playerVisibility.hiddenCombatantIds)
  if (hidden.has(combatantId)) hidden.delete(combatantId)
  else hidden.add(combatantId)

  await saveConfig({
    ...config.value,
    playerVisibility: {
      ...config.value.playerVisibility,
      hiddenCombatantIds: [...hidden],
    },
  })
}

const stopVersion = watch(
  () => tokenTrackerService.version.value,
  () => {
    void loadTokens()
  }
)

const stopReady = watch(
  obrReady,
  async ready => {
    if (!ready) return
    await loadConfig()
    await loadTokens()
  },
  { immediate: true }
)

onUnmounted(() => {
  stopVersion()
  stopReady()
})
</script>
