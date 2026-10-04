<template>
  <div
    v-if="!encounterInstance || !combatant"
    :key="npcId"
  >
    <template v-if="loading || !settled">
      <v-progress-linear
        indeterminate
        color="primary"
        height="20"
        class="my-5"
      />
      <div class="text-center text-cc-overline">{{ $t('active.gmRunner.loading') }}</div>
    </template>

    <!-- Nada de spinner eterno: quando a busca termina sem achar o NPC em nenhum
         encontro ativo nem no roster local, a janela diz isso e deixa tentar de novo. -->
    <div
      v-else
      class="text-center pa-6"
    >
      <v-icon
        icon="mdi-book-alert-outline"
        size="40"
        color="warning"
        class="mb-2"
      />
      <div class="text-subtitle-2 font-weight-bold">{{ $t('active.npcRunner.notFoundTitle') }}</div>
      <div class="text-caption text-grey-lighten-1 mb-3">
        {{ $t('active.npcRunner.notFoundHint', { id: npcId || '—' }) }}
      </div>
      <div
        v-if="!storageIsDurable"
        class="text-caption text-warning mb-3"
      >
        {{ $t('active.npcRunner.storageWarning') }}
      </div>
      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="mdi-refresh"
        @click="loadSources"
      >
        {{ $t('active.npcRunner.retry') }}
      </v-btn>
    </div>
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
  import { ref, shallowRef, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NpcStore, EncounterStore } from '@/stores'
  import { Encounter } from '@/classes/encounter/Encounter'
  import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { obrBridge } from '@/services/obrBridge'
  import { GetAll, storageDriver, storageIsDurable } from '@/io/Storage'
  import UnitPanel from '../gm/EncounterPanels/UnitPanel.vue'
  import DoodadPanel from '../gm/EncounterPanels/DoodadPanel.vue'
  import EidolonPanel from '../gm/EncounterPanels/EidolonPanel.vue'
  import GmDiceRoller from '../gm/_components/GmDiceRoller.vue'
  import ActorLogs from '../gm/EncounterPanels/_components/ActorLogs.vue'
  import CombatStatblockExport from '../gm/EncounterPanels/_components/CombatStatblockExport.vue'
  import { combatantCombatVersion } from '../_shared/combatVersion'
  import { combatantMatchesSheetId, findEncounterForNpc, findNpcCombatant } from '../_shared/npcSheetLookup'

  const typeMap: Record<string, any> = {
    unit: UnitPanel,
    doodad: DoodadPanel,
    eidolon: EidolonPanel,
  }

  const props = withDefaults(defineProps<{ id?: string | null }>(), { id: null })

  const route = useRoute()
  const diceDialog = ref(false)

  const npcId = computed(() => (props.id || (route.params.id as string) || '') as string)

  const encounterStore = EncounterStore()

  // Encontro que CONTÉM este NPC, procurado em todos os encontros ativos — com o
  // `current_active_encounter_id` desta janela na frente da fila.
  //
  // Este iframe tem o seu próprio Pinia: ele só sabe do encontro o que leu do
  // IndexedDB. O id ativo é gravado por OUTRA janela e pode chegar depois desta
  // montar, então depender só dele (e só do roster local) prendia a ficha de um NPC
  // importado por sharecode/JSON — que não existe no roster local — em
  // "Carregando instância do encontro…" para sempre.
  const matchingEncounter = computed<EncounterInstance | null>(() => {
    return (
      (findEncounterForNpc(
        encounterStore.ActiveEncounters as any[],
        npcId.value,
        encounterStore.CurrentActiveID
      ) as EncounterInstance) ?? null
    )
  })

  // Combatente do NPC dentro do encontro que o contém
  const encounterCombatant = computed(() =>
    matchingEncounter.value ? findNpcCombatant(matchingEncounter.value, npcId.value) : null
  )

  // Fallback transitório (sem encontro ativo com este NPC): pré-visualiza a ficha de combate do NPC
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

  /**
   * Encontro com este NPC montado direto do registro do storage, quando o store
   * desta janela não o tem (ver `recoverEncounterFromStorage`).
   *
   * `shallowRef` de propósito: o objeto guardado já é reativo por dentro
   * (`reactive`), e o tipo exposto continua sendo `EncounterInstance` — um `ref`
   * profundo transformaria o valor no tipo do proxy e quebrava os painéis.
   */
  const recoveredInstance = shallowRef<EncounterInstance | null>(null)

  const encounterInstance = computed(
    () => matchingEncounter.value ?? recoveredInstance.value ?? fallbackInstance.value
  )
  const combatant = computed(() => {
    if (encounterCombatant.value) return encounterCombatant.value
    // Encontro recuperado direto do storage (o store desta janela não o tinha).
    const recovered = recoveredInstance.value
    if (recovered) {
      const hit = findNpcCombatant(recovered, npcId.value)
      if (hit) return hit
    }
    return fallbackInstance.value?.Combatants[0] ?? null
  })

  /** Instância usada para gravar as mudanças de combate desta ficha (se houver). */
  function instanceToSave(): EncounterInstance | null {
    return matchingEncounter.value ?? recoveredInstance.value ?? null
  }

  /**
   * Lê as fontes compartilhadas (IndexedDB) antes de desistir do NPC.
   *
   * Reler é obrigatório, não otimização: o encontro é gravado pela janela do
   * tracker e o aviso de mudança não é garantido — `EncounterInstance.Save()` é
   * throttle de 1,5s, fire-and-forget e não notifica ninguém. Sem a releitura, esta
   * janela ficava com a cópia velha (sem o NPC recém-adicionado) para sempre.
   */
  const loading = ref(false)
  const settled = ref(false)

  async function loadSources() {
    loading.value = true
    try {
      await encounterStore.LoadEncounters().catch(() => {})

      // O roster também é lido só no boot desta janela: um NPC criado/importado
      // depois (ou recebido da sala) não existia aqui. Revalidar o id pedido — e não
      // só "a lista está vazia" — cobre o `getNpcByID` falhando com roster velho.
      const roster = NpcStore()
      if (!roster.Npcs.length || !roster.getNpcByID(npcId.value)) {
        await roster.LoadNpcs().catch(() => {})
      }

      if (!combatant.value) {
        recoveredInstance.value = await recoverEncounterFromStorage(npcId.value)
      }
    } finally {
      loading.value = false
      settled.value = true
      if (!combatant.value) {
        console.warn(
          `[NpcRunner] NPC "${npcId.value || '(sem id)'}" não encontrado: ` +
            `${encounterStore.ActiveEncounters?.length ?? 0} encontro(s) ativo(s), ` +
            `${NpcStore().Npcs.length} NPC(s) no roster, storage=${storageDriver.value}` +
            (storageIsDurable.value
              ? '.'
              : ' (NÃO durável: esta janela não enxerga os dados da outra janela.)')
        )
      }
    }
  }

  /**
   * Último recurso: montar o encontro direto do registro em `active_encounters`.
   *
   * Cobre o registro que o store desta janela não tem — descartado pelo merge ou
   * cuja deserialização falhou no `LoadEncounters` — sem depender de nova escrita da
   * outra janela. Também é o que diz, no console, ONDE o id existe de fato.
   */
  async function recoverEncounterFromStorage(id: string): Promise<EncounterInstance | null> {
    if (!id) return null

    let records: any[] = []
    try {
      records = (await GetAll('active_encounters')) as any[]
    } catch (err) {
      console.warn('[NpcRunner] Falha ao ler `active_encounters` do storage:', err)
      return null
    }

    const match = records.find(record =>
      (record?.combatants ?? []).some((c: any) => combatantMatchesSheetId(c, id))
    )

    if (!match) {
      console.warn(
        `[NpcRunner] NPC "${id}" não está em nenhum dos ${records.length} registro(s) de ` +
          '`active_encounters` desta janela — foi gravado sem esse combatente, ou o id ' +
          'enviado não é o que ficou no encontro.'
      )
      return null
    }

    try {
      const instance = EncounterInstance.Deserialize(match)
      console.log(
        `[NpcRunner] Encontro "${instance.ID}" recuperado direto do storage para o NPC "${id}".`
      )
      return reactive(instance) as unknown as EncounterInstance
    } catch (err) {
      console.warn(
        `[NpcRunner] O encontro "${match?.id}" contém o NPC "${id}" no storage, mas falhou ao carregar:`,
        err
      )
      return null
    }
  }

  // Garante que as fontes estejam carregadas antes de resolver o combatente
  onMounted(async () => {
    void loadSources()

    // Cria automaticamente o token no Owlbear Rodeo a partir do NPC do roster
    // (usa o ID estável do NPC, não a instância efêmera do encontro)
    const npc = NpcStore().getNpcByID(npcId.value)
    if (npc) {
      void obrBridge.createTokenForSheet(npc, 'npc').catch(() => {})
    }
  })

  // Trocar de ficha na mesma janela (mesma rota, outro :id) recomeça a busca.
  watch(npcId, () => {
    settled.value = false
    // Trocar de ficha descarta o encontro recuperado da ficha anterior.
    recoveredInstance.value = null
    void loadSources()
  })

  // O bridge avisa quando o storage de encontros mudou em outra janela.
  function onEncountersReloaded() {
    void loadSources()
  }

  onMounted(() => window.addEventListener('compcon-encounters-reloaded', onEncountersReloaded))
  onUnmounted(() => window.removeEventListener('compcon-encounters-reloaded', onEncountersReloaded))

  // Salva localmente as mudanças de combate do NPC no encontro geral.
  // A versão agregada cobre camadas de eidolon e deployables além do ator.
  let syncTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    () => (combatant.value ? combatantCombatVersion(combatant.value) : 0),
    () => {
      const enc = instanceToSave()
      if (!enc) return
      if (syncTimeout) clearTimeout(syncTimeout)
      syncTimeout = setTimeout(() => {
        void enc.Save?.()
      }, 600)
    }
  )
</script>
