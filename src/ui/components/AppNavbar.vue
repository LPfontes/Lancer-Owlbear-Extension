<template>
  <!-- Cyberpunk / Sci-Fi Top Navbar -->
  <v-app-bar
    app
    flat
    density="comfortable"
    class="app-navbar border-b"
    style="z-index: 1000;"
  >
    <div class="navbar-glow-line" />

    <!-- Minimized HUD Mode (Ultra-compact 48px floating bar) -->
    <v-container
      v-if="windowManager.isMinimized.value"
      fluid
      class="d-flex align-center py-0 px-1 justify-space-between fill-height"
      style="user-select: none;"
    >
      <div class="d-flex align-center ga-1">
        <v-avatar size="24" color="primary" class="rounded-0">
          <v-icon icon="cc:lancer" size="16" color="white" />
        </v-avatar>
        <span class="minimized-brand-text text-caption font-weight-bold text-accent text-uppercase text-truncate" style="letter-spacing: 1px; max-width: 160px;">
          {{ activePilotSheet ? (activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name) : (activeEncounter ? activeEncounter.Encounter.Name : 'COMP/CON') }}
        </span>
        <v-chip
          v-if="activePilotSheet && activePilotSheet.Combatant.actor.ActiveMech"
          size="x-small"
          color="accent"
          variant="tonal"
          class="minimized-brand-text font-weight-bold text-truncate"
          style="max-width: 120px;"
        >
          {{ activePilotSheet.Combatant.actor.ActiveMech.Name }}
        </v-chip>

        <!-- Indicador visual de rolagem ativa -->
        <v-chip
          v-if="dddiceService.isRolling.value"
          size="x-small"
          color="accent"
          variant="flat"
          class="minimized-brand-text font-weight-bold text-black ml-1"
        >
          <v-icon icon="mdi-dice-multiple" size="14" class="mr-1" />
          Rolando...
        </v-chip>
      </div>

      <div class="d-flex align-center ga-1 no-drag">
        <!-- Real-time Table Sync Status (Minimized) -->
        <v-btn
          icon
          variant="text"
          size="x-small"
          :color="syncStatusColor"
          :title="syncStatusTooltip"
          @click="reconnectSync"
        >
          <v-icon :icon="syncStatusIcon" size="14" :class="{ 'sync-pulsing': tableSyncStatus === 'reconnecting' || tableSyncStatus === 'connecting' }" />
        </v-btn>

        <!-- Ações da Mesa e Chat (Minimized) -->
        <v-btn
          icon
          variant="text"
          size="x-small"
          :color="isRouteActive('/table-chat') ? 'accent' : 'grey-lighten-1'"
          :title="`Ações da Mesa e Chat (${tableActionStore.unreadCount} novas)`"
          @click="handleToggleChat"
        >
          <v-badge
            v-if="tableActionStore.unreadCount > 0"
            :content="tableActionStore.unreadCount"
            color="accent"
            floating
          >
            <v-icon icon="mdi-message-text-clock-outline" size="14" />
          </v-badge>
          <v-icon v-else icon="mdi-message-text-clock-outline" size="14" />
        </v-btn>


        <!-- Restore Window -->
        <v-btn
          icon="mdi-window-maximize"
          variant="text"
          size="x-small"
          color="accent"
          :title="$t('ow.restoreWindow')"
          @click="windowManager.reopenWindow()"
        />
      </div>
    </v-container>

    <!-- Normal Desktop / Mobile Navbar Mode -->
    <v-container
      v-else
      fluid
      class="d-flex align-center py-0 px-2 px-sm-4"
      style="max-width: 1600px;"
    >
      <!-- Mobile Hamburger Menu Button -->
      <v-btn
        v-if="mobile"
        icon="mdi-menu"
        variant="text"
        color="accent"
        size="small"
        class="mr-2"
        @click="drawer = !drawer"
      />

      <!-- Back Button (Shown when not on Home) -->
      <v-btn
        v-if="!isHome"
        icon="mdi-arrow-left"
        variant="text"
        color="grey-lighten-1"
        size="small"
        class="mr-2"
        :title="$t('ow.back')"
        @click="goBack"
      />


      <!-- Desktop Navigation Links -->
      <div v-if="!mobile" class="d-flex align-center ga-1 ga-md-2">
        <v-btn
          to="/active-mode"
          variant="text"
          :class="isRouteActive('/active-mode', true) ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="mdi-home"
        >
          {{ $t('ow.home') }}
        </v-btn>

        <v-btn
          to="/new/no_group"
          variant="text"
          :class="isRouteActive('/new') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="mdi-account-plus"
        >
          {{ $t('ow.createPilot') }}
        </v-btn>

        <v-btn
          to="/pilot_management"
          variant="text"
          :class="isRouteActive('/pilot_management') || isRouteActive('/pilot/') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="cc:pilot"
        >
          {{ $t('ow.hangar') }}
        </v-btn>

        <v-btn
          to="/active-mode/sheet-manager"
          variant="text"
          :class="isRouteActive('/active-mode/sheet-manager') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="mdi-card-account-details-outline"
        >
          {{ $t('ow.activeMode') }}
          <v-badge
            v-if="activeSheetsCount > 0"
            :content="activeSheetsCount"
            color="accent"
            inline
            class="ml-1"
          />
        </v-btn>


        <v-btn
          to="/active-mode/npcs"
          variant="text"
          :class="isRouteActive('/active-mode/npcs') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="cc:npc"
        >
          {{ $t('ow.npcs') }}
          <v-badge
            v-if="npcsCount > 0"
            :content="npcsCount"
            color="secondary"
            inline
            class="ml-1"
          />
        </v-btn>

        <v-btn
          to="/table-chat"
          variant="text"
          :class="isRouteActive('/table-chat') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="mdi-message-text-clock-outline"
        >
          {{ $t('ow.chatAndActions') }}
          <v-badge
            v-if="tableActionStore.unreadCount > 0"
            :content="tableActionStore.unreadCount"
            color="accent"
            inline
            class="ml-1"
          />
        </v-btn>
      </div>

      <v-spacer />

      <!-- Active Sessions Shortcuts (Resume Pilot or GM) -->
      <div v-if="!mobile" class="d-flex align-center ga-2 mr-2">
        <v-chip
          v-if="activePilotSheet"
          :color="isOnActivePilotSheet ? 'accent' : 'warning'"
          :variant="isOnActivePilotSheet ? 'outlined' : 'flat'"
          size="small"
          class="cursor-pointer font-weight-bold resume-chip"
          :prepend-icon="isOnActivePilotSheet ? 'mdi-account' : 'mdi-play-circle-outline'"
          :title="isOnActivePilotSheet ? 'Ficha Ativa' : 'Voltar para a Ficha Ativa (Em combate)'"
          @click="resumePilot"
        >
          <span class="text-truncate" style="max-width: 140px;">
            {{ isOnActivePilotSheet ? (activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name) : `Retomar: ${activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name}` }}
          </span>
        </v-chip>

        <v-chip
          v-if="activeEncounter"
          :color="isOnActiveEncounter ? 'primary' : 'warning'"
          :variant="isOnActiveEncounter ? 'outlined' : 'flat'"
          size="small"
          class="cursor-pointer font-weight-bold resume-chip"
          prepend-icon="cc:encounter"
          :title="isOnActiveEncounter ? 'Encontro Ativo' : 'Voltar para o Encontro Ativo'"
          @click="resumeEncounter"
        >
          <span class="text-truncate" style="max-width: 140px;">
            {{ isOnActiveEncounter ? activeEncounter.Encounter.Name : `Retomar: ${activeEncounter.Encounter.Name}` }}
          </span>
        </v-chip>
      </div>

      <!-- Real-time WebSocket Sync Status Button -->
      <v-btn
        icon
        variant="text"
        :color="syncStatusColor"
        size="small"
        class="nav-btn rounded-0 mr-1"
        :title="syncStatusTooltip"
        @click="reconnectSync"
      >
        <v-icon :icon="syncStatusIcon" size="20" :class="{ 'sync-pulsing': tableSyncStatus === 'reconnecting' || tableSyncStatus === 'connecting' }" />
      </v-btn>

      <!-- 3D Dice (dddice) Shortcut Button -->
      <v-btn
        icon="mdi-dice-multiple"
        variant="text"
        :color="dddiceService.config.enabled ? 'accent' : 'grey-lighten-2'"
        size="small"
        class="nav-btn rounded-0 mr-1"
        :title="`Dados 3D (dddice): ${dddiceService.config.enabled ? 'Ativo' : 'Desativado'}`"
        @click="openOptions('dddice')"
      />

      <!-- Table Actions & Chat Window Button -->
      <v-btn
        icon
        variant="text"
        :color="isRouteActive('/table-chat') ? 'accent' : 'grey-lighten-2'"
        size="small"
        class="nav-btn rounded-0 mr-1"
        :title="`Ações da Mesa e Chat (${tableActionStore.unreadCount} novas)`"
        @click="handleToggleChat"
      >
        <v-badge
          v-if="tableActionStore.unreadCount > 0"
          :content="tableActionStore.unreadCount"
          color="accent"
          floating
        >
          <v-icon icon="mdi-message-text-clock-outline" />
        </v-badge>
        <v-icon v-else icon="mdi-message-text-clock-outline" />
      </v-btn>

      <!-- Options Button -->
      <v-btn
        variant="text"
        color="grey-lighten-2"
        class="nav-btn font-weight-bold rounded-0 mr-1"
        prepend-icon="mdi-cog"
        @click="openOptions('lcps')"
      >
        <span v-if="!mobile">{{ $t('ow.options') }}</span>
      </v-btn>


      <!-- Window Control Cluster (Minimize) -->
      <div class="window-controls d-flex align-center border-l border-grey-darken-3 pl-2 ga-1">
        <!-- Reload Extension Window -->
        <v-btn
          icon="mdi-reload"
          variant="text"
          size="small"
          color="grey-lighten-2"
          :title="$t('ow.reloadWindow')"
          @click="askReloadWindow"
        />

        <!-- Minimize Window -->
        <v-btn
          icon="mdi-window-minimize"
          variant="text"
          size="small"
          color="grey-lighten-2"
          :title="$t('ow.minimizeCompactBar')"
          @click="windowManager.minimize()"
        />
      </div>
    </v-container>
  </v-app-bar>

  <!-- Mobile Drawer -->
  <v-navigation-drawer
    v-if="mobile"
    v-model="drawer"
    temporary
    location="left"
    class="bg-grey-darken-4 border-r border-grey-darken-3"
  >
    <div class="pa-4 border-b border-grey-darken-3 d-flex align-center">
      <v-avatar size="32" color="primary" class="mr-2 rounded-0">
        <v-icon icon="cc:lancer" size="20" color="white" />
      </v-avatar>
      <div>
        <div class="heading h4 text-white text-uppercase" style="letter-spacing: 2px;">
          Active<span class="text-accent">Mode</span>
        </div>
        <div class="text-caption text-grey text-uppercase" style="font-size: 0.6rem !important;">
          {{ $t('ow.mainMenuTitle') }}
        </div>
      </div>
    </div>

    <v-list density="comfortable" nav class="pa-2">
      <!-- Ficha Ativa no Drawer Mobile -->
      <v-list-item
        v-if="activePilotSheet"
        prepend-icon="mdi-card-account-details-star"
        :title="activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name"
        subtitle="Ficha Ativa (Retomar)"
        class="my-1 rounded-0 bg-accent text-black font-weight-bold"
        @click="drawer = false; resumePilot()"
      />

      <!-- Encontro Ativo no Drawer Mobile -->
      <v-list-item
        v-if="activeEncounter"
        prepend-icon="cc:encounter"
        :title="activeEncounter.Encounter.Name"
        subtitle="Encontro Ativo (Retomar)"
        class="my-1 rounded-0 bg-primary text-white font-weight-bold"
        @click="drawer = false; resumeEncounter()"
      />

      <v-list-item
        to="/active-mode"
        prepend-icon="mdi-home"
        :title="$t('ow.home')"
        class="my-1 rounded-0"
        :active="isRouteActive('/active-mode', true)"
        color="accent"
        @click="drawer = false"
      />

      <v-list-item
        to="/new/no_group"
        prepend-icon="mdi-account-plus"
        :title="$t('ow.createPilot')"
        class="my-1 rounded-0 text-accent font-weight-bold"
        :active="isRouteActive('/new')"
        color="accent"
        @click="drawer = false"
      />

      <v-list-item
        to="/pilot_management"
        prepend-icon="cc:pilot"
        :title="$t('ow.hangar')"
        class="my-1 rounded-0"
        :active="isRouteActive('/pilot_management') || isRouteActive('/pilot/')"
        color="accent"
        @click="drawer = false"
      />

      <v-list-item
        to="/active-mode/sheet-manager"
        prepend-icon="mdi-card-account-details-outline"
        :title="$t('ow.activeSheets')"
        class="my-1 rounded-0"
        :active="isRouteActive('/active-mode/sheet-manager')"
        color="accent"
        @click="drawer = false"
      >
        <template #append v-if="activeSheetsCount > 0">
          <v-badge :content="activeSheetsCount" color="accent" inline />
        </template>
      </v-list-item>


      <v-list-item
        to="/active-mode/npcs"
        prepend-icon="cc:npc"
        :title="$t('ow.npcs')"
        class="my-1 rounded-0"
        :active="isRouteActive('/active-mode/npcs')"
        color="accent"
        @click="drawer = false"
      >
        <template #append v-if="npcsCount > 0">
          <v-badge :content="npcsCount" color="secondary" inline />
        </template>
      </v-list-item>

      <v-divider class="my-3 border-grey-darken-3" />

      <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.quickActions') }}</v-list-subheader>

      <v-list-item
        to="/active-mode/new-sheet"
        prepend-icon="mdi-account-plus"
        :title="$t('ow.newSheet')"
        class="my-1 rounded-0"
        @click="drawer = false"
      />

      <v-list-item
        prepend-icon="mdi-file-import-outline"
        :title="$t('ow.importShareCodeJson')"
        class="my-1 rounded-0 text-accent font-weight-bold"
        @click="drawer = false; showImportDialog = true"
      />

      <v-list-item
        to="/table-chat"
        prepend-icon="mdi-message-text-clock-outline"
        :title="$t('ow.chatAndActions')"
        subtitle="Combat tracker e feed de mensagens"
        class="my-1 rounded-0"
        :active="isRouteActive('/table-chat')"
        color="accent"
        @click="drawer = false"
      >
        <template #append v-if="tableActionStore.unreadCount > 0">
          <v-badge :content="tableActionStore.unreadCount" color="accent" inline />
        </template>
      </v-list-item>

      <v-divider class="my-3 border-grey-darken-3" />
      <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.settingsAndLcps') }}</v-list-subheader>
      <v-list-item
        prepend-icon="mdi-package-down"
        :title="$t('ow.installLcps')"
        class="my-1 rounded-0"
        @click="drawer = false; openOptions('lcps')"
      />
      <v-list-item
        prepend-icon="mdi-translate"
        :title="$t('ow.translationAndLanguage')"
        class="my-1 rounded-0"
        @click="drawer = false; openOptions('language')"
      />
      <v-list-item
        prepend-icon="mdi-palette"
        :title="$t('ow.appearanceAndTheme')"
        class="my-1 rounded-0"
        @click="drawer = false; openOptions('settings')"
      />
      <v-list-item
        prepend-icon="mdi-dice-multiple"
        title="Dados 3D (dddice)"
        class="my-1 rounded-0"
        @click="drawer = false; openOptions('dddice')"
      />

      <!-- Active Sessions (Mobile) -->
      <template v-if="activePilotSheet || activeEncounter">
        <v-divider class="my-3 border-grey-darken-3" />
        <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.activeSessions') }}</v-list-subheader>

        <v-list-item
          v-if="activePilotSheet"
          prepend-icon="mdi-restart"
          :title="`${$t('ow.pilotPrefix')}: ${activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name}`"
          :subtitle="$t('ow.resumeTurn')"
          class="my-1 text-accent rounded-0"
          @click="drawer = false; resumePilot()"
        />

        <v-list-item
          v-if="activeEncounter"
          prepend-icon="cc:encounter"
          :title="`${$t('ow.encounterPrefix')}: ${activeEncounter.Encounter.Name}`"
          :subtitle="$t('ow.resumeRound')"
          class="my-1 text-primary rounded-0"
          @click="drawer = false; resumeEncounter()"
        />
      </template>
    </v-list>
  </v-navigation-drawer>

  <!-- Global Import Dialog triggered from Navbar -->
  <ImportDialog v-model="showImportDialog" :redirect="true" />

  <!-- Global Options Dialog (LCPs, Translation, Settings) -->
  <AppOptionsDialog v-model="showOptionsDialog" :initial-tab="optionsTab" />

  <!-- Reload Extension Window Confirmation -->
  <v-dialog v-model="reloadDialog" max-width="440">
    <v-card class="rounded-0 border border-grey-darken-3">
      <v-card-title class="text-cc-overline text-accent">{{ $t('ow.reloadWindow') }}</v-card-title>
      <v-card-text class="text-body-2">{{ $t('ow.reloadWindowConfirm') }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" size="small" class="rounded-0" @click="reloadDialog = false">
          {{ $t('common.cancel') }}
        </v-btn>
        <v-btn variant="flat" size="small" color="accent" class="rounded-0" @click="reloadWindow">
          {{ $t('ow.reloadWindowAction') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { EncounterStore, PilotSheetStore, NpcStore } from '@/stores'
import { windowManager } from '@/services/windowManager'
import { obrBridge } from '@/services/obrBridge'
import OBR from '@owlbear-rodeo/sdk'
import ImportDialog from '@/features/active_mode/_components/ImportDialog.vue'
import AppOptionsDialog from './AppOptionsDialog.vue'
import { dddiceService } from '@/services/dddiceService'
import { useTableActionStore } from '@/stores/tableActionStore'
import { tableSyncSocket, tableSyncStatus } from '@/services/tableSyncSocket'
import { reloadExtensionWindow } from '@/services/windowReload'
import { useI18n } from 'vue-i18n'
import { usePilotJoinRequest } from '@/composables/usePilotJoinRequest'

const { requestPilotJoin } = usePilotJoinRequest()
const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const { mdAndDown: mobile } = useDisplay()
const tableActionStore = useTableActionStore()

function handleToggleChat() {
  if (windowManager.isMinimized.value) {
    void windowManager.restore()
  }
  if (route.path === '/table-chat') {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/active-mode')
    }
  } else {
    router.push('/table-chat')
  }
}

const drawer = ref(false)
const showImportDialog = ref(false)
const showOptionsDialog = ref(false)
const optionsTab = ref<'lcps' | 'language' | 'settings' | 'dddice'>('lcps')

const syncStatusColor = computed(() => {
  if (tableSyncStatus.value === 'connected') return 'success'
  if (tableSyncStatus.value === 'reconnecting' || tableSyncStatus.value === 'connecting') return 'warning'
  return 'grey-lighten-1'
})

const syncStatusIcon = computed(() => {
  if (tableSyncStatus.value === 'connected') return 'mdi-access-point'
  if (tableSyncStatus.value === 'reconnecting' || tableSyncStatus.value === 'connecting') return 'mdi-access-point-network-off'
  return 'mdi-access-point-off'
})

const syncStatusTooltip = computed(() => {
  if (tableSyncStatus.value === 'connected') return t('ow.wsConnected')
  if (tableSyncStatus.value === 'reconnecting' || tableSyncStatus.value === 'connecting') return t('ow.wsReconnecting')
  return t('ow.wsDisconnected')
})

function reconnectSync() {
  if (tableSyncStatus.value !== 'connected') {
    tableSyncSocket.connect()
  }
}

function openOptions(tab: 'lcps' | 'language' | 'settings' | 'dddice' = 'lcps') {
  optionsTab.value = tab
  showOptionsDialog.value = true
}

const reloadDialog = ref(false)

function askReloadWindow() {
  reloadDialog.value = true
}

/**
 * Recarrega o iframe desta janela da extensão.
 *
 * O aviso aos listeners e a espera antes do reload vivem em `windowReload`: quem tem
 * timer pendente (deltas da ficha, autosave do encontro) grava nesse intervalo, porque
 * um reload de página não desmonta os componentes.
 */
function reloadWindow() {
  reloadDialog.value = false
  reloadExtensionWindow()
}

const isHome = computed(() => {
  return route.path === '/active-mode' || route.path === '/active-mode/' || route.path === '/'
})

const activeSheetsCount = computed(() => {
  return PilotSheetStore().PilotSheets.filter(x => !x.Archived && !x.SaveController.IsDeleted).length
})

const encountersCount = computed(() => {
  return EncounterStore().ActiveEncounters?.filter(x => !x.SaveController?.IsDeleted).length || 0
})

const npcsCount = computed(() => {
  return NpcStore().Npcs.filter(x => !x.SaveController?.IsDeleted).length || 0
})

const activePilotSheet = computed(() => {
  if (!PilotSheetStore().CurrentActiveID) return null
  return PilotSheetStore().GetSheet(PilotSheetStore().CurrentActiveID)
})

const activeEncounter = computed(() => {
  if (!EncounterStore().CurrentActiveID) return null
  return EncounterStore().getActiveEncounter(EncounterStore().CurrentActiveID)
})

const isOnActivePilotSheet = computed(() => {
  if (!activePilotSheet.value) return false
  const path = route.path || ''
  return path.startsWith('/active-mode/pilot-runner') &&
    (!route.params.id || route.params.id === activePilotSheet.value.ID) &&
    String(route.query.readonly ?? '') !== '1'
})

const isOnActiveEncounter = computed(() => {
  if (!activeEncounter.value) return false
  const path = route.path || ''
  return path === '/table-chat' && route.query.tab === 'tracker'
})

function isRouteActive(targetPath: string, exact: boolean = false): boolean {
  if (exact) {
    return route.path === targetPath || route.path === targetPath + '/'
  }
  return route.path.startsWith(targetPath)
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/active-mode')
  }
}

async function resumePilot() {
  if (activePilotSheet.value) {
    router.push(`/active-mode/pilot-runner/${activePilotSheet.value.ID}`)
  }
}

function resumeEncounter() {
  if (activeEncounter.value) {
    router.push('/table-chat?tab=tracker')
  }
}

function handleOpenImportDialog() {
  showImportDialog.value = true
}

onMounted(() => {
  window.addEventListener('compcon-open-import-dialog', handleOpenImportDialog)
})

onUnmounted(() => {
  window.removeEventListener('compcon-open-import-dialog', handleOpenImportDialog)
})
</script>

<style scoped>
.app-navbar {
  background: rgba(14, 18, 24, 0.92) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(var(--v-theme-accent), 0.28) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  position: relative;
}

.navbar-glow-line {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(var(--v-theme-primary)) 25%,
    rgb(var(--v-theme-accent)) 50%,
    rgb(var(--v-theme-primary)) 75%,
    transparent
  );
  opacity: 0.75;
}

.navbar-brand {
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.navbar-brand:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.brand-avatar {
  border: 1px solid rgba(var(--v-theme-accent), 0.6);
  box-shadow: 0 0 10px rgba(var(--v-theme-accent), 0.3);
}

.nav-btn {
  text-transform: uppercase;
  font-size: 0.85rem !important;
  letter-spacing: 1px;
  position: relative;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  background: rgba(var(--v-theme-accent), 0.12) !important;
}

.nav-link-active {
  background: rgba(var(--v-theme-accent), 0.16) !important;
  border-bottom: 2px solid rgb(var(--v-theme-accent)) !important;
}

.resume-chip {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.resume-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 8px rgba(var(--v-theme-accent), 0.4);
}

.window-drag-handle {
  user-select: none;
  touch-action: none;
  transition: background 0.15s ease;
}

.cursor-grab {
  cursor: grab !important;
}

.cursor-grab:hover {
  background: rgba(var(--v-theme-accent), 0.12);
}

.cursor-grab:active {
  cursor: grabbing !important;
  background: rgba(var(--v-theme-accent), 0.22);
}

.no-drag {
  cursor: default !important;
}

.window-controls {
  flex-shrink: 0;
}

@keyframes syncPulse {
  0% { opacity: 0.35; }
  50% { opacity: 1; }
  100% { opacity: 0.35; }
}

.sync-pulsing {
  animation: syncPulse 1.2s infinite ease-in-out;
}
</style>
