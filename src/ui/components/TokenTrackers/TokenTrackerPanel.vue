<template>
  <div class="token-trackers-panel d-flex flex-column ga-3 pa-3">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TokenTrackerSettings from './TokenTrackerSettings.vue'
import TokenTrackerList from './TokenTrackerList.vue'
import { obrBridge } from '@/services/obrBridge'
import { tokenTrackerService, type TokenTrackerTokenDescription } from '@/services/tokenTrackerService'
import { addToWatchlist, removeFromWatchlist } from '@/services/tokenTrackerWatchlist'
import { DEFAULT_TOKEN_TRACKER_CONFIG, type TokenTrackerConfig } from '@/types/token-tracker'
import { isGmClient, obrReady } from '@/services/obrRuntime'

/**
 * Painel de gestão dos token trackers (plano §7.3/§7.4/§7.5).
 *
 * Duas responsabilidades:
 * - GM: ajustar o que é desenhado e o que os jogadores podem ver (config da SALA);
 * - qualquer um: escolher quais tokens acompanhar nesta janela (watchlist LOCAL).
 */

const { t } = useI18n()

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
    // O serviço relê a config pelo `onMetadataChange`; forçamos um refresh aqui
    // para o efeito ser imediato nesta janela.
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

// O serviço avisa quando algum estado mudou (refresh concluído, preferências).
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
