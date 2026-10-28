<template>
  <div class="settings-panel">
    <div class="settings-header">
      <div class="header-left">
        <span class="settings-title">{{ t('active.tokenStatus.settingsTitle') }}</span>
      </div>
      <button
        v-if="hasCustomUrls"
        class="btn-reset-all"
        @click="handleResetAll"
      >
        {{ t('active.tokenStatus.restoreAllUrls') }}
      </button>
    </div>

    <div class="settings-body">
      <p class="settings-desc">
        {{ t('active.tokenStatus.settingsHint') }}
      </p>

      <!-- Layout e Escala na Cena -->
      <div class="layout-config">
        <div class="config-row">
          <span class="config-label">{{ t('active.tokenStatus.badgePlacement') }}</span>
          <div class="segmented-group">
            <button
              class="seg-btn"
              :class="{ active: currentPlacement === 'right' }"
              @click="updateLayout({ placement: 'right' })"
            >
              {{ t('active.tokenStatus.placementRight') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentPlacement === 'left' }"
              @click="updateLayout({ placement: 'left' })"
            >
              {{ t('active.tokenStatus.placementLeft') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentPlacement === 'bottom' }"
              @click="updateLayout({ placement: 'bottom' })"
            >
              {{ t('active.tokenStatus.placementBottom') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentPlacement === 'top' }"
              @click="updateLayout({ placement: 'top' })"
            >
              {{ t('active.tokenStatus.placementTop') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentPlacement === 'center' }"
              @click="updateLayout({ placement: 'center' })"
            >
              {{ t('active.tokenStatus.placementCenter') }}
            </button>
          </div>
        </div>

        <div class="config-row">
          <span class="config-label">{{ t('active.tokenStatus.badgeScale') }}</span>
          <div class="segmented-group">
            <button
              class="seg-btn"
              :class="{ active: currentScale === 0.20 }"
              @click="updateLayout({ badgeScale: 0.20 })"
            >
              {{ t('active.tokenStatus.scaleSmall') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentScale === 0.28 }"
              @click="updateLayout({ badgeScale: 0.28 })"
            >
              {{ t('active.tokenStatus.scaleMedium') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentScale === 0.38 }"
              @click="updateLayout({ badgeScale: 0.38 })"
            >
              {{ t('active.tokenStatus.scaleLarge') }}
            </button>
          </div>
        </div>

        <div class="config-row">
          <span class="config-label">{{ t('active.tokenStatus.overlayScale') }}</span>
          <div class="segmented-group">
            <button
              class="seg-btn"
              :class="{ active: currentOverlayScale <= 1.05 }"
              @click="updateLayout({ overlayScale: 1.0 })"
            >
              100%
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentOverlayScale > 1.05 && currentOverlayScale < 1.25 }"
              @click="updateLayout({ overlayScale: 1.15 })"
            >
              115%
            </button>
            <button
              class="seg-btn"
              :class="{ active: currentOverlayScale >= 1.25 }"
              @click="updateLayout({ overlayScale: 1.35 })"
            >
              135%
            </button>
          </div>
        </div>
      </div>

      <div class="icons-list">
        <div v-for="st in STATUS_DEFINITIONS" :key="st.id" class="icon-row">
          <img :src="getPreviewUrl(st.id)" class="icon-preview" :alt="st.label" />
          <div class="icon-meta">
            <div class="icon-title">
              <span class="icon-name">{{ st.label }}</span>
              <span class="icon-orig">{{ st.originalName }}</span>
            </div>
            <div class="icon-input-group">
              <input
                :value="draftUrls[st.id] ?? ''"
                type="url"
                :placeholder="t('active.tokenStatus.customUrlPlaceholder')"
                class="url-input"
                @input="onInput(st.id, ($event.target as HTMLInputElement).value)"
                @change="handleSaveUrl(st.id)"
              />
              <button
                class="btn-center-url"
                :class="{ active: isCentered(st.id) }"
                :title="t('active.tokenStatus.centerOnTokenTooltip')"
                @click="handleToggleCentered(st.id)"
              >
                🎯
              </button>
              <button
                v-if="draftUrls[st.id]"
                class="btn-clear-url"
                :title="t('active.tokenStatus.restoreDefaultTooltip')"
                @click="handleResetUrl(st.id)"
              >
                ↺
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { STATUS_DEFINITIONS, getStatusImageUrl } from '@/services/statusIcons'
import {
  currentIconsConfig,
  setCustomStatusUrl,
  setStatusCentered,
  resetCustomStatusUrl,
  resetAllCustomUrls,
  saveRoomIconsConfig,
  type BadgePlacement,
} from '@/services/statusIconConfig'
import { tokenStatusService } from '@/services/tokenStatusService'

const { t } = useI18n()

const draftUrls = reactive<Record<string, string>>({})

watch(
  () => currentIconsConfig.value.customUrls,
  urls => {
    for (const st of STATUS_DEFINITIONS) {
      draftUrls[st.id] = urls?.[st.id] || ''
    }
  },
  { immediate: true, deep: true }
)

const hasCustomUrls = computed(() => {
  return (
    Object.keys(currentIconsConfig.value.customUrls || {}).length > 0 ||
    Object.keys(currentIconsConfig.value.centeredStatuses || {}).length > 0
  )
})

const currentPlacement = computed<BadgePlacement>(
  () => currentIconsConfig.value.placement || 'right'
)
const currentScale = computed(() => currentIconsConfig.value.badgeScale || 0.28)
const currentOverlayScale = computed(() => currentIconsConfig.value.overlayScale || 1.15)

function isCentered(statusId: string): boolean {
  if (currentIconsConfig.value.placement === 'center') return true
  return Boolean(currentIconsConfig.value.centeredStatuses?.[statusId])
}

async function updateLayout(partial: {
  placement?: BadgePlacement
  badgeScale?: number
  overlayScale?: number
}) {
  await saveRoomIconsConfig({
    ...currentIconsConfig.value,
    ...partial,
  })
  await tokenStatusService.reconcileAllSceneTokens()
}

async function handleToggleCentered(statusId: string) {
  const current = Boolean(currentIconsConfig.value.centeredStatuses?.[statusId])
  await setStatusCentered(statusId, !current)
  await tokenStatusService.reconcileAllSceneTokens()
}

function getPreviewUrl(statusId: string): string {
  void currentIconsConfig.value
  return getStatusImageUrl(statusId)
}

function onInput(statusId: string, val: string) {
  draftUrls[statusId] = val
}

async function handleSaveUrl(statusId: string) {
  const val = (draftUrls[statusId] || '').trim()
  await setCustomStatusUrl(statusId, val)
  await tokenStatusService.reconcileAllSceneTokens()
}

async function handleResetUrl(statusId: string) {
  draftUrls[statusId] = ''
  await resetCustomStatusUrl(statusId)
  await tokenStatusService.reconcileAllSceneTokens()
}

async function handleResetAll() {
  for (const st of STATUS_DEFINITIONS) {
    draftUrls[st.id] = ''
  }
  await resetAllCustomUrls()
  await tokenStatusService.reconcileAllSceneTokens()
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  background: rgba(15, 18, 24, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #e4e8f0;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #171b24;
  border-bottom: 1px solid #262c3a;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-title {
  font-size: 13px;
  font-weight: 700;
  color: #ffffff;
}

.btn-reset-all {
  background: rgba(211, 47, 47, 0.18);
  border: 1px solid rgba(255, 82, 82, 0.4);
  color: #ff8a80;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.settings-body {
  padding: 10px 12px;
  max-height: 400px;
  overflow-y: auto;
}

.settings-desc {
  font-size: 11px;
  color: #9aa5b8;
  line-height: 1.4;
  margin: 0 0 10px;
}

.layout-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #171b24;
  border: 1px solid #252b3b;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.config-label {
  font-size: 11px;
  font-weight: 600;
  color: #cbd3e1;
}

.segmented-group {
  display: flex;
  background: #0f1218;
  border: 1px solid #2b3242;
  border-radius: 5px;
  overflow: hidden;
}

.seg-btn {
  background: transparent;
  border: none;
  color: #8c96a8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
}

.seg-btn.active {
  background: #ff5252;
  color: #ffffff;
}

.icons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.icon-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #171b24;
  border: 1px solid #252b3b;
  border-radius: 6px;
  padding: 8px;
}

.icon-preview {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.icon-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icon-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.icon-name {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
}

.icon-orig {
  font-size: 10px;
  color: #8892a6;
}

.icon-input-group {
  display: flex;
  gap: 4px;
}

.url-input {
  flex: 1;
  min-width: 0;
  background: #0f1218;
  border: 1px solid #2b3242;
  border-radius: 4px;
  padding: 5px 7px;
  color: #ffffff;
  font-size: 11px;
  outline: none;
}

.url-input:focus {
  border-color: #ff5252;
}

.btn-center-url {
  background: #0f1218;
  border: 1px solid #2b3242;
  color: #9aa5b8;
  border-radius: 4px;
  padding: 0 7px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.55;
  transition: all 0.15s;
}

.btn-center-url:hover {
  opacity: 0.9;
  border-color: #f2cc60;
}

.btn-center-url.active {
  opacity: 1;
  background: rgba(242, 204, 96, 0.18);
  border-color: #f2cc60;
  box-shadow: 0 0 6px rgba(242, 204, 96, 0.35);
}

.btn-clear-url {
  background: #252b3b;
  border: 1px solid #384157;
  color: #e4e8f0;
  border-radius: 4px;
  padding: 0 7px;
  cursor: pointer;
  font-size: 13px;
}
</style>
