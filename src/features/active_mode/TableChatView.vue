<template>
  <div class="table-chat-window fill-height d-flex flex-column bg-grey-darken-4 text-white">
    <!-- Window Header -->
    <div class="window-header d-flex align-center justify-space-between py-2 px-3 bg-grey-darken-4 border-b border-accent flex-shrink-0">
      <div class="d-flex align-center ga-2 text-truncate">
        <v-avatar size="26" color="primary" class="rounded-0 border-accent">
          <v-icon icon="mdi-sword-cross" size="16" color="white" />
        </v-avatar>
        <div class="text-truncate">
          <div class="text-subtitle-2 font-weight-bold text-uppercase text-truncate" style="letter-spacing: 1px; line-height: 1.1;">
            Ações da Mesa & Chat
          </div>
          <div class="text-caption text-grey-lighten-2 text-truncate" style="font-size: 0.68rem !important; line-height: 1;">
            Lancer Combat Feed & Broadcast
          </div>
        </div>
      </div>

      <div class="d-flex align-center ga-1 flex-shrink-0">
        <!-- Badge de contagem total -->
        <v-chip
          size="x-small"
          color="accent"
          variant="flat"
          class="font-weight-bold text-black px-1 mr-1"
          style="font-size: 11px; height: 20px;"
          title="Total de ações registradas"
        >
          {{ tableActionStore.actions.length }}
        </v-chip>

        <!-- Menu de Opções -->
        <v-menu location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon="mdi-dots-vertical"
              variant="text"
              size="small"
              color="grey-lighten-1"
              title="Mais opções"
            />
          </template>
          <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1">
            <v-list-item
              prepend-icon="mdi-delete-sweep-outline"
              title="Limpar Todas as Mensagens"
              density="compact"
              class="my-1 rounded-0 text-error font-weight-bold"
              @click="confirmClearHistory"
            />
          </v-list>
        </v-menu>

        <!-- Destacar em janela do navegador -->
        <v-btn
          icon="mdi-open-in-new"
          variant="text"
          size="small"
          color="grey-lighten-1"
          title="Destacar em nova janela do navegador"
          @click="detachWindow"
        />

        <!-- Fechar Janela -->
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          color="grey-lighten-1"
          title="Fechar Janela"
          @click="closeWindow"
        />
      </div>
    </div>

    <!-- Abas de Navegação Superior: Tracker de Combate vs Ações & Chat -->
    <div class="d-flex align-center border-b border-grey-darken-3 bg-grey-darken-4 flex-shrink-0">
      <v-tabs
        v-model="currentTab"
        density="compact"
        color="accent"
        bg-color="grey-darken-4"
        class="flex-grow-1"
      >
        <v-tab value="tracker" class="font-weight-bold" style="letter-spacing: 0.5px; font-size: 0.78rem;">
          <v-icon icon="cc:encounter" class="mr-1" size="18" />
          Tracker
          <v-chip
            v-if="encounterRound"
            size="x-small"
            color="accent"
            class="ml-1 px-1 font-weight-bold text-black"
            style="height: 16px; font-size: 9.5px;"
          >
            R{{ encounterRound }}
          </v-chip>
        </v-tab>
        <v-tab value="chat" class="font-weight-bold" style="letter-spacing: 0.5px; font-size: 0.78rem;">
          <v-icon icon="mdi-sword-cross" class="mr-1" size="18" />
          Ações & Chat
          <v-chip
            v-if="tableActionStore.actions.length > 0"
            size="x-small"
            color="grey-darken-2"
            class="ml-1 px-1"
            style="height: 16px; font-size: 9.5px;"
          >
            {{ tableActionStore.actions.length }}
          </v-chip>
        </v-tab>
      </v-tabs>
    </div>

    <!-- Aba 1: Tracker de Combate -->
    <div
      v-show="currentTab === 'tracker'"
      class="flex-grow-1 overflow-hidden flex-column"
      :class="currentTab === 'tracker' ? 'd-flex' : 'd-none'"
    >
      <CombatTrackerTab
        :active-filter="trackerActiveFilter"
        @update:side-filters="trackerSideFilters = $event"
        @update:active-filter="trackerActiveFilter = $event"
      />
    </div>

    <!-- Aba 2: Feed de Mensagens e Ações da Mesa -->
    <div
      v-show="currentTab === 'chat'"
      class="flex-grow-1 overflow-hidden flex-column"
      :class="currentTab === 'chat' ? 'd-flex' : 'd-none'"
    >
      <!-- Botão para Abrir a Janela da Ficha (COMP/CON na lateral direita) -->
      <div class="px-3 py-2 bg-grey-darken-4 border-b border-grey-darken-3 flex-shrink-0">
        <v-btn
          block
          color="accent"
          variant="tonal"
          size="small"
          class="font-weight-bold text-uppercase rounded-0"
          prepend-icon="mdi-card-account-details-outline"
          append-icon="mdi-dock-window"
          title="Abrir a Janela da Ficha do COMP/CON na lateral direita"
          @click="handleOpenMainWindow"
        >
          Abrir Janela da Ficha
        </v-btn>
      </div>

      <!-- Barra de Filtros e Busca -->
      <div class="filter-bar px-3 py-2 bg-grey-darken-4 border-b border-grey-darken-3 flex-shrink-0">
        <div class="d-flex align-center ga-1 overflow-x-auto pb-1 category-chips-scroll">
          <v-chip
            v-for="cat in filterOptions"
            :key="cat.value"
            size="x-small"
            rounded="0"
            :color="tableActionStore.filterCategory === cat.value ? 'accent' : 'default'"
            :variant="tableActionStore.filterCategory === cat.value ? 'flat' : 'text'"
            class="font-weight-bold cursor-pointer flex-shrink-0 rounded-0"
            @click="tableActionStore.filterCategory = cat.value"
          >
            {{ cat.label }}
          </v-chip>
        </div>

        <div class="d-flex align-center ga-2 mt-1">
          <!-- Seletor de Ator (se houver mais de 1) -->
          <v-select
            v-if="tableActionStore.actorsList.length > 1"
            v-model="tableActionStore.filterActor"
            :items="[{ title: 'Todos os Pilotos', value: 'all' }, ...actorSelectItems]"
            density="compact"
            variant="outlined"
            hide-details
            class="actor-select flex-grow-1"
            style="font-size: 11px;"
          />

          <!-- Campo de Busca Rápida -->
          <v-text-field
            v-model="tableActionStore.searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Filtrar ações..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            class="search-input flex-grow-1"
            style="font-size: 11px;"
          />
        </div>
      </div>

      <!-- Feed de Mensagens e Ações (Scrollável) -->
      <div
        ref="feedContainer"
        class="chat-feed-container flex-grow-1 px-3 py-2 overflow-y-auto"
      >
        <div v-if="!tableActionStore.filteredActions.length" class="empty-state text-center py-10 px-4">
          <v-icon icon="mdi-clipboard-text-clock-outline" size="44" color="grey-darken-1" class="mb-2" />
          <div class="text-subtitle-2 text-grey-lighten-1">
            Nenhuma ação encontrada
          </div>
        </div>

        <TableActionCard
          v-for="action in tableActionStore.filteredActions"
          :key="action.id"
          :action="action"
        />
      </div>

      <!-- Rodapé de Ações Rápidas e Input de Chat -->
      <TableActionInput class="flex-shrink-0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useTableActionStore } from '@/stores/tableActionStore'
import { EncounterStore } from '@/stores'
import { closeTableChatWindow, detachTableChatWindow } from '@/services/tableChatWindow'
import { openMainWindow, isMainWindowOpen } from '@/services/mainWindow'
import TableActionCard from '@/ui/components/TableActionDrawer/TableActionCard.vue'
import TableActionInput from '@/ui/components/TableActionDrawer/TableActionInput.vue'
import CombatTrackerTab from '@/ui/components/TableActionDrawer/CombatTrackerTab.vue'

const tableActionStore = useTableActionStore()
const encounterStore = EncounterStore()
const feedContainer = ref<HTMLElement | null>(null)
const currentTab = ref<'tracker' | 'chat'>('tracker')
const trackerSideFilters = ref<{ label: string; value: string; count: number }[]>([])
const trackerActiveFilter = ref<'all' | 'enemy' | 'ally' | 'neutral' | 'pending'>('all')

const encounterRound = computed(() => {
  if (encounterStore.CurrentActiveID) {
    const enc = encounterStore.getActiveEncounter(encounterStore.CurrentActiveID)
    if (enc) return enc.Round
  }
  if (encounterStore.ActiveEncounters?.length > 0) {
    return encounterStore.ActiveEncounters[0].Round
  }
  return null
})

function handleOpenMainWindow() {
  // Reexibe a janela persistente (mesmo iframe); só cria uma se ainda não existir.
  // Não recria nem recarrega: isso descartaria o estado da ficha.
  void openMainWindow({
    restoreIfHidden: true,
    targetRoute: '/active-mode',
  })
}

const filterOptions = [
  { label: 'Todas', value: 'all' },
  { label: 'Ações', value: 'full_action' },
  { label: 'Rápidas', value: 'quick_action' },
  { label: 'Rolagens', value: 'roll' },
  { label: 'Danos', value: 'damage' },
  { label: 'Chat', value: 'chat' },
]

const actorSelectItems = computed(() => {
  return tableActionStore.actorsList.map(actor => ({
    title: actor,
    value: actor,
  }))
})

function scrollToBottom() {
  if (feedContainer.value) {
    feedContainer.value.scrollTop = feedContainer.value.scrollHeight
  }
}

function closeWindow() {
  void closeTableChatWindow()
}

function detachWindow() {
  detachTableChatWindow()
}

function confirmClearHistory() {
  if (confirm('Deseja realmente limpar todas as mensagens de ações da mesa para todos os jogadores?')) {
    tableActionStore.clearHistory()
  }
}

onMounted(async () => {
  try {
    await tableActionStore.init()
    await encounterStore.LoadEncounters().catch(() => {})
  } catch (e) {
    console.warn('[TableChatView] Erro ao inicializar store:', e)
  }
  tableActionStore.unreadCount = 0
  nextTick(() => {
    scrollToBottom()
  })
})

// Auto-scroll sempre que novas ações chegarem
watch(
  () => tableActionStore.actions.length,
  () => {
    tableActionStore.unreadCount = 0
    nextTick(() => {
      scrollToBottom()
    })
  }
)

watch(currentTab, (tab) => {
  if (tab === 'chat') {
    nextTick(() => {
      scrollToBottom()
    })
  }
})
</script>

<style scoped>
.table-chat-window {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: rgba(14, 18, 24, 0.98) !important;
  display: flex;
  flex-direction: column;
}

.window-header {
  border-bottom: 1px solid rgba(var(--v-theme-accent), 0.3) !important;
  background: rgba(20, 26, 35, 0.98) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.filter-bar {
  background: rgba(16, 21, 29, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.chat-feed-container {
  overflow-y: auto;
  scroll-behavior: smooth;
}

.chat-feed-container::-webkit-scrollbar {
  width: 6px;
}

.chat-feed-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}

.chat-feed-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-accent), 0.35);
  border-radius: 3px;
}

.chat-feed-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-accent), 0.6);
}

.filter-chips-scroll {
  scrollbar-width: none;
}

.filter-chips-scroll::-webkit-scrollbar {
  display: none;
}

.category-chips-scroll::-webkit-scrollbar {
  height: 3px;
}

.category-chips-scroll::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-accent), 0.2);
  border-radius: 2px;
}

.category-chips-scroll :deep(.v-chip) {
  border-radius: 0 !important;
  border: none !important;
}

.category-chips-scroll :deep(.v-chip--variant-outlined) {
  border: none !important;
}

.category-chips-scroll :deep(.v-chip__underlay),
:deep(.v-chip__underlay) {
  background: none !important;
  background-color: transparent !important;
  opacity: 0 !important;
  display: none !important;
}

.actor-select :deep(.v-field__input),
.search-input :deep(.v-field__input) {
  font-size: 11px;
  padding-top: 2px;
  padding-bottom: 2px;
  min-height: 28px;
}
</style>
