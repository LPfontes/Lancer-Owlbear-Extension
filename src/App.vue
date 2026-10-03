<template>
  <v-app id="app" :theme="activeTheme" :class="{ 'app-minimized': windowManager.isMinimized.value && !isStandaloneView }">
    <cc-notify />
    <AppNavbar v-if="!isStandaloneView" />
    <TokenLinkDialog />
    <TableSheetManagerDialog v-if="!isStandaloneView" />
    <v-main id="main-content" v-show="isStandaloneView || !windowManager.isMinimized.value">
      <router-view :key="route.fullPath" />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { provide, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { GetValue } from '@/io/Storage'
import CcNotify from '@/ui/notification/CCNotify.vue'
import AppNavbar from '@/ui/components/AppNavbar.vue'
import TokenLinkDialog from '@/ui/components/Owlbear/TokenLinkDialog.vue'
import TableSheetManagerDialog from '@/ui/components/Owlbear/TableSheetManagerDialog.vue'
import { windowManager } from '@/services/windowManager'
import { useTableActionStore } from '@/stores/tableActionStore'
import { preloadTableChatWindow } from '@/services/tableChatWindow'
import { UserStore, CompendiumStore } from './stores'

import type { UserProfile } from '@/user'
import {
  CompendiumDataKey,
  UserDataKey,
  type CompendiumDataProvider,
  type UserDataProvider,
} from '@/ui/providers'

const theme = useTheme()
const userStore = UserStore()

const activeTheme = computed(() => {
  return theme.global.name.value || userStore.User?.Theme || 'gms_dark'
})

const route = useRoute()
const isStandaloneView = computed(() => {
  return (
    route.path === '/table-sheets' ||
    route.path.startsWith('/table-sheets') ||
    route.path === '/table-chat' ||
    route.path.startsWith('/table-chat')
  )
})

provide<CompendiumDataProvider>(CompendiumDataKey, {
  get Statuses() {
    return CompendiumStore().Statuses
  },
  get Frames() {
    return CompendiumStore().Frames
  },
  get NpcClasses() {
    return CompendiumStore().NpcClasses
  },
  get NpcFeatures() {
    return CompendiumStore().NpcFeatures
  },
  get ContentPacks() {
    return CompendiumStore().ContentPacks
  },
    getItemCollection: itemType => CompendiumStore().getItemCollection(itemType),
  referenceLink: (item, internal) => CompendiumStore().referenceLink(item, internal),
})

provide<UserDataProvider>(UserDataKey, {
  get User() {
    return UserStore().User as UserProfile
  },
  get IsLoggedIn() {
    return UserStore().IsLoggedIn
  },
  get CloudImages() {
    return UserStore().CloudImages
  },
  get CloudStorageUsed() {
    return UserStore().CloudStorageUsed
  },
  get MaxCloudStorage() {
    return UserStore().MaxCloudStorage
  },
  get CloudStorageFull() {
    return UserStore().CloudStorageFull
  },
  downloadLcp: pack => UserStore().downloadLcp(pack),
  refreshDbData: () => UserStore().refreshDbData(),
})

import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
import { PilotStore } from '@/features/pilot_management/store'

const router = useRouter()

async function handleOpenSheetRequested(event: Event) {
  const customEvent = event as CustomEvent<{ sheetType: 'pilot' | 'npc'; sheetId: string; npcType?: string }>
  const detail = customEvent.detail
  if (!detail) return

  windowManager.restore()
  if (detail.sheetType === 'pilot') {
    try {
      const pilotSheetStore = PilotSheetStore()
      const pilotStore = PilotStore()

      if (!pilotSheetStore.PilotSheets?.length) {
        await pilotSheetStore.LoadPilotSheets()
      }

      // Procura uma PilotSheet ativa ou existente não deletada para este piloto
      let targetSheet: any = pilotSheetStore.PilotSheets.find(
        (s: any) => !s.SaveController?.IsDeleted && !s.Archived && (s.PilotID === detail.sheetId || s.ID === detail.sheetId)
      )

      if (!targetSheet) {
        targetSheet = pilotSheetStore.PilotSheets.find(
          (s: any) => !s.SaveController?.IsDeleted && (s.PilotID === detail.sheetId || s.ID === detail.sheetId)
        )
        if (targetSheet?.Archived) {
          targetSheet.Unarchive()
        }
      }

      if (!targetSheet) {
        let pilot: any = pilotStore.Pilots.find((p: any) => p.ID === detail.sheetId)
        if (!pilot) {
          await pilotStore.LoadPilots()
          pilot = pilotStore.Pilots.find((p: any) => p.ID === detail.sheetId)
        }
        if (pilot) {
          if (!pilot.ActiveMech && pilot.Mechs?.length) {
            pilot.ActiveMech = pilot.Mechs[0]
          }
          await pilotSheetStore.AddPilotSheet(pilot as any)
          targetSheet = pilotSheetStore.GetSheet(pilotSheetStore.CurrentActiveID)
        }
      }

      if (targetSheet) {
        await pilotSheetStore.SetActiveSheet(targetSheet.ID)
        router.push(`/active-mode/pilot-runner/${targetSheet.ID}`)
      } else {
        router.push(`/active-mode/pilot-runner/${detail.sheetId}`)
      }
    } catch (err) {
      console.error('[App] Erro ao abrir ficha no modo ativo:', err)
      router.push(`/active-mode/pilot-runner/${detail.sheetId}`)
    }
  } else {
    router.push(`/active-mode/npc-runner/${detail.sheetId}`)
  }
}


onMounted(async () => {
  window.addEventListener('compcon-open-sheet-requested', handleOpenSheetRequested)
  void useTableActionStore().init()

  // Janelas standalone (como o chat /table-chat) nunca devem sincronizar ou reposicionar a janela principal da ficha
  if (!isStandaloneView.value) {
    try {
      await windowManager.init()
    } catch {
      // ignore
    }
    // Pré-carrega o chat em segundo plano em seu próprio iframe do Owlbear Rodeo
    void preloadTableChatWindow()
  }

  try {
    const savedTheme = (await GetValue('user_theme')) || userStore.User?.Theme
    if (savedTheme && theme.global.name.value !== savedTheme) {
      theme.global.name.value = savedTheme
      if (userStore.User) userStore.User.Theme = savedTheme
    }
  } catch (e) {
    console.warn('[App] Erro ao carregar tema persistido:', e)
  }
})

onUnmounted(() => {
  window.removeEventListener('compcon-open-sheet-requested', handleOpenSheetRequested)
})

document.documentElement.setAttribute('data-font', 'inter')
</script>

<style>
body {
  margin: 0;
  overflow-x: hidden;
}

html:has(.app-minimized),
body:has(.app-minimized) {
  background: transparent !important;
  overflow: hidden !important;
}

.app-minimized {
  min-height: 48px !important;
  height: 48px !important;
  overflow: hidden !important;
  background: transparent !important;
}

.app-minimized .v-application__wrap {
  min-height: 48px !important;
  height: 48px !important;
  overflow: hidden !important;
  background: transparent !important;
}
</style>
