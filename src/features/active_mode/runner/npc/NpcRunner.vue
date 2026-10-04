<template>
  <div
    v-if="!encounterInstance || !combatant"
    :key="npcId"
  >
    <v-progress-linear
      indeterminate
      color="primary"
      height="20"
      class="my-5"
    />
    <div class="text-center text-cc-overline">{{ $t('active.gmRunner.loading') }}</div>
  </div>
  <div
    v-else
    class="cc-fill cc-fill-root"
  >
    <div
      class="cc-fill"
      style="overflow: hidden"
    >
      <v-layout style="height: 100%; flex: 1 1 auto; min-height: 0">
        <v-main
          tabindex="0"
          style="overflow-y: auto"
        >
          <v-container
            fluid
            class="pb-12"
          >
            <component
              :is="typeMap[combatant.type]"
              :key="combatant.id"
              :combatant="combatant"
              :encounter-instance="encounterInstance"
            />

            <v-row
              dense
              justify="end"
            >
              <v-col cols="auto">
                <actor-logs
                  :actor="combatant.actor"
                  :encounter-instance="encounterInstance"
                />
              </v-col>
              <v-col cols="auto">
                <combat-statblock-export
                  :actor="combatant.actor"
                  :encounter-instance="encounterInstance"
                />
              </v-col>
            </v-row>
          </v-container>
        </v-main>
      </v-layout>
    </div>

    <v-dialog
      v-model="diceDialog"
      max-height="80vh"
      max-width="80vw"
    >
      <gm-dice-roller
        :encounter-instance="encounterInstance"
        :selected="combatant"
        @close="diceDialog = false"
      />
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, reactive, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NpcStore, EncounterStore } from '@/stores'
  import { Encounter } from '@/classes/encounter/Encounter'
  import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { obrBridge } from '@/services/obrBridge'
  import UnitPanel from '../gm/EncounterPanels/UnitPanel.vue'
  import DoodadPanel from '../gm/EncounterPanels/DoodadPanel.vue'
  import EidolonPanel from '../gm/EncounterPanels/EidolonPanel.vue'
  import GmDiceRoller from '../gm/_components/GmDiceRoller.vue'
  import ActorLogs from '../gm/EncounterPanels/_components/ActorLogs.vue'
  import CombatStatblockExport from '../gm/EncounterPanels/_components/CombatStatblockExport.vue'
  import { combatantCombatVersion } from '../_shared/combatVersion'

  const typeMap: Record<string, any> = {
    unit: UnitPanel,
    doodad: DoodadPanel,
    eidolon: EidolonPanel,
  }

  const props = withDefaults(defineProps<{ id?: string | null }>(), { id: null })

  const route = useRoute()
  const diceDialog = ref(false)

  const npcId = computed(() => (props.id || (route.params.id as string) || '') as string)

  // Encontro geral compartilhado (fonte de verdade da mesa)
  const sharedEncounter = computed(() => {
    const store = EncounterStore()
    return store.getActiveEncounter(store.CurrentActiveID) ?? null
  })

  // Combatente do NPC dentro do encontro compartilhado
  const encounterCombatant = computed(() => {
    const enc = sharedEncounter.value
    const id = npcId.value
    if (!enc || !id) return null
    return (
      enc.Combatants.find(
        (c: any) =>
          ['unit', 'doodad', 'eidolon'].includes(c.type) &&
          (c.actor?.OriginId === id || c.actor?.ID === id)
      ) ?? null
    )
  })

  // Fallback transitório (sem encontro ativo): pré-visualiza a ficha de combate do NPC
  const fallbackInstance = computed(() => {
    if (encounterCombatant.value || !npcId.value) return null
    const npc = NpcStore().getNpcByID(npcId.value)
    if (!npc) return null
    const type = npc.ItemType.toLowerCase()
    const combatant = Encounter.DeserializeCombatant({
      type,
      actor: (npc as any).CreateInstance(),
      id: crypto.randomUUID(),
      index: 0,
      number: 1,
      side: 'enemy',
    })
    const encounter = new Encounter()
    encounter.Combatants = [combatant]
    const instance = new EncounterInstance(undefined, encounter, [], [])
    instance.Autosave = false
    // Precisa ser reativo para que os painéis (colapsar, editar PV, status) reflitam na UI
    return reactive(instance) as unknown as EncounterInstance
  })

  const encounterInstance = computed(() => sharedEncounter.value ?? fallbackInstance.value)
  const combatant = computed(() => {
    if (encounterCombatant.value) return encounterCombatant.value
    return fallbackInstance.value?.Combatants[0] ?? null
  })

  // Garante que o encontro geral esteja carregado antes de resolver o combatente
  onMounted(async () => {
    const store = EncounterStore()
    if (!store.ActiveEncounters.length) {
      await store.LoadActiveEncounters()
    }

    // Cria automaticamente o token no Owlbear Rodeo a partir do NPC do roster
    // (usa o ID estável do NPC, não a instância efêmera do encontro)
    const npc = NpcStore().getNpcByID(npcId.value)
    if (npc) {
      void obrBridge.createTokenForSheet(npc, 'npc').catch(() => {})
    }
  })

  // Salva localmente as mudanças de combate do NPC no encontro geral.
  // A versão agregada cobre camadas de eidolon e deployables além do ator.
  let syncTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    () => (combatant.value ? combatantCombatVersion(combatant.value) : 0),
    () => {
      const enc = sharedEncounter.value
      if (!enc) return
      if (syncTimeout) clearTimeout(syncTimeout)
      syncTimeout = setTimeout(() => {
        void enc.Save?.()
      }, 600)
    }
  )
</script>
