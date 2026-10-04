<template>
  <div class="action-input-container pa-2 border-t flex-shrink-0">
    <!-- Seletor de Identidade do Emissor -->
    <div class="d-flex align-center justify-space-between mb-1">
      <div class="d-flex align-center ga-1 text-caption text-disabled">
        <v-icon icon="mdi-account" size="14" color="accent" />
        <span>Falar como:</span>
      </div>

      <v-menu location="top end">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            variant="text"
            size="x-small"
            color="accent"
            class="font-weight-bold px-1"
            append-icon="mdi-chevron-down"
          >
            {{ speakerName }}
          </v-btn>
        </template>
        <v-list density="compact" class="bg-grey-darken-4 border-accent pa-1">
          <v-list-item
            v-for="s in availableSpeakers"
            :key="s.name"
            :title="s.name"
            :subtitle="s.role"
            density="compact"
            class="my-1 rounded-0"
            @click="selectSpeaker(s.name, s.type)"
          />
        </v-list>
      </v-menu>
    </div>

    <!-- Campo de Entrada de Texto -->
    <v-form @submit.prevent="handleSendMessage">
      <div class="d-flex align-center ga-1">
        <v-text-field
          v-model="messageText"
          placeholder="Mensagem ou declaração de ação..."
          density="compact"
          variant="outlined"
          hide-details
          bg-color="background"
          class="chat-text-input"
          @keydown.enter.prevent="handleSendMessage"
        >
          <template #append-inner>
            <v-btn
              icon="mdi-send"
              size="x-small"
              variant="text"
              color="accent"
              :disabled="!messageText.trim()"
              @click="handleSendMessage"
            />
          </template>
        </v-text-field>
      </div>
    </v-form>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
  import { PilotStore } from '@/features/pilot_management/store'
  import { EncounterStore } from '@/features/gm/store/encounter_store'

  const tableActionStore = useTableActionStore()
  const messageText = ref('')
  const speakerName = ref('Piloto')
  const speakerType = ref<'pilot' | 'npc' | 'gm'>('pilot')

  interface SpeakerOption {
    name: string
    role: string
    type: 'pilot' | 'npc' | 'gm'
  }

  const availableSpeakers = computed<SpeakerOption[]>(() => {
    const list: SpeakerOption[] = []

    // 1. Piloto Ativo da ficha
    const activeSheetId = PilotSheetStore().CurrentActiveID
    if (activeSheetId) {
      const sheet = PilotSheetStore().GetSheet(activeSheetId)
      if (sheet) {
        const callsign = sheet.Combatant?.actor?.Callsign || sheet.Name
        list.push({ name: callsign, role: 'Piloto Ativo', type: 'pilot' })
        if (sheet.Combatant?.actor?.ActiveMech?.Name) {
          list.push({ name: sheet.Combatant.actor.ActiveMech.Name, role: 'Mecha Ativo', type: 'pilot' })
        }
      }
    }

    // 2. Outros pilotos locais
    const pilots = PilotStore().Pilots
    for (const p of pilots.slice(0, 5)) {
      const pName = p.Callsign || p.Name
      if (!list.some(s => s.name === pName)) {
        list.push({ name: pName, role: 'Piloto', type: 'pilot' })
      }
    }

    // 3. Opção de Mestre
    list.push({ name: 'Mestre', role: 'Narrador / GM', type: 'gm' })

    return list
  })

  onMounted(() => {
    if (availableSpeakers.value.length > 0) {
      speakerName.value = availableSpeakers.value[0].name
      speakerType.value = availableSpeakers.value[0].type
      tableActionStore.activeActorName = speakerName.value
      tableActionStore.activeActorType = speakerType.value
    }
  })

  function selectSpeaker(name: string, type: 'pilot' | 'npc' | 'gm') {
    speakerName.value = name
    speakerType.value = type
    tableActionStore.activeActorName = name
    tableActionStore.activeActorType = type
  }

  async function handleSendMessage() {
    const text = messageText.value.trim()
    if (!text) return

    messageText.value = ''
    await tableActionStore.postChat(text, speakerName.value, speakerType.value)
  }
</script>

<style scoped>
  /* Rodapé fixo do chat: fica sempre visível na base do painel, sem encolher e
     sem ser empurrado para fora quando o feed de mensagens cresce ou rola. */
  .action-input-container {
    position: sticky;
    bottom: 0;
    z-index: 3;
    flex-shrink: 0;
    background: rgba(14, 18, 24, 0.98);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.45);
  }

  .chat-text-input :deep(.v-field__input) {
    font-size: 13px;
    padding-top: 6px;
    padding-bottom: 6px;
  }
</style>
