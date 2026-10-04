<template>
  <v-navigation-drawer
    v-model="tableActionStore.isDrawerOpen"
    location="right"
    :temporary="!tableActionStore.isPinned"
    :permanent="tableActionStore.isPinned"
    :width="drawerWidth"
    class="table-actions-drawer"
    style="z-index: 1005;"
  >
    <div class="d-flex flex-column h-100">
      <!-- Header do Drawer -->
      <div class="drawer-header px-3 py-2 border-b d-flex align-center justify-space-between flex-shrink-0">
        <div class="d-flex align-center ga-2">
          <v-avatar size="24" color="primary" class="rounded-0">
            <v-icon icon="mdi-sword-cross" size="16" color="white" />
          </v-avatar>
          <span class="text-caption font-weight-bold text-uppercase" style="letter-spacing: 1px;">
            Ações da Mesa
          </span>
          <v-chip
            size="x-small"
            color="accent"
            variant="flat"
            class="font-weight-bold text-black px-1"
            style="font-size: 10px; height: 18px;"
          >
            {{ tableActionStore.recentActions.length }}
          </v-chip>
        </div>

        <div class="d-flex align-center ga-1">
          <!-- Botão Fixar/Flutuar -->
          <v-btn
            icon
            variant="text"
            size="x-small"
            :color="tableActionStore.isPinned ? 'accent' : 'grey-lighten-1'"
            :title="tableActionStore.isPinned ? 'Desafixar Drawer (Flutuante)' : 'Fixar Drawer na Tela'"
            @click="tableActionStore.isPinned = !tableActionStore.isPinned"
          >
            <v-icon :icon="tableActionStore.isPinned ? 'mdi-pin' : 'mdi-pin-outline'" size="16" />
          </v-btn>

          <!-- Menu de Opções: Limpar Histórico -->
          <v-menu location="bottom end">
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                icon="mdi-dots-vertical"
                variant="text"
                size="x-small"
                color="grey-lighten-1"
                title="Mais Opções"
              />
            </template>
            <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1">
              <v-list-item
                prepend-icon="mdi-delete-sweep-outline"
                title="Limpar Todas as Mensagens"
                density="compact"
                class="my-1 rounded-0 text-error"
                @click="confirmClearHistory"
              />
            </v-list>
          </v-menu>

          <!-- Botão Fechar -->
          <v-btn
            icon="mdi-close"
            variant="text"
            size="x-small"
            color="grey-lighten-1"
            title="Fechar"
            @click="tableActionStore.closeDrawer()"
          />
        </div>
      </div>

      <!-- Barra de Filtros Rápidos -->
      <div class="px-2 py-1 bg-surface border-b flex-shrink-0">
        <div class="d-flex align-center ga-1 overflow-x-auto pb-1 category-filter-scroll">
          <v-chip
            v-for="cat in filterOptions"
            :key="cat.value"
            size="x-small"
            :color="tableActionStore.filterCategory === cat.value ? 'accent' : 'default'"
            :variant="tableActionStore.filterCategory === cat.value ? 'flat' : 'outlined'"
            class="font-weight-bold cursor-pointer flex-shrink-0"
            @click="tableActionStore.filterCategory = cat.value"
          >
            {{ cat.label }}
          </v-chip>
        </div>

        <!-- Seletor de Ator (se houver múltiplos) -->
        <div v-if="tableActionStore.actorsList.length > 1" class="d-flex align-center ga-2 mt-1">
          <v-select
            v-model="tableActionStore.filterActor"
            :items="[{ title: 'Todos os Pilotos', value: 'all' }, ...actorSelectItems]"
            density="compact"
            variant="outlined"
            hide-details
            class="actor-select"
            style="font-size: 11px;"
          />
        </div>
      </div>

      <!-- Feed de Ações (Scrollável) -->
      <div
        ref="feedContainer"
        class="feed-scroll-container flex-grow-1 px-3 py-2 overflow-y-auto"
      >
        <div v-if="!tableActionStore.filteredActions.length" class="empty-state text-center pa-6">
          <v-icon icon="mdi-clipboard-text-clock-outline" size="36" color="grey-darken-1" class="mb-2" />
          <div class="text-caption text-disabled">
            Nenhuma ação registrada nesta categoria.
          </div>
          <div class="text-caption text-disabled mt-1" style="font-size: 11px;">
            Use os botões de ação ou execute comandos no Modo Ativo para transmitir em tempo real!
          </div>
        </div>

        <TableActionCard
          v-for="action in tableActionStore.filteredActions"
          :key="action.id"
          :action="action"
        />
      </div>

      <!-- Rodapé com Input e Ações Rápidas -->
      <TableActionInput />
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import TableActionCard from './TableActionCard.vue'
  import TableActionInput from './TableActionInput.vue'

  const tableActionStore = useTableActionStore()
  const { mdAndDown: mobile } = useDisplay()
  const feedContainer = ref<HTMLElement | null>(null)

  const drawerWidth = computed(() => {
    if (mobile.value) return '100%'
    return 390
  })

  const filterOptions = [
    { label: 'Todas', value: 'all' },
    { label: 'Ações', value: 'full_action' },
    { label: 'Rápidas', value: 'quick_action' },
    { label: 'Rolagens', value: 'roll' },
    { label: 'Chat', value: 'chat' },
  ]

  const actorSelectItems = computed(() => {
    return tableActionStore.actorsList.map(actor => ({
      title: actor,
      value: actor,
    }))
  })

  onMounted(() => {
    tableActionStore.init()
    scrollToLatest()
  })

  // Auto-scroll para a última mensagem quando uma nova ação chega
  watch(
    () => tableActionStore.actions.length,
    () => {
      nextTick(() => {
        scrollToLatest()
      })
    }
  )

  // Auto-scroll quando o drawer é aberto
  watch(
    () => tableActionStore.isDrawerOpen,
    (isOpen) => {
      if (isOpen) {
        setTimeout(() => {
          scrollToLatest()
        }, 300) // Aguarda a animação do drawer
      }
    }
  )

  // As mensagens mais recentes ficam no topo do feed (ordem cronológica invertida),
  // então a "última mensagem" está no começo da lista.
  function scrollToLatest() {
    if (feedContainer.value) {
      feedContainer.value.scrollTop = 0
    }
  }

  function confirmClearHistory() {
    if (confirm('Deseja realmente limpar o histórico local de ações da mesa?')) {
      tableActionStore.clearHistory()
    }
  }
</script>

<style scoped>
  .table-actions-drawer {
    background: rgba(11, 14, 19, 0.96) !important;
    backdrop-filter: blur(12px);
    border-left: 1px solid rgba(0, 229, 255, 0.25) !important;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.6);
  }

  .drawer-header {
    background: rgba(18, 24, 32, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .feed-scroll-container::-webkit-scrollbar {
    width: 4px;
  }
  .feed-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.3);
    border-radius: 2px;
  }

  .category-filter-scroll::-webkit-scrollbar {
    height: 2px;
  }

  .actor-select :deep(.v-field__input) {
    font-size: 11px;
    padding-top: 2px;
    padding-bottom: 2px;
  }
</style>
