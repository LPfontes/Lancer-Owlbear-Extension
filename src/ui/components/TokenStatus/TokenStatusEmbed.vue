1<template>
  <div class="token-status-embed pa-3 d-flex flex-column ga-2">
    <!-- Estado: Nenhum token selecionado -->
    <div v-if="!selectedTokenId" class="text-center py-6 text-grey-lighten-1">
      <v-icon icon="mdi-cursor-default-click" size="36" class="mb-2 text-disabled" />
      <div class="text-body-2">{{ t('active.tokenStatus.noSelection') }}</div>
    </div>

    <!-- Estado: Token selecionado -->
    <template v-else>
      <!-- Cabeçalho -->
      <div class="d-flex align-center justify-space-between pb-1 border-b border-opacity-25">
        <div class="d-flex flex-column overflow-hidden mr-2">
          <div class="text-subtitle-2 text-truncate font-weight-bold">
            {{ tokenName || 'Token' }}
          </div>
          <div class="text-caption text-grey">
            <span v-if="hasTokenOverride" class="text-accent font-weight-medium">
              <v-icon icon="mdi-check-decagram" size="14" class="mr-1" />
              {{ t('active.tokenStatus.tokenPriorityActive') }}
            </span>
            <span v-else-if="isBoundToSheet" class="text-info">
              <v-icon icon="mdi-link-variant" size="14" class="mr-1" />
              {{ t('active.tokenStatus.mirroringSheet') }}
            </span>
            <span v-else class="text-disabled">
              <v-icon icon="mdi-cube-outline" size="14" class="mr-1" />
              {{ t('active.tokenStatus.independentToken') }}
            </span>
          </div>
        </div>

        <div class="d-flex ga-1">
          <v-btn
            v-if="hasTokenOverride"
            size="x-small"
            variant="text"
            color="error"
            :title="t('active.tokenStatus.clearOverridesHint')"
            @click="clearOverrides"
          >
            <v-icon icon="mdi-restore" size="16" class="mr-1" />
            {{ t('active.tokenStatus.clearOverrides') }}
          </v-btn>
        </div>
      </div>

      <!-- Abas de Navegação -->
      <v-tabs
        v-model="activeTab"
        density="compact"
        color="primary"
        align-tabs="center"
        grow
      >
        <v-tab value="conditions" class="text-caption">
          {{ t('active.tokenStatus.conditions') }}
          <v-badge
            v-if="activeConditionsCount > 0"
            color="primary"
            :content="activeConditionsCount"
            inline
            class="ml-1"
          />
        </v-tab>
        <v-tab value="states" class="text-caption">
          {{ t('active.tokenStatus.states') }}
          <v-badge
            v-if="activeStatesCount > 0"
            color="primary"
            :content="activeStatesCount"
            inline
            class="ml-1"
          />
        </v-tab>
        <v-tab value="extras" class="text-caption">
          Extras
          <v-badge
            v-if="activeExtrasCount > 0"
            color="primary"
            :content="activeExtrasCount"
            inline
            class="ml-1"
          />
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- Aba: Condições -->
        <v-window-item value="conditions">
          <div class="status-grid pt-2">
            <button
              v-for="cond in conditions"
              :key="cond.id"
              class="status-btn"
              :class="{ active: isStatusActive(cond.id) }"
              :style="statusBtnStyle(cond, isStatusActive(cond.id))"
              @click="toggleStatus(cond.id)"
            >
              <img :src="`/status-icons/${cond.id}.svg`" class="status-icon" alt="" />
              <span class="status-label">{{ cond.label }}</span>
            </button>
          </div>
        </v-window-item>

        <!-- Aba: Estados -->
        <v-window-item value="states">
          <div class="status-grid pt-2">
            <button
              v-for="st in states"
              :key="st.id"
              class="status-btn"
              :class="{ active: isStatusActive(st.id) }"
              :style="statusBtnStyle(st, isStatusActive(st.id))"
              @click="toggleStatus(st.id)"
            >
              <img :src="`/status-icons/${st.id}.svg`" class="status-icon" alt="" />
              <span class="status-label">{{ st.label }}</span>
            </button>
          </div>
        </v-window-item>

        <!-- Aba: Extras (Cobertura + Personalizados) -->
        <v-window-item value="extras">
          <div class="d-flex flex-column ga-3 pt-2">
            <!-- Cobertura -->
            <div class="status-section">
              <div class="section-title text-disabled">{{ t('active.tokenStatus.cover') }}</div>
              <div class="d-flex ga-2">
                <v-btn
                  size="small"
                  class="flex-1-1"
                  :variant="currentCover === 'none' ? 'tonal' : 'outlined'"
                  :color="currentCover === 'none' ? 'primary' : undefined"
                  @click="setCover('none')"
                >
                  {{ t('active.tokenStatus.coverNone') }}
                </v-btn>
                <v-btn
                  size="small"
                  class="flex-1-1"
                  :variant="currentCover === 'soft' ? 'flat' : 'outlined'"
                  color="success"
                  prepend-icon="mdi-shield-half-full"
                  @click="setCover('soft')"
                >
                  {{ t('active.tokenStatus.coverSoft') }}
                </v-btn>
                <v-btn
                  size="small"
                  class="flex-1-1"
                  :variant="currentCover === 'hard' ? 'flat' : 'outlined'"
                  color="error"
                  prepend-icon="mdi-shield"
                  @click="setCover('hard')"
                >
                  {{ t('active.tokenStatus.coverHard') }}
                </v-btn>
              </div>
            </div>

            <!-- Status Personalizados -->
            <div class="status-section">
              <div class="section-title text-disabled">{{ t('active.tokenStatus.customStatuses') }}</div>

              <div v-if="activeCustomStatuses.length > 0" class="d-flex flex-wrap ga-1 mb-2">
                <v-chip
                  v-for="customId in activeCustomStatuses"
                  :key="customId"
                  size="small"
                  closable
                  color="secondary"
                  variant="tonal"
                  @click:close="toggleStatus(customId)"
                >
                  <v-icon icon="mdi-star-four-points-circle-outline" size="14" class="mr-1" />
                  {{ getCustomName(customId) }}
                </v-chip>
              </div>

              <div class="d-flex ga-2 align-center">
                <v-text-field
                  v-model="customInput"
                  :placeholder="t('active.tokenStatus.customPlaceholder')"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="flex-grow-1"
                  @keydown.enter="addCustom"
                />
                <v-btn
                  size="small"
                  color="secondary"
                  variant="flat"
                  :disabled="!customInput.trim()"
                  @click="addCustom"
                >
                  <v-icon icon="mdi-plus" size="18" />
                  {{ t('active.tokenStatus.addCustom') }}
                </v-btn>
              </div>
            </div>
          </div>
        </v-window-item>
      </v-window>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import OBR, { type Item } from '@owlbear-rodeo/sdk'
import { obrBridge } from '@/services/obrBridge'
import {
  STATUS_DEFINITIONS,
  customStatusMarkerId,
  parseCustomStatusMarkerId,
  type StatusDefinition,
} from '@/services/statusIcons'
import {
  toggleTokenStatus,
  setTokenCover,
  resolveEffectiveStatuses,
  type TokenDirectStatusPayload,
} from '@/services/tokenStatusModel'
import { COMPCON_METADATA_KEY } from '@/types/compcon-obr'

const { t } = useI18n()

const selectedTokenId = ref<string | null>(null)
const tokenName = ref<string>('')
const isBoundToSheet = ref<boolean>(false)
const directPayload = ref<TokenDirectStatusPayload | null>(null)
const sheetStatuses = ref<string[]>([])
const customInput = ref<string>('')

let unsubscribeSelection: (() => void) | null = null
let unsubscribeItems: (() => void) | null = null

// Agrupamento dos 16 status
const CONDITION_IDS = ['lockon', 'impaired', 'slow', 'immobilized', 'jammed', 'shredded', 'stunned']
const STATE_IDS = [
  'engaged',
  'hidden',
  'invisible',
  'prone',
  'shutdown',
  'exposed',
  'dangerzone',
  'downandout',
  'intangible',
]

const conditions = computed(() =>
  STATUS_DEFINITIONS.filter(def => CONDITION_IDS.includes(def.id))
)

const states = computed(() =>
  STATUS_DEFINITIONS.filter(def => STATE_IDS.includes(def.id))
)

const hasTokenOverride = computed(() => directPayload.value !== null)

const effectiveStatuses = computed(() =>
  resolveEffectiveStatuses(directPayload.value, sheetStatuses.value)
)

const activeCustomStatuses = computed(() =>
  effectiveStatuses.value.filter(id => parseCustomStatusMarkerId(id) !== null)
)

const currentCover = computed<'none' | 'soft' | 'hard'>(() => {
  if (effectiveStatuses.value.includes('hardcover')) return 'hard'
  if (effectiveStatuses.value.includes('softcover')) return 'soft'
  return 'none'
})

const activeTab = ref<'conditions' | 'states' | 'extras'>('conditions')

const activeConditionsCount = computed(() =>
  conditions.value.filter(c => effectiveStatuses.value.includes(c.id)).length
)

const activeStatesCount = computed(() =>
  states.value.filter(s => effectiveStatuses.value.includes(s.id)).length
)

const activeExtrasCount = computed(() => {
  let count = activeCustomStatuses.value.length
  if (currentCover.value !== 'none') count++
  return count
})

function isStatusActive(statusId: string): boolean {
  return effectiveStatuses.value.includes(statusId)
}

function getCustomName(markerId: string): string {
  return parseCustomStatusMarkerId(markerId) || markerId
}

function statusBtnStyle(def: StatusDefinition, active: boolean) {
  if (!active) return {}
  return {
    borderColor: def.accentColor,
    backgroundColor: `${def.color}33`,
    boxShadow: `0 0 6px ${def.accentColor}55`,
  }
}

async function refreshTokenData(tokenId: string) {
  if (!OBR.isAvailable) return
  selectedTokenId.value = tokenId

  try {
    const items = await OBR.scene.items.getItems([tokenId])
    if (!items.length) {
      selectedTokenId.value = null
      return
    }
    const item = items[0]
    tokenName.value = item.name || 'Token'

    // Vínculo com ficha
    const meta = item.metadata[COMPCON_METADATA_KEY] as any
    isBoundToSheet.value = !!(meta && meta.sheetId)

    // Status direto
    directPayload.value = await obrBridge.getTokenDirectStatuses(tokenId)

    // Status da ficha (se vinculado)
    if (isBoundToSheet.value) {
      const binding = await obrBridge.getTokenBinding(tokenId)
      sheetStatuses.value = binding?.statuses || []
    } else {
      sheetStatuses.value = []
    }
  } catch (err) {
    console.warn('[TokenStatusEmbed] Erro ao carregar dados do token:', err)
  }
}

async function toggleStatus(statusId: string) {
  if (!selectedTokenId.value) return
  const current = effectiveStatuses.value
  const next = toggleTokenStatus(current, statusId)
  await obrBridge.setTokenDirectStatuses(selectedTokenId.value, next)
  await refreshTokenData(selectedTokenId.value)
}

async function setCover(cover: 'none' | 'soft' | 'hard') {
  if (!selectedTokenId.value) return
  const current = effectiveStatuses.value
  const next = setTokenCover(current, cover)
  await obrBridge.setTokenDirectStatuses(selectedTokenId.value, next)
  await refreshTokenData(selectedTokenId.value)
}

async function addCustom() {
  if (!selectedTokenId.value || !customInput.value.trim()) return
  const markerId = customStatusMarkerId(customInput.value.trim())
  customInput.value = ''
  await toggleStatus(markerId)
}

async function clearOverrides() {
  if (!selectedTokenId.value) return
  await obrBridge.clearTokenDirectStatuses(selectedTokenId.value)
  await refreshTokenData(selectedTokenId.value)
}

onMounted(async () => {
  if (!OBR.isAvailable) return

  OBR.onReady(async () => {
    // 1. Obtém seleção inicial
    const selection = await OBR.player.getSelection()
    if (selection && selection.length > 0) {
      await refreshTokenData(selection[0])
    }

    // 2. Monitora mudanças de seleção no mapa
    unsubscribeSelection = OBR.player.onChange(async player => {
      if (player.selection && player.selection.length > 0) {
        if (player.selection[0] !== selectedTokenId.value) {
          await refreshTokenData(player.selection[0])
        }
      } else {
        selectedTokenId.value = null
      }
    })

    // 3. Monitora mudanças nos itens da cena
    unsubscribeItems = OBR.scene.items.onChange(async items => {
      if (!selectedTokenId.value) return
      const current = items.find(i => i.id === selectedTokenId.value)
      if (current) {
        tokenName.value = current.name || 'Token'
        directPayload.value = await obrBridge.getTokenDirectStatuses(selectedTokenId.value)
      }
    })
  })
})

onUnmounted(() => {
  if (unsubscribeSelection) unsubscribeSelection()
  if (unsubscribeItems) unsubscribeItems()
})
</script>

<style scoped>
.token-status-embed {
  background-color: #12141a;
  color: #e0e0e0;
  max-width: 360px;
  font-family: inherit;
  user-select: none;
}

.section-title {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.status-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background-color: #1a1e27;
  border: 1px solid #2a3140;
  border-radius: 4px;
  color: #c0c6d0;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.status-btn:hover {
  background-color: #242b38;
  border-color: #404b60;
  color: #ffffff;
}

.status-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.status-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
