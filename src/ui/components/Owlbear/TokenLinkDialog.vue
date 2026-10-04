<template>
  <v-dialog
    v-model="isOpen"
    max-width="500px"
    transition="dialog-bottom-transition"
    class="token-link-dialog"
  >
    <v-card class="bg-grey-darken-4 border-accent" elevation="12">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between py-3 px-4 bg-primary text-white">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-link-variant" size="small" />
          <span class="text-subtitle-1 font-weight-bold text-uppercase" style="letter-spacing: 1px;">
            Vincular Ficha ao Token
          </span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          density="comfortable"
          @click="isOpen = false"
        />
      </v-card-title>

      <!-- Token Info Banner -->
      <div v-if="tokenName" class="px-4 py-2 bg-grey-darken-3 border-b border-grey-darken-2 d-flex align-center justify-space-between">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-circle-slice-8" size="x-small" color="accent" />
          <span class="text-caption text-grey-lighten-1">Token:</span>
          <span class="text-caption font-weight-bold text-white">{{ tokenName }}</span>
        </div>
        <v-chip
          v-if="currentBinding"
          size="x-small"
          color="accent"
          variant="flat"
        >
          Vinculado: {{ bindingLabel }}
        </v-chip>
      </div>

      <v-card-text class="pa-4">
        <!-- Search and Tabs -->
        <v-text-field
          v-model="searchQuery"
          density="compact"
          variant="outlined"
          placeholder="Buscar piloto ou NPC..."
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          class="mb-3"
        />

        <v-tabs
          v-model="activeTab"
          density="compact"
          color="accent"
          align-tabs="center"
          class="mb-3 border-b border-grey-darken-3"
        >
          <v-tab value="pilots" prepend-icon="cc:pilot">
            Pilotos ({{ filteredPilots.length }})
          </v-tab>
          <v-tab value="npcs" prepend-icon="cc:npc">
            NPCs ({{ filteredNpcs.length }})
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <!-- Pilots Tab -->
          <v-window-item value="pilots">
            <div v-if="filteredPilots.length === 0" class="text-center py-6 text-grey">
              <v-icon icon="mdi-account-off" size="large" class="mb-2" />
              <div>Nenhum piloto encontrado.</div>
            </div>
            <v-list v-else density="compact" class="bg-transparent pa-0 sheet-list" style="max-height: 280px; overflow-y: auto;">
              <v-list-item
                v-for="pilot in filteredPilots"
                :key="pilot.ID"
                :value="pilot.ID"
                :active="selectedId === pilot.ID"
                color="accent"
                class="mb-1 border border-grey-darken-3 rounded-0"
                @click="selectSheet('pilot', pilot.ID, pilot.Callsign || pilot.Name, pilot)"
              >
                <template #prepend>
                  <v-avatar size="32" color="primary" class="mr-2 rounded-0">
                    <v-icon icon="cc:pilot" size="18" color="white" />
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-bold">
                  {{ pilot.Callsign || pilot.Name }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-grey">
                  {{ pilot.ActiveMech ? `Mecha: ${pilot.ActiveMech.Name} (${pilot.ActiveMech.Frame?.Name || 'GMS Everest'})` : `Piloto: ${pilot.Name}` }}
                  • LL {{ pilot.Level }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-window-item>

          <!-- NPCs Tab -->
          <v-window-item value="npcs">
            <div v-if="filteredNpcs.length === 0" class="text-center py-6 text-grey">
              <v-icon icon="mdi-robot-off" size="large" class="mb-2" />
              <div>Nenhum NPC encontrado.</div>
            </div>
            <v-list v-else density="compact" class="bg-transparent pa-0 sheet-list" style="max-height: 280px; overflow-y: auto;">
              <v-list-item
                v-for="npc in filteredNpcs"
                :key="npc.ID"
                :value="npc.ID"
                :active="selectedId === npc.ID"
                color="accent"
                class="mb-1 border border-grey-darken-3 rounded-0"
                @click="selectSheet('npc', npc.ID, npc.Name, npc)"
              >
                <template #prepend>
                  <v-avatar size="32" color="secondary" class="mr-2 rounded-0">
                    <v-icon icon="cc:npc" size="18" color="white" />
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-bold">
                  {{ npc.Name }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-grey">
                  {{ (npc as any).NpcClass?.Name || 'Classe Padrão' }} • Nível {{ (npc as any).Tier || 1 }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-window-item>
        </v-window>
      </v-card-text>

      <!-- Actions -->
      <v-card-actions class="pa-4 bg-grey-darken-3 border-t border-grey-darken-2 d-flex justify-space-between">
        <v-btn
          v-if="currentBinding"
          color="error"
          variant="text"
          size="small"
          prepend-icon="mdi-link-off"
          @click="unbind"
        >
          Desvincular
        </v-btn>
        <div v-else />

        <div class="d-flex ga-2">
          <v-btn
            variant="text"
            size="small"
            @click="isOpen = false"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="accent"
            variant="flat"
            size="small"
            :disabled="!selectedId"
            prepend-icon="mdi-check-bold"
            @click="bindSelected"
          >
            Vincular Ficha
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { PilotStore } from '@/features/pilot_management/store'
import { NpcStore } from '@/features/gm/store/npc_store'
import { obrBridge } from '@/services/obrBridge'
import type { TokenSheetBinding } from '@/types/compcon-obr'
import OBR from '@owlbear-rodeo/sdk'

const isOpen = ref(false)
const activeTab = ref<'pilots' | 'npcs'>('pilots')
const searchQuery = ref('')
const selectedTokenId = ref<string | null>(null)
const tokenName = ref<string>('')
const currentBinding = ref<TokenSheetBinding | null>(null)

const selectedType = ref<'pilot' | 'npc'>('pilot')
const selectedId = ref<string | null>(null)
const selectedName = ref<string>('')
const selectedItemRef = ref<any>(null)

const pilotStore = PilotStore()
const npcStore = NpcStore()

const filteredPilots = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return pilotStore.Pilots
  return pilotStore.Pilots.filter(p => {
    const callsign = (p.Callsign || '').toLowerCase()
    const name = (p.Name || '').toLowerCase()
    const mechName = (p.ActiveMech?.Name || '').toLowerCase()
    return callsign.includes(query) || name.includes(query) || mechName.includes(query)
  })
})

const filteredNpcs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return npcStore.Npcs
  return npcStore.Npcs.filter(n => {
    const name = (n.Name || '').toLowerCase()
    const className = ((n as any).NpcClass?.Name || '').toLowerCase()
    return name.includes(query) || className.includes(query)
  })
})

function selectSheet(type: 'pilot' | 'npc', id: string, name: string, item: any) {
  selectedType.value = type
  selectedId.value = id
  selectedName.value = name
  selectedItemRef.value = item
}

/**
 * O token guarda apenas o LINK (sheetId). O nome exibido é resolvido agora, a
 * partir da ficha no armazenamento local — nada de cópia da ficha no token.
 */
function resolveSheetName(type: 'pilot' | 'npc', sheetId: string): string {
  if (!sheetId) return ''
  if (type === 'pilot') {
    const pilot = pilotStore.Pilots.find((p: any) => p.ID === sheetId)
    if (pilot) return pilot.Callsign || pilot.Name || sheetId
  }
  const npc = npcStore.Npcs.find((n: any) => n.ID === sheetId)
  if (npc) return npc.Name || sheetId
  return sheetId
}

const bindingLabel = computed(() => {
  if (!currentBinding.value) return ''
  return resolveSheetName(currentBinding.value.sheetType, currentBinding.value.sheetId)
})

async function handleBindRequested(event: Event) {
  const customEvent = event as CustomEvent<{ tokenIds: string[]; token?: any }>
  const tokenIds = customEvent.detail?.tokenIds
  if (!tokenIds || tokenIds.length === 0) return

  selectedTokenId.value = tokenIds[0]
  selectedId.value = null
  selectedItemRef.value = null

  if (OBR.isAvailable) {
    try {
      const items = await OBR.scene.items.getItems([tokenIds[0]])
      if (items.length > 0) {
        tokenName.value = items[0].name || `Token (${tokenIds[0].substring(0, 6)})`
      }
    } catch {
      tokenName.value = `Token (${tokenIds[0].substring(0, 6)})`
    }
  }

  // Verifica se o token já tem vínculo (só IDs) e resolve o nome pela ficha local
  currentBinding.value = await obrBridge.getTokenBinding(selectedTokenId.value)
  if (currentBinding.value) {
    selectedType.value = currentBinding.value.sheetType
    selectedId.value = currentBinding.value.sheetId
    selectedName.value = resolveSheetName(currentBinding.value.sheetType, currentBinding.value.sheetId)
    activeTab.value = currentBinding.value.sheetType === 'pilot' ? 'pilots' : 'npcs'
  }

  isOpen.value = true
}

async function bindSelected() {
  if (!selectedTokenId.value || !selectedId.value) return

  const binding: TokenSheetBinding = {
    sheetType: selectedType.value,
    sheetId: selectedId.value,
    name: selectedName.value,
  }

  if (selectedType.value === 'pilot' && selectedItemRef.value?.ActiveMech) {
    const mech = selectedItemRef.value.ActiveMech
    binding.mechId = mech.ID
    binding.hp = { current: mech.CurrentHP ?? mech.MaxHP, max: mech.MaxHP }
    binding.heat = { current: mech.CurrentHeat ?? 0, max: mech.HeatCap }
    binding.structure = { current: mech.CurrentStructure ?? mech.MaxStructure, max: mech.MaxStructure }
    binding.stress = { current: mech.CurrentStress ?? mech.MaxStress, max: mech.MaxStress }
    binding.statuses = (mech.CombatController?.Statuses || []).map((s: any) => s.status.ID)
  } else if (selectedType.value === 'npc' && selectedItemRef.value) {
    const n = selectedItemRef.value as any
    if (n.Stats) {
      binding.hp = { current: n.CurrentHP ?? n.Stats.HP, max: n.Stats.HP }
      binding.heat = { current: n.CurrentHeat ?? 0, max: (n.Stats.HeatCap || 0) }
      binding.structure = { current: n.CurrentStructure ?? (n.Stats.Structure || 1), max: (n.Stats.Structure || 1) }
      binding.stress = { current: n.CurrentStress ?? (n.Stats.Stress || 1), max: (n.Stats.Stress || 1) }
      binding.statuses = (n.CombatController?.Statuses || []).map((s: any) => s.status.ID)
    }
  }

  await obrBridge.bindTokenToSheet(selectedTokenId.value, binding)
  isOpen.value = false
}

async function unbind() {
  if (!selectedTokenId.value) return
  await obrBridge.unbindToken(selectedTokenId.value)
  currentBinding.value = null
  selectedId.value = null
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('compcon-bind-token-requested', handleBindRequested)
})

onUnmounted(() => {
  window.removeEventListener('compcon-bind-token-requested', handleBindRequested)
})
</script>

<style scoped>
.token-link-dialog :deep(.v-card) {
  border: 1px solid rgba(var(--v-theme-accent), 0.4);
}

.sheet-list::-webkit-scrollbar {
  width: 6px;
}

.sheet-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}
</style>
