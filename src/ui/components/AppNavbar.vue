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
      class="d-flex align-center py-0 px-2 justify-space-between fill-height window-drag-handle cursor-grab"
      style="user-select: none;"
      @pointerdown="(e: PointerEvent) => windowManager.handlePointerDown(e)"
      @pointermove="(e: PointerEvent) => windowManager.handlePointerMove(e)"
      @pointerup="(e: PointerEvent) => windowManager.handlePointerUp(e)"
    >
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-drag-vertical" color="accent" size="small" />
        <v-avatar size="24" color="primary" class="rounded-0">
          <v-icon icon="cc:lancer" size="16" color="white" />
        </v-avatar>
        <span class="text-caption font-weight-bold text-accent text-uppercase text-truncate" style="letter-spacing: 1px; max-width: 160px;">
          {{ activePilotSheet ? (activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name) : (activeEncounter ? activeEncounter.Encounter.Name : 'COMP/CON') }}
        </span>
        <v-chip
          v-if="activePilotSheet && activePilotSheet.Combatant.actor.ActiveMech"
          size="x-small"
          color="accent"
          variant="tonal"
          class="font-weight-bold text-truncate"
          style="max-width: 120px;"
        >
          {{ activePilotSheet.Combatant.actor.ActiveMech.Name }}
        </v-chip>
      </div>

      <div class="d-flex align-center ga-1 no-drag">
        <!-- Snap Menu (Minimized) -->
        <v-menu location="bottom end" transition="slide-y-transition">
          <template #activator="{ props: snapProps }">
            <v-btn
              v-bind="snapProps"
              icon="mdi-dock-window"
              variant="text"
              size="x-small"
              color="grey-lighten-1"
              :title="$t('ow.snapToCorners')"
            />
          </template>
          <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1" elevation="6">
            <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.dockWindow') }}</v-list-subheader>
            <v-list-item
              prepend-icon="mdi-arrow-top-right-bold-box-outline"
              :title="$t('ow.topRight')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('top-right')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-top-left-bold-box-outline"
              :title="$t('ow.topLeft')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('top-left')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-bottom-right-bold-box-outline"
              :title="$t('ow.bottomRight')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('bottom-right')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-bottom-left-bold-box-outline"
              :title="$t('ow.bottomLeft')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('bottom-left')"
            />
            <v-list-item
              prepend-icon="mdi-image-filter-center-focus"
              :title="$t('ow.center')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('center')"
            />
          </v-list>
        </v-menu>

        <!-- Restore Window -->
        <v-btn
          icon="mdi-window-maximize"
          variant="text"
          size="x-small"
          color="accent"
          :title="$t('ow.restoreWindow')"
          @click="windowManager.restore()"
        />

        <!-- Close Window -->
        <v-btn
          icon="mdi-close"
          variant="text"
          size="x-small"
          color="grey-lighten-1"
          :title="$t('ow.closeWindow')"
          @click="windowManager.closeWindow()"
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
          to="/active-mode/manage-encounters"
          variant="text"
          :class="isRouteActive('/active-mode/manage-encounters') ? 'nav-link-active text-accent' : 'text-grey-lighten-2'"
          class="nav-btn font-weight-bold rounded-0"
          prepend-icon="cc:encounter"
        >
          {{ $t('ow.encountersGm') }}
          <v-badge
            v-if="encountersCount > 0"
            :content="encountersCount"
            color="primary"
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
      </div>

      <v-spacer />

      <!-- Active Sessions Shortcuts (Resume Pilot or GM) -->
      <div v-if="!mobile" class="d-flex align-center ga-2 mr-2">
        <v-chip
          v-if="activePilotSheet"
          color="accent"
          variant="outlined"
          size="small"
          class="cursor-pointer font-weight-bold resume-chip"
          prepend-icon="mdi-restart"
          @click="resumePilot"
        >
          <span class="text-truncate" style="max-width: 120px;">
            {{ activePilotSheet.Combatant.actor.Callsign || activePilotSheet.Name }}
          </span>
        </v-chip>

        <v-chip
          v-if="activeEncounter"
          color="primary"
          variant="outlined"
          size="small"
          class="cursor-pointer font-weight-bold resume-chip"
          prepend-icon="cc:encounter"
          @click="resumeEncounter"
        >
          <span class="text-truncate" style="max-width: 120px;">
            {{ activeEncounter.Encounter.Name }}
          </span>
        </v-chip>
      </div>

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

      <!-- Quick Action: Criar / Importar Menu -->
      <v-menu location="bottom end" transition="slide-y-transition">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            color="accent"
            variant="flat"
            size="small"
            class="font-weight-bold rounded-0 elevation-2 mr-2"
            prepend-icon="mdi-plus"
          >
            <span v-if="!mobile">{{ $t('ow.actions') }}</span>
            <v-icon icon="mdi-chevron-down" end size="small" />
          </v-btn>
        </template>

        <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1" elevation="6">
          <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.characterAndPilot') }}</v-list-subheader>
          <v-list-item
            to="/new/no_group"
            prepend-icon="mdi-account-plus"
            :title="$t('ow.createPilotSheet')"
            class="my-1 rounded-0 text-accent font-weight-bold"
          />
          <v-list-item
            to="/pilot_management"
            prepend-icon="cc:pilot"
            :title="$t('ow.pilotRoster')"
            class="my-1 rounded-0"
          />
          <v-list-item
            to="/active-mode/new-sheet"
            prepend-icon="mdi-sword"
            :title="$t('ow.startActiveSheet')"
            class="my-1 rounded-0"
          />
          <v-divider class="my-1 border-grey-darken-3" />
          <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.gmSection') }}</v-list-subheader>
          <v-list-item
            to="/active-mode/new-encounter"
            prepend-icon="mdi-sword-cross"
            :title="$t('ow.newEncounter')"
            class="my-1 rounded-0"
          />
          <v-list-item
            to="/active-mode/npcs"
            prepend-icon="cc:npc"
            :title="$t('ow.npcRoster')"
            class="my-1 rounded-0"
          />
          <v-divider class="my-1 border-grey-darken-3" />
          <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.importSection') }}</v-list-subheader>
          <v-list-item
            prepend-icon="mdi-file-import-outline"
            :title="$t('ow.importShareCodeJson')"
            class="my-1 rounded-0 text-accent font-weight-bold"
            @click="showImportDialog = true"
          />
          <v-divider class="my-1 border-grey-darken-3" />
          <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.settingsAndLcps') }}</v-list-subheader>
          <v-list-item
            prepend-icon="mdi-package-down"
            :title="$t('ow.installLcpsFull')"
            class="my-1 rounded-0"
            @click="openOptions('lcps')"
          />
          <v-list-item
            prepend-icon="mdi-translate"
            :title="$t('ow.selectLanguage')"
            class="my-1 rounded-0"
            @click="openOptions('language')"
          />
        </v-list>
      </v-menu>

      <!-- Window Control Cluster (Drag, Snap, Compact, Minimize, Close) -->
      <div class="window-controls d-flex align-center border-l border-grey-darken-3 pl-2 ga-1">
        <!-- Drag Handle for repositioning -->
        <div
          class="window-drag-handle d-flex align-center px-2 py-1 rounded cursor-grab"
          :title="$t('ow.dragWindowHelp')"
          @pointerdown="(e: PointerEvent) => windowManager.handlePointerDown(e)"
          @pointermove="(e: PointerEvent) => windowManager.handlePointerMove(e)"
          @pointerup="(e: PointerEvent) => windowManager.handlePointerUp(e)"
        >
          <v-icon icon="mdi-drag-vertical" size="small" color="accent" />
          <span class="text-caption font-weight-bold text-accent d-none d-lg-inline ml-1" style="font-size: 0.7rem !important; letter-spacing: 0.5px;">{{ $t('ow.move') }}</span>
        </div>

        <!-- Snap to Corners Menu -->
        <v-menu location="bottom end" transition="slide-y-transition">
          <template #activator="{ props: snapProps }">
            <v-btn
              v-bind="snapProps"
              icon="mdi-dock-window"
              variant="text"
              size="small"
              color="grey-lighten-2"
              :title="$t('ow.snapToCorners')"
            />
          </template>
          <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1" elevation="6">
            <v-list-subheader class="text-cc-overline text-accent">{{ $t('ow.snapToCorners') }}</v-list-subheader>
            <v-list-item
              prepend-icon="mdi-arrow-top-right-bold-box-outline"
              :title="$t('ow.topRight')"
              :subtitle="$t('ow.topRightDesc')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('top-right')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-top-left-bold-box-outline"
              :title="$t('ow.topLeft')"
              :subtitle="$t('ow.topLeftDesc')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('top-left')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-bottom-right-bold-box-outline"
              :title="$t('ow.bottomRight')"
              :subtitle="$t('ow.bottomRightDesc')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('bottom-right')"
            />
            <v-list-item
              prepend-icon="mdi-arrow-bottom-left-bold-box-outline"
              :title="$t('ow.bottomLeft')"
              :subtitle="$t('ow.bottomLeftDesc')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('bottom-left')"
            />
            <v-list-item
              prepend-icon="mdi-image-filter-center-focus"
              :title="$t('ow.centerOnScreen')"
              :subtitle="$t('ow.centerOnScreenDesc')"
              class="my-1 rounded-0"
              @click="windowManager.snapTo('center')"
            />
            <v-divider class="my-1 border-grey-darken-3" />
            <v-list-item
              prepend-icon="mdi-open-in-new"
              :title="$t('ow.detachFloating')"
              :subtitle="$t('ow.detachFloatingSubtitle')"
              class="my-1 rounded-0 text-accent font-weight-bold"
              @click="windowManager.syncWithObr()"
            />
          </v-list>
        </v-menu>

        <!-- Compact / Wide Toggle -->
        <v-btn
          icon
          variant="text"
          size="small"
          :color="windowManager.isCompact.value ? 'accent' : 'grey-lighten-2'"
          :title="windowManager.isCompact.value ? $t('ow.expandWideMode') : $t('ow.compactSideMode')"
          @click="windowManager.toggleCompact()"
        >
          <v-icon :icon="windowManager.isCompact.value ? 'mdi-arrow-expand-horizontal' : 'mdi-arrow-collapse-horizontal'" size="small" />
        </v-btn>

        <!-- Minimize Window -->
        <v-btn
          icon="mdi-window-minimize"
          variant="text"
          size="small"
          color="grey-lighten-2"
          :title="$t('ow.minimizeCompactBar')"
          @click="windowManager.minimize()"
        />

        <!-- Close Window -->
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          color="grey-lighten-1"
          :title="$t('ow.closeWindow')"
          @click="windowManager.closeWindow()"
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
        to="/active-mode/manage-encounters"
        prepend-icon="cc:encounter"
        :title="$t('ow.encountersGm')"
        class="my-1 rounded-0"
        :active="isRouteActive('/active-mode/manage-encounters')"
        color="accent"
        @click="drawer = false"
      >
        <template #append v-if="encountersCount > 0">
          <v-badge :content="encountersCount" color="primary" inline />
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
        to="/active-mode/new-encounter"
        prepend-icon="mdi-sword-cross"
        :title="$t('ow.newEncounter')"
        class="my-1 rounded-0"
        @click="drawer = false"
      />

      <v-list-item
        prepend-icon="mdi-file-import-outline"
        :title="$t('ow.importShareCodeJson')"
        class="my-1 rounded-0 text-accent font-weight-bold"
        @click="drawer = false; showImportDialog = true"
      />

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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { EncounterStore, PilotSheetStore, NpcStore } from '@/stores'
import { windowManager } from '@/services/windowManager'
import ImportDialog from '@/features/active_mode/_components/ImportDialog.vue'
import AppOptionsDialog from './AppOptionsDialog.vue'

const route = useRoute()
const router = useRouter()
const { mdAndDown: mobile } = useDisplay()

const drawer = ref(false)
const showImportDialog = ref(false)
const showOptionsDialog = ref(false)
const optionsTab = ref<'lcps' | 'language' | 'settings'>('lcps')

function openOptions(tab: 'lcps' | 'language' | 'settings' = 'lcps') {
  optionsTab.value = tab
  showOptionsDialog.value = true
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

function resumePilot() {
  if (activePilotSheet.value) {
    router.push(`/active-mode/pilot-runner/${activePilotSheet.value.ID}`)
  }
}

function resumeEncounter() {
  if (activeEncounter.value) {
    router.push(`/active-mode/gm-encounter-runner/${activeEncounter.value.ID}`)
  }
}
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
</style>
