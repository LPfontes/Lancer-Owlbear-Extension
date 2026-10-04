<template>
  <v-app id="app" :theme="activeTheme" :class="{ 'app-minimized': windowManager.isMinimized.value && !isStandaloneView }">
    <cc-notify />
    <AppNavbar v-if="!isStandaloneView" />
    <TokenLinkDialog />
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
import { windowManager } from '@/services/windowManager'
import {
  bootSheetWindow,
  ensureSheetWindowOnRoomJoin,
  isSheetWindowContext,
} from '@/services/mainWindow'
import { useTableActionStore } from '@/stores/tableActionStore'
import { preloadTableChatWindow } from '@/services/tableChatWindow'
import { isActiveModePrewarm } from '@/services/prewarmContext'
import { useTokenTrackerBridge } from '@/composables/useTokenTrackerBridge'
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
    route.path === '/table-chat' ||
    route.path.startsWith('/table-chat')
  )
})

// Iframe oculto de pré-aquecimento do Modo Ativo (ver `services/prewarmContext.ts`).
// É uma segunda instância do app: carrega stores e sincronização, mas não mexe na
// janela do usuário nem cria a janela persistente da ficha.
const isPrewarmView = isActiveModePrewarm()

// Trackers dos tokens no mapa (PV, Blindagem, Calor, Movimento, Estrutura,
// Estresse). Precisa ser chamado no setup (e não no `onMounted`) por causa do
// `onScopeDispose` lá dentro. O iframe de pré-aquecimento não participa: ele não
// desenha nada.
if (!isPrewarmView) {
  useTokenTrackerBridge()
}

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

/**
 * Navegação sem reload: a mesma janela persistente troca de ficha atendendo ao
 * pedido de outro iframe (ficha do tracker, broadcast da mesa, etc.).
 */
function handleNavigateRequested(event: Event) {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path
  if (!path) return
  const target = path.startsWith('/') ? path : `/${path}`
  if (route.fullPath === target) return
  router.push(target).catch(err => console.warn('[App] Falha ao navegar sem reload:', err))
}

/**
 * Navegação pedida por outro iframe (ex.: Gerenciador de Fichas da Mesa).
 * Só a própria janela persistente executa, e sempre sem recarregar o iframe.
 */
function handleNavigateMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const data = event.data
  if (!data || typeof data !== 'object' || data.obrBridgeBroadcast !== true) return
  const payload = data.payload
  if (!payload || payload.type !== 'NAVIGATE' || !payload.path) return
  if (!isSheetWindowContext()) return
  const target = String(payload.path).startsWith('/') ? String(payload.path) : `/${payload.path}`
  if (route.fullPath === target) return
  router.push(target).catch(err => console.warn('[App] Falha ao navegar sem reload:', err))
}

async function handleOpenSheetRequested(event: Event) {
  const customEvent = event as CustomEvent<{ sheetType: 'pilot' | 'npc'; sheetId: string; npcType?: string }>
  const detail = customEvent.detail
  if (!detail) return

  // Só a janela persistente da ficha (windowType=floating) abre a ficha pedida por
  // outro iframe. Sem esta trava o pedido também navegava as outras janelas do
  // mesmo navegador — a janela de chat desanexada (`/#/table-chat`) saía do chat
  // para o npc-runner ao receber o broadcast do tracker.
  if (!isSheetWindowContext()) return

  // Reexibe a janela persistente (mesmo iframe) antes de navegar para a ficha.
  void windowManager.reopenWindow()
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
  window.addEventListener('compcon-navigate', handleNavigateRequested)
  window.addEventListener('message', handleNavigateMessage)
  void useTableActionStore().init()

  // Reaplica o estado visual da janela persistente e executa qualquer navegação
  // pendente (ficha pedida enquanto a janela estava oculta) sem recarregar o iframe.
  if (isSheetWindowContext()) {
    void bootSheetWindow({
      navigate: path => {
        if (!path) return
        const current = route.fullPath || ''
        if (`/${current.replace(/^\//, '')}` === path) return
        router.push(path).catch(() => {})
      },
    })
  }

  // Garante que a janela persistente da ficha exista desde a abertura da sala —
  // inclusive a partir da janela de chat/ações, que é a que o Owlbear carrega
  // sozinho. Uma vez criada, ela nunca é destruída: "fechar" apenas oculta via CSS.
  // O iframe de pré-aquecimento não participa: quem cria janela é a janela visível.
  if (!isPrewarmView) {
    void ensureSheetWindowOnRoomJoin()
  }

  // Janelas standalone (como o chat /table-chat) nunca devem reposicionar a janela principal da ficha
  if (!isStandaloneView.value && !isPrewarmView) {
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
  window.removeEventListener('compcon-navigate', handleNavigateRequested)
  window.removeEventListener('message', handleNavigateMessage)
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

/*
 * "Fechar" a janela da ficha = apenas ocultar (nada é desmontado).
 *
 * `display: none` remove a árvore inteira do layout de uma vez. Isso é aplicado
 * aos filhos diretos de <body> — não ao <body> — para que as variáveis de tema
 * definidas nele continuem valendo caso a janela seja reexibida.
 *
 * O elemento <iframe class="extension-frame"> em si pertence ao DOM do Owlbear
 * Rodeo (outra origem) e não pode ser estilizado daqui; o equivalente é o
 * colapso 0×0 via `OBR.popover.setWidth/setHeight(0)` em `collapsePopoverSize()`
 * (mainWindow.ts), que tira o iframe do layout e dos cliques no canvas.
 *
 * A classe é aplicada em `mainWindow.applyHiddenClass` e já nasce no boot
 * (`initSheetWindowVisibility`, antes do mount) para não piscar um frame.
 */
html.sheet-window-hidden body > *,
body.sheet-window-hidden body > * {
  display: none !important;
}

html.sheet-window-hidden,
body.sheet-window-hidden {
  background: transparent !important;
  pointer-events: none !important;
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
