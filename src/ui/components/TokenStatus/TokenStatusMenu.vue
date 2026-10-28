<template>
  <div class="lancer-status-menu">
    <!-- Cabeçalho de Seleção -->
    <div class="menu-header">
      <div class="token-info">
        <div class="d-flex align-center ga-1">
          <span class="token-badge">{{ tokenCountLabel }}</span>
          <span
            v-if="selectedTokens.length > 0"
            class="sync-badge"
            :class="hasBoundSheet ? 'is-bound' : 'is-unbound'"
          >
            {{ hasBoundSheet ? t('active.tokenStatus.boundToSheet') : t('active.tokenStatus.unboundToken') }}
          </span>
        </div>
        <span class="token-names" :title="tokenNames">{{ tokenNames }}</span>
      </div>
      <div class="header-actions">
        <button
          v-if="hasAnyStatus"
          class="btn-clear"
          :title="t('active.tokenStatus.clearAllTooltip')"
          @click="handleClearAll"
        >
          {{ t('active.tokenStatus.clearAll') }}
        </button>
      </div>
    </div>

    <!-- Aviso caso nenhum token esteja selecionado -->
    <div v-if="selectedTokens.length === 0" class="empty-selection">
      <div class="empty-title">{{ t('active.tokenStatus.noTokensTitle') }}</div>
      <p class="empty-desc">
        {{ t('active.tokenStatus.noTokensHint') }}
      </p>
    </div>

    <template v-else>
      <!-- Busca Rápida -->
      <div class="search-bar">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('active.tokenStatus.searchPlaceholder')"
          class="search-input"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
      </div>

      <!-- Abas de Categoria -->
      <div v-if="!searchQuery" class="category-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'condition' }"
          @click="activeTab = 'condition'"
        >
          {{ t('active.tokenStatus.tabConditions') }}
          <span v-if="activeCountByCategory('condition') > 0" class="tab-count">
            {{ activeCountByCategory('condition') }}
          </span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'state' }"
          @click="activeTab = 'state'"
        >
          {{ t('active.tokenStatus.tabStates') }}
          <span v-if="activeCountByCategory('state') > 0" class="tab-count">
            {{ activeCountByCategory('state') }}
          </span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'extras' }"
          @click="activeTab = 'extras'"
        >
          {{ t('active.tokenStatus.tabExtras') }}
          <span v-if="extrasCount > 0" class="tab-count">{{ extrasCount }}</span>
        </button>
      </div>

      <!-- Conteúdo Principal -->
      <div class="menu-body">
        <!-- Seção de Cobertura, Queimadura e Customizados (aba Extras) -->
        <template v-if="activeTab === 'extras' && !searchQuery">
          <div class="section-block">
            <div class="section-label">{{ t('active.tokenStatus.coverTitle') }}</div>
            <div class="cover-grid">
              <button
                class="cover-btn"
                :class="{ active: currentCover === 'none' }"
                @click="handleSetCover('none')"
              >
                <span>{{ t('active.tokenStatus.coverNone') }}</span>
              </button>
              <button
                v-for="cov in COVER_DEFINITIONS"
                :key="cov.id"
                class="cover-btn"
                :class="{ active: currentCover === cov.id }"
                :style="currentCover === cov.id ? { borderColor: cov.accentColor } : {}"
                @click="handleSetCover(cov.id as 'softcover' | 'hardcover')"
              >
                <img :src="getIconUrl(cov.id)" class="status-icon-sm" :alt="cov.label" />
                <span>{{ cov.label }}</span>
              </button>
            </div>
          </div>

          <!-- Queimadura (QMD) -->
          <div class="section-block">
            <div class="section-label">{{ t('active.tokenStatus.burnTitle') }}</div>
            <div class="burn-row">
              <div class="d-flex align-center ga-2">
                <img :src="getIconUrl('burn')" class="status-icon-sm" alt="Burn" />
                <span class="burn-value">{{ currentBurnAmount }}</span>
              </div>
              <div class="d-flex align-center ga-1">
                <button class="btn-step" :disabled="currentBurnAmount <= 0" @click="adjustBurn(-1)">
                  -
                </button>
                <button class="btn-step" @click="adjustBurn(1)">+</button>
                <button
                  v-if="currentBurnAmount > 0"
                  class="btn-clear-sm"
                  @click="setBurnAmount(0)"
                >
                  {{ t('active.tokenStatus.burnClear') }}
                </button>
              </div>
            </div>
          </div>

          <div class="section-block">
            <div class="section-label">{{ t('active.tokenStatus.specialTitle') }}</div>
            <div class="status-grid">
              <button
                v-for="st in specialStatuses"
                :key="st.id"
                class="status-card"
                :class="{ active: isStatusActive(st.id) }"
                :style="isStatusActive(st.id) ? { borderColor: st.accentColor } : {}"
                @click="handleToggleStatus(st.id)"
              >
                <img :src="getIconUrl(st.id)" class="status-icon" :alt="st.label" />
                <div class="status-text">
                  <span class="status-label">{{ st.label }}</span>
                  <span class="status-sub">{{ st.originalName }}</span>
                </div>
              </button>
            </div>
          </div>

          <div class="section-block">
            <div class="section-label">{{ t('active.tokenStatus.customTitle') }}</div>
            <form class="custom-form" @submit.prevent="handleAddCustom">
              <input
                v-model="customInput"
                type="text"
                :placeholder="t('active.tokenStatus.customPlaceholder')"
                maxlength="32"
                class="custom-input"
              />
              <button type="submit" class="btn-add" :disabled="!customInput.trim()">
                {{ t('active.tokenStatus.customAdd') }}
              </button>
            </form>

            <div v-if="activeCustomStatuses.length > 0" class="custom-pills">
              <div
                v-for="markerId in activeCustomStatuses"
                :key="markerId"
                class="custom-pill"
              >
                <img :src="getCustomStatusBadgeUrl()" class="status-icon-xs" alt="" />
                <span class="pill-name">{{ parseCustomStatusMarkerId(markerId) }}</span>
                <button
                  class="pill-remove"
                  title="Remover"
                  @click="handleToggleStatus(markerId)"
                >
                  ×
                </button>
              </div>
            </div>
            <div v-else class="empty-hint">{{ t('active.tokenStatus.customEmpty') }}</div>
          </div>
        </template>

        <!-- Grade de Condições / Estados / Busca -->
        <template v-else>
          <div class="status-grid">
            <button
              v-for="st in filteredStatuses"
              :key="st.id"
              class="status-card"
              :class="{ active: isStatusActive(st.id) }"
              :style="isStatusActive(st.id) ? { borderColor: st.accentColor } : {}"
              @click="handleToggleStatus(st.id)"
            >
              <img :src="getIconUrl(st.id)" class="status-icon" :alt="st.label" />
              <div class="status-text">
                <span class="status-label">{{ st.label }}</span>
                <span class="status-sub">{{ st.originalName }}</span>
              </div>
            </button>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  STATUS_DEFINITIONS,
  COVER_DEFINITIONS,
  getStatusImageUrl,
  getCustomStatusBadgeUrl,
  customStatusMarkerId,
  parseCustomStatusMarkerId,
  parseBurnMarkerId,
  burnStatusMarkerId,
  normalizeStatusId,
} from '@/services/statusIcons'
import { currentIconsConfig } from '@/services/statusIconConfig'
import { tokenStatusService } from '@/services/tokenStatusService'

const { t } = useI18n()

const activeTab = ref<'condition' | 'state' | 'extras'>('condition')
const searchQuery = ref('')
const customInput = ref('')

const selectedTokens = computed(() => tokenStatusService.selectedTokens.value)
const tokenIds = computed(() => selectedTokens.value.map(tk => tk.id))
const hasBoundSheet = computed(() => selectedTokens.value.some(tk => tk.isBoundToSheet))

const tokenCountLabel = computed(() => {
  const n = selectedTokens.value.length
  if (n === 0) return t('active.tokenStatus.noTokensTitle')
  return n === 1
    ? t('active.tokenStatus.selectedToken')
    : t('active.tokenStatus.selectedTokensCount', { count: n })
})

const tokenNames = computed(() => {
  if (selectedTokens.value.length === 0) return '—'
  return selectedTokens.value.map(tk => tk.name).join(', ')
})

const mergedStatuses = computed<string[]>(() => {
  const set = new Set<string>()
  for (const tk of selectedTokens.value) {
    for (const s of tk.statuses) {
      set.add(s)
    }
  }
  return Array.from(set)
})

const hasAnyStatus = computed(() => mergedStatuses.value.length > 0)

function isStatusActive(statusId: string): boolean {
  if (selectedTokens.value.length === 0) return false
  if (statusId === 'burn') {
    return selectedTokens.value.every(tk =>
      tk.statuses.some(s => normalizeStatusId(s) === 'burn' || parseBurnMarkerId(s) !== null)
    )
  }
  const target = parseCustomStatusMarkerId(statusId)
    ? statusId.trim()
    : normalizeStatusId(statusId) || statusId
  return selectedTokens.value.every(tk =>
    tk.statuses.some(
      s => (parseCustomStatusMarkerId(s) ? s.trim() : normalizeStatusId(s)) === target
    )
  )
}

const currentCover = computed<'none' | 'softcover' | 'hardcover'>(() => {
  if (isStatusActive('hardcover')) return 'hardcover'
  if (isStatusActive('softcover')) return 'softcover'
  return 'none'
})

const currentBurnAmount = computed<number>(() => {
  for (const tk of selectedTokens.value) {
    for (const s of tk.statuses) {
      const info = parseBurnMarkerId(s)
      if (info && info.amount > 0) return info.amount
      if (normalizeStatusId(s) === 'burn') return 1
    }
  }
  return 0
})

const specialStatuses = computed(() =>
  STATUS_DEFINITIONS.filter(d => d.category === 'special')
)

const activeCustomStatuses = computed(() =>
  mergedStatuses.value.filter(s => parseCustomStatusMarkerId(s) !== null)
)

function activeCountByCategory(cat: 'condition' | 'state'): number {
  return STATUS_DEFINITIONS.filter(d => d.category === cat && isStatusActive(d.id)).length
}

const extrasCount = computed(() => {
  let count = activeCustomStatuses.value.length
  if (currentCover.value !== 'none') count++
  if (currentBurnAmount.value > 0) count++
  for (const sp of specialStatuses.value) {
    if (isStatusActive(sp.id)) count++
  }
  return count
})

const filteredStatuses = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    return STATUS_DEFINITIONS.filter(
      d =>
        d.label.toLowerCase().includes(q) ||
        d.originalName.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.aliases.some(a => a.toLowerCase().includes(q))
    )
  }
  return STATUS_DEFINITIONS.filter(d => d.category === activeTab.value)
})

function getIconUrl(statusId: string): string {
  void currentIconsConfig.value
  return getStatusImageUrl(statusId)
}

async function handleToggleStatus(statusId: string) {
  if (!tokenIds.value.length) return
  if (statusId === 'burn') {
    const nextAmount = currentBurnAmount.value > 0 ? 0 : 1
    await setBurnAmount(nextAmount)
    return
  }
  await tokenStatusService.toggleTokenStatus(tokenIds.value, statusId)
}

async function handleSetCover(cover: 'none' | 'softcover' | 'hardcover') {
  if (!tokenIds.value.length) return
  const next = currentCover.value === cover ? 'none' : cover
  await tokenStatusService.setTokensCover(tokenIds.value, next)
}

async function setBurnAmount(amount: number) {
  if (!tokenIds.value.length) return
  const clamped = Math.max(0, Math.round(amount))
  for (const id of tokenIds.value) {
    const current = await tokenStatusService.getTokenStatuses(id)
    const withoutBurn = current.filter(
      s => normalizeStatusId(s) !== 'burn' && parseBurnMarkerId(s) === null
    )
    if (clamped > 0) {
      withoutBurn.push(burnStatusMarkerId(clamped))
    }
    await tokenStatusService.setTokensStatus([id], withoutBurn)
  }
}

async function adjustBurn(delta: number) {
  await setBurnAmount(currentBurnAmount.value + delta)
}

async function handleAddCustom() {
  const name = customInput.value.trim()
  if (!name || !tokenIds.value.length) return
  const markerId = customStatusMarkerId(name)
  customInput.value = ''
  await tokenStatusService.toggleTokenStatus(tokenIds.value, markerId)
}

async function handleClearAll() {
  if (!tokenIds.value.length) return
  await tokenStatusService.clearTokensStatus(tokenIds.value)
}
</script>

<style scoped>
.lancer-status-menu {
  display: flex;
  flex-direction: column;
  background: rgba(15, 18, 24, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #e4e8f0;
  overflow: hidden;
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #171b24;
  border-bottom: 1px solid #262c3a;
  gap: 8px;
}

.token-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.token-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #ff5252;
}

.sync-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  letter-spacing: 0.03em;
}

.sync-badge.is-bound {
  background: rgba(46, 125, 50, 0.22);
  color: #81c784;
  border: 1px solid rgba(129, 199, 132, 0.35);
}

.sync-badge.is-unbound {
  background: rgba(120, 144, 156, 0.18);
  color: #b0bec5;
  border: 1px solid rgba(176, 190, 197, 0.25);
}

.token-names {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-clear {
  background: rgba(211, 47, 47, 0.18);
  border: 1px solid rgba(255, 82, 82, 0.4);
  color: #ff8a80;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-clear:hover {
  background: rgba(211, 47, 47, 0.35);
}

.empty-selection {
  padding: 20px 16px;
  text-align: center;
}

.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 12px;
  color: #9aa5b8;
  line-height: 1.45;
  margin: 0;
}

.search-bar {
  position: relative;
  padding: 8px 12px 4px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  background: #171b24;
  border: 1px solid #2b3242;
  border-radius: 6px;
  padding: 6px 26px 6px 10px;
  color: #ffffff;
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: #ff5252;
}

.search-clear {
  position: absolute;
  right: 18px;
  top: 12px;
  background: none;
  border: none;
  color: #8c96a8;
  font-size: 15px;
  cursor: pointer;
}

.category-tabs {
  display: flex;
  padding: 6px 12px 0;
  gap: 4px;
  border-bottom: 1px solid #262c3a;
}

.tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #9aa5b8;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tab-btn.active {
  color: #ffffff;
  border-bottom-color: #ff5252;
}

.tab-count {
  background: #ff5252;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
}

.menu-body {
  padding: 10px 12px;
  max-height: 360px;
  overflow-y: auto;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #171b24;
  border: 1.5px solid #252b3b;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
  color: #e4e8f0;
}

.status-card:hover {
  background: #1e2430;
  border-color: #384157;
}

.status-card.active {
  background: rgba(255, 82, 82, 0.12);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
}

.status-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.status-icon-sm {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.status-icon-xs {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.status-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.status-label {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-sub {
  font-size: 10px;
  color: #8892a6;
  line-height: 1.15;
}

.section-block {
  margin-bottom: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9aa5b8;
  margin-bottom: 6px;
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.cover-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: #171b24;
  border: 1.5px solid #252b3b;
  border-radius: 6px;
  padding: 8px 4px;
  color: #e4e8f0;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.cover-btn.active {
  background: rgba(255, 255, 255, 0.08);
  border-color: #ff5252;
  color: #ffffff;
}

.burn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #171b24;
  border: 1px solid #252b3b;
  border-radius: 6px;
  padding: 6px 10px;
}

.burn-value {
  font-size: 14px;
  font-weight: 700;
  color: #ffb74d;
}

.btn-step {
  background: #252b3b;
  border: 1px solid #384157;
  color: #ffffff;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
}

.btn-step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-clear-sm {
  background: rgba(211, 47, 47, 0.2);
  border: 1px solid rgba(255, 82, 82, 0.35);
  color: #ff8a80;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.custom-form {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.custom-input {
  flex: 1;
  background: #171b24;
  border: 1px solid #2b3242;
  border-radius: 6px;
  padding: 6px 8px;
  color: #ffffff;
  font-size: 12px;
  outline: none;
}

.custom-input:focus {
  border-color: #7c4dff;
}

.btn-add {
  background: #7c4dff;
  border: none;
  border-radius: 6px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  padding: 0 10px;
  cursor: pointer;
}

.btn-add:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.custom-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.custom-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(124, 77, 255, 0.16);
  border: 1px solid rgba(179, 136, 255, 0.4);
  border-radius: 14px;
  padding: 3px 8px;
  font-size: 11px;
  color: #ffffff;
}

.pill-remove {
  background: none;
  border: none;
  color: #b388ff;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
}

.empty-hint {
  font-size: 11px;
  color: #70798c;
  font-style: italic;
}
</style>

