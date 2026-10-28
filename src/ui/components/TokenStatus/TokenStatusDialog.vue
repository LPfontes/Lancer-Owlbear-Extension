<template>
  <v-dialog
    v-model="dialogOpen"
    max-width="440"
    scrim="rgba(0, 0, 0, 0.55)"
  >
    <v-card class="token-status-dialog-card">
      <div class="dialog-toolbar">
        <div class="d-flex align-center ga-2">
          <v-icon size="18" color="error">mdi-shield-alert-outline</v-icon>
          <span class="dialog-title">{{ t('active.tokenStatus.title') }}</span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-btn
            icon
            size="x-small"
            variant="text"
            :color="showSettings ? 'error' : 'grey-lighten-1'"
            :title="t('active.tokenStatus.settingsTitle')"
            @click="showSettings = !showSettings"
          >
            <v-icon size="18">mdi-cog-outline</v-icon>
          </v-btn>
          <v-btn
            icon
            size="x-small"
            variant="text"
            color="grey-lighten-1"
            :title="t('active.tokenStatus.close')"
            @click="dialogOpen = false"
          >
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
      </div>

      <TokenStatusSettings v-if="showSettings" />
      <TokenStatusMenu v-else />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import TokenStatusMenu from './TokenStatusMenu.vue'
import TokenStatusSettings from './TokenStatusSettings.vue'
import { tokenStatusService } from '@/services/tokenStatusService'

const { t } = useI18n()
const showSettings = ref(false)

const dialogOpen = computed({
  get: () => tokenStatusService.statusDialogOpen.value,
  set: (val: boolean) => {
    tokenStatusService.statusDialogOpen.value = val
    if (!val) showSettings.value = false
  },
})

function onRequested() {
  showSettings.value = false
  tokenStatusService.statusDialogOpen.value = true
}

onMounted(() => {
  window.addEventListener('compcon-token-status-requested', onRequested)
})

onUnmounted(() => {
  window.removeEventListener('compcon-token-status-requested', onRequested)
})
</script>

<style scoped>
.token-status-dialog-card {
  background: #0f1218 !important;
  border: 1px solid #262c3a;
  border-radius: 10px !important;
  overflow: hidden;
}

.dialog-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #141821;
  border-bottom: 1px solid #262c3a;
}

.dialog-title {
  font-size: 13px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.03em;
}
</style>

