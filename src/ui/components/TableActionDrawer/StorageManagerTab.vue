<template>
  <div class="storage-manager fill-height d-flex flex-column bg-grey-darken-4 text-white overflow-hidden">
    <!-- Subheader com status do driver e ações gerais -->
    <div class="d-flex align-center justify-space-between px-3 py-2 bg-grey-darken-3 border-b border-grey-darken-2 flex-shrink-0">
      <div class="d-flex align-center ga-2 text-truncate">
        <v-icon icon="mdi-database-outline" size="18" color="accent" />
        <span class="text-caption font-weight-bold text-uppercase" style="letter-spacing: 0.5px;">
          Armazenamento Local
        </span>
        <v-chip
          size="x-small"
          :color="storageDriver === 'INDEXEDDB' ? 'success' : storageDriver === 'LOCALSTORAGE' ? 'warning' : 'error'"
          variant="flat"
          class="font-weight-bold"
        >
          {{ storageDriver }}
        </v-chip>
        <span class="text-caption text-grey-lighten-1" style="font-size: 0.72rem !important;">
          (~{{ formattedTotalSize }})
        </span>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="x-small"
          color="grey-lighten-1"
          :loading="loading"
          title="Atualizar estatísticas"
          @click="refreshStats"
        />
      </div>
    </div>

    <!-- Lista de Coleções e Stores -->
    <div class="flex-grow-1 overflow-y-auto px-3 py-2">
      <v-alert
        v-if="pilotSheetStoreCount > 10"
        density="compact"
        type="info"
        variant="tonal"
        color="accent"
        class="mb-3 text-caption rounded-0 border-accent"
      >
        <div class="font-weight-bold">Fichas de Combate Acumuladas</div>
        Você tem <strong>{{ pilotSheetStoreCount }}</strong> fichas de modo ativo em cache. Se houver fichas antigas ou duplicadas de sessões anteriores, você pode limpá-las ou mantê-las apenas para os pilotos atuais.
      </v-alert>

      <div class="text-overline text-accent font-weight-bold mb-1" style="font-size: 0.7rem !important;">
        Coleções do IndexedDB / Storage
      </div>

      <v-card
        v-for="col in collections"
        :key="col.name"
        variant="outlined"
        class="mb-2 bg-grey-darken-4 border-grey-darken-2 rounded-0"
      >
        <div class="d-flex align-center justify-space-between px-3 py-2">
          <div class="d-flex align-center ga-2 text-truncate">
            <v-icon :icon="col.icon" size="16" :color="col.color" />
            <div>
              <div class="text-caption font-weight-bold text-white text-truncate">
                {{ col.label }}
              </div>
              <div class="text-caption text-grey-lighten-2" style="font-size: 0.65rem !important;">
                Coleção: <code class="text-grey-lighten-1">{{ col.name }}</code>
                <span v-if="col.storeCount !== undefined"> • Store em memória: <strong>{{ col.storeCount }}</strong></span>
              </div>
            </div>
          </div>

          <div class="d-flex align-center ga-2 flex-shrink-0">
            <v-chip
              size="x-small"
              :color="col.count > 0 ? 'accent' : 'grey-darken-1'"
              variant="flat"
              class="font-weight-bold text-black px-2"
              style="font-size: 11px;"
            >
              {{ col.count }} {{ col.count === 1 ? 'item' : 'itens' }}
            </v-chip>

            <!-- Ações por coleção -->
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  icon="mdi-dots-vertical"
                  variant="text"
                  size="x-small"
                  color="grey-lighten-1"
                />
              </template>
              <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1">
                <v-list-item
                  v-if="col.name === 'pilot_sheets'"
                  prepend-icon="mdi-broom"
                  title="Limpar Fichas Órfãs"
                  subtitle="Remove fichas sem piloto no elenco"
                  density="compact"
                  class="my-1 rounded-0 text-warning"
                  @click="cleanupOrphanSheets"
                />
                <v-list-item
                  v-if="col.count > 0"
                  prepend-icon="mdi-trash-can-outline"
                  :title="`Esvaziar ${col.label}`"
                  density="compact"
                  class="my-1 rounded-0 text-error font-weight-bold"
                  @click="promptClearCollection(col)"
                />
                <v-list-item
                  v-else
                  disabled
                  title="Coleção vazia"
                  density="compact"
                  class="text-disabled"
                />
              </v-list>
            </v-menu>
          </div>
        </div>
      </v-card>
    </div>

    <!-- Diálogo de Confirmação de Limpeza -->
    <v-dialog v-model="confirmDialog" max-width="400">
      <v-card class="bg-grey-darken-4 border-accent rounded-0 pa-3 text-white">
        <div class="d-flex align-center ga-2 mb-2">
          <v-icon icon="mdi-alert-outline" color="error" size="22" />
          <div class="text-subtitle-2 font-weight-bold text-uppercase">
            Confirmar Limpeza
          </div>
        </div>
        <div class="text-caption text-grey-lighten-1 mb-4">
          Tem certeza de que deseja apagar todos os <strong>{{ targetCollection?.count }}</strong> itens da coleção
          <strong>{{ targetCollection?.label }}</strong>? Esta ação não pode ser desfeita.
        </div>
        <div class="d-flex justify-end ga-2">
          <v-btn
            size="small"
            variant="text"
            color="grey-lighten-1"
            class="rounded-0"
            @click="confirmDialog = false"
          >
            Cancelar
          </v-btn>
          <v-btn
            size="small"
            color="error"
            variant="flat"
            class="rounded-0 font-weight-bold"
            :loading="actionLoading"
            @click="executeClearCollection"
          >
            Esvaziar Coleção
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  storageDriver,
  storeRegistry,
  GetLength,
  ClearAll,
  GetTotalStorageSize,
  GetAll,
  SetAll,
} from '@/io/Storage'
import { PilotStore } from '@/features/pilot_management/store'
import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
import { NpcStore, EncounterStore } from '@/stores'
import { useTableActionStore } from '@/stores/tableActionStore'

interface CollectionMeta {
  name: string
  label: string
  icon: string
  color: string
  count: number
  storeCount?: number
}

const loading = ref(false)
const actionLoading = ref(false)
const confirmDialog = ref(false)
const targetCollection = ref<CollectionMeta | null>(null)
const totalBytes = ref(0)

const pilotSheetStoreCount = computed(() => PilotSheetStore().PilotSheets?.length ?? 0)

const collections = ref<CollectionMeta[]>([
  {
    name: 'pilot_sheets',
    label: 'Fichas Ativas (Combate / Runner)',
    icon: 'mdi-card-account-details-outline',
    color: 'accent',
    count: 0,
    storeCount: 0,
  },
  {
    name: 'pilots',
    label: 'Pilotos Registrados',
    icon: 'mdi-account-multiple-outline',
    color: 'primary',
    count: 0,
    storeCount: 0,
  },
  {
    name: 'npcs',
    label: 'NPCs & Inimigos',
    icon: 'mdi-robot-outline',
    color: 'error',
    count: 0,
    storeCount: 0,
  },
  {
    name: 'encounters',
    label: 'Encontros Planejados',
    icon: 'mdi-sword-cross',
    color: 'warning',
    count: 0,
    storeCount: 0,
  },
  {
    name: 'active_encounters',
    label: 'Encontros Ativos da Sessão',
    icon: 'mdi-play-circle-outline',
    color: 'success',
    count: 0,
  },
  {
    name: 'table_actions',
    label: 'Histórico de Ações & Chat',
    icon: 'mdi-chat-processing-outline',
    color: 'info',
    count: 0,
  },
  {
    name: 'pilot_logbooks',
    label: 'Logbooks de Piloto',
    icon: 'mdi-book-open-outline',
    color: 'grey-lighten-1',
    count: 0,
  },
  {
    name: 'content',
    label: 'Pacotes LCP Instalados',
    icon: 'mdi-package-variant-closed',
    color: 'secondary',
    count: 0,
  },
  {
    name: 'settings',
    label: 'Configurações do Usuário',
    icon: 'mdi-cog-outline',
    color: 'grey-lighten-2',
    count: 0,
  },
])

const formattedTotalSize = computed(() => {
  const bytes = totalBytes.value
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

async function refreshStats(): Promise<void> {
  loading.value = true
  try {
    for (const col of collections.value) {
      if (storeRegistry[col.name]) {
        col.count = await GetLength(col.name)
      }
      if (col.name === 'pilot_sheets') {
        col.storeCount = PilotSheetStore().PilotSheets?.length ?? 0
      } else if (col.name === 'pilots') {
        col.storeCount = PilotStore().Pilots?.length ?? 0
      } else if (col.name === 'npcs') {
        col.storeCount = NpcStore().Npcs?.length ?? 0
      } else if (col.name === 'encounters') {
        col.storeCount = EncounterStore().Encounters?.length ?? 0
      }
    }
    totalBytes.value = await GetTotalStorageSize()
  } catch (err) {
    console.warn('[StorageManager] Erro ao carregar estatísticas:', err)
  } finally {
    loading.value = false
  }
}

function promptClearCollection(col: CollectionMeta): void {
  targetCollection.value = col
  confirmDialog.value = true
}

async function executeClearCollection(): Promise<void> {
  if (!targetCollection.value) return
  actionLoading.value = true
  const colName = targetCollection.value.name
  try {
    await ClearAll(colName)

    // Atualiza os Pinia stores em memória correspondentes
    if (colName === 'pilot_sheets') {
      await PilotSheetStore().SetActiveSheet('')
      PilotSheetStore().PilotSheets = []
    } else if (colName === 'table_actions') {
      useTableActionStore().clearHistory()
    } else if (colName === 'pilots') {
      PilotStore().Pilots = []
    } else if (colName === 'npcs') {
      NpcStore().Npcs = []
    }

    confirmDialog.value = false
    await refreshStats()
  } catch (err) {
    console.error(`[StorageManager] Erro ao limpar coleção ${colName}:`, err)
  } finally {
    actionLoading.value = false
  }
}

/**
 * Remove fichas ativas (pilot_sheets) cujos pilotos não existem mais na lista de pilotos registrados.
 */
async function cleanupOrphanSheets(): Promise<void> {
  loading.value = true
  try {
    const validPilotIds = new Set((PilotStore().Pilots || []).map(p => p.ID))
    const allSheets = await GetAll('pilot_sheets')
    
    const validSheets = allSheets.filter((sheet: any) => {
      const pilotId = sheet?.Pilot?.ID || sheet?.Combatant?.actor?.ID || sheet?.PilotID
      return pilotId && validPilotIds.has(pilotId)
    })

    await SetAll('pilot_sheets', validSheets)
    await PilotSheetStore().LoadPilotSheets()
    await refreshStats()
  } catch (err) {
    console.error('[StorageManager] Erro ao limpar fichas órfãs:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refreshStats()
})
</script>

<style scoped>
.storage-manager {
  font-family: inherit;
}
</style>
