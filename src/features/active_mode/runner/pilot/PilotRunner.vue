<template>
  <div
    v-if="!sheet"
    :key="sheetID"
  >
    <!-- A busca terminou sem ficha: nada de spinner eterno. -->
    <div
      v-if="sheetLookupFailed"
      class="text-center py-8 px-4"
    >
      <v-icon
        icon="mdi-file-question-outline"
        size="40"
        class="text-accent mb-2"
      />
      <div class="text-subtitle-2 font-weight-bold mb-1">
        {{ $t('active.pilotRunner.notFoundTitle') }}
      </div>
      <div class="text-caption text-grey-lighten-1">
        {{ $t('active.pilotRunner.notFoundHint') }}
      </div>
    </div>

    <template v-else>
      <v-progress-linear
        indeterminate
        color="primary"
        height="20"
        class="my-5"
      />
      <div class="text-center text-cc-overline">{{ $t('active.pilotRunner.loading') }}</div>
    </template>
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
          style="overflow-y: auto; height: 100%; max-height: 100%; min-height: 0;"
        >
          <v-container
            fluid
            class="pb-12"
          >
            <div>
              <v-alert
                v-if="readOnly"
                type="info"
                variant="tonal"
                density="compact"
                class="rounded-0 mb-2"
                icon="mdi-eye-outline"
              >
                {{ $t('active.pilotRunner.readOnlyBanner') }}
              </v-alert>

              <div :class="{ 'readonly-view': readOnly }">
                <div v-if="panel && sheet">
                  <component
                    :is="panelMap[panel]"
                    :key="panel"
                    :combatant="combatant"
                    :encounter="encounterInstance.Encounter"
                    :selected="pilot"
                    :sheet="sheet"
                    pc
                    :encounter-instance="encounterInstance"
                  />
                </div>
              </div>

              <v-row
                dense
                justify="end"
              >
                <v-col cols="auto">
                  <actor-telemetry
                    :actor="pilot"
                    :encounter-instance="encounterInstance"
                  />
                </v-col>
                <v-col cols="auto">
                  <actor-logs
                    :actor="pilot"
                    :encounter-instance="encounterInstance"
                  />
                </v-col>
                <v-col cols="auto">
                  <combat-statblock-export
                    :actor="pilot"
                    :encounter-instance="encounterInstance"
                  />
                </v-col>
              </v-row>
            </div>
          </v-container>
        </v-main>



        <v-footer
          app
          height="36"
          class="bg-panel"
          style="position: fixed !important; bottom: 0px !important; left: 0px !important; right: 0px !important; width: 100% !important; z-index: 1000 !important; border-top: 1px solid rgba(255, 255, 255, 0.1);"
        >
          <v-row
            justify="space-between"
            align="center"
            no-gutters
          >
            <v-col>
              <pc-end-round v-if="!readOnly" :sheet="sheet" />
            </v-col>
            <v-col>
              <pc-end-encounter v-if="!readOnly" :sheet="sheet" />
            </v-col>
          </v-row>
        </v-footer>
      </v-layout>
    </div>

    <v-dialog
      v-model="diceDialog"
      :fullscreen="mobile"
      max-height="80vh"
      max-width="80vw"
    >
      <gm-dice-roller
        :encounter-instance="encounterInstance"
        :selected="combatant"
        @close="diceDialog = false"
      />
    </v-dialog>

    <v-dialog
      v-model="tableDialog"
      :fullscreen="mobile"
      max-width="80vw"
    >
      <rollable-table-index
        :instance="encounterInstance"
        :selected="combatant"
        @close="tableDialog = false"
      />
    </v-dialog>

    <runner-leave-dialog
      v-model="leaveDialog"
      @save="handleLeave('save')"
      @exit="handleLeave('exit')"
      @cancel="handleLeave('cancel')"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useRoute, onBeforeRouteLeave, matchedRouteKey } from 'vue-router'
  import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
  import PilotSheet from '@/features/pilot_management/store/PilotSheet'
  import { PilotStore } from '@/features/pilot_management/store'
  import { EncounterStore } from '@/stores'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import type { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { obrBridge } from '@/services/obrBridge'
  import { tableSyncSocket, roomSyncedSheets } from '@/services/tableSyncSocket'
  import { createCoalescedDispatcher } from '@/services/coalescedDispatcher'
  import {
    activeMechIndex,
    mechCombatActionsPath,
    mechStatsPath,
    mechStatusesPath,
    patchFieldKey,
    patchFieldTarget,
  } from '@/services/sheetSyncPaths'
  import {
    coreActivePath,
    corePowerPath,
    equipmentDestroyedRefs,
  } from '@/services/sheetEquipmentPaths'
  import ActorTelemetry from '../gm/EncounterPanels/_components/ActorTelemetry.vue'
  import ActorLogs from '../gm/EncounterPanels/_components/ActorLogs.vue'
  import CombatStatblockExport from '../gm/EncounterPanels/_components/CombatStatblockExport.vue'
  import QuickReferencePanel from '../gm/InfoPanels/QuickReferencePanel.vue'
  import ReferenceTagPanel from '../gm/InfoPanels/ReferenceTagPanel.vue'
  import RollableTableIndex from '../gm/_components/RollableTableIndex.vue'
  import GmDiceRoller from '../gm/_components/GmDiceRoller.vue'
import { Pilot } from '@/classes/pilot/Pilot'
  import GmToolPalette from '../gm/_components/GmToolPalette.vue'
  import PcPanel from '../gm/EncounterPanels/PcPanel.vue'
  import NotesPanel from './_components/PcNotesPanel.vue'
  import OptionsPanel from './_components/PcOptionsPanel.vue'
  import DeployablesPanel from './_components/PcDeployablesPanel.vue'
  import PcEndRound from './_components/PcEndRound.vue'
  import PcEndEncounter from './_components/PcEndEncounter.vue'
  import RunnerLeaveDialog from '../_shared/_RunnerLeaveDialog.vue'
  import { consumeLeaveGuardBypass } from '../_shared/useRunnerOptions'
  import { combatantCombatVersion } from '../_shared/combatVersion'
  import { setSheetReadOnlySession } from '@/services/sheetReadOnlySession'
  import CcPanelToggle from '@/ui/components/buttons/CCPanelToggle.vue'

const panelMap: Record<string, any> = {
    pc: PcPanel,
    deployables: DeployablesPanel,
    notes: NotesPanel,
  'reference-tag': ReferenceTagPanel,
  'quick-reference': QuickReferencePanel,
    options: OptionsPanel,
  }

  const props = withDefaults(defineProps<{ id?: string | null }>(), { id: null })

  const { mdAndDown: mobile } = useDisplay()
  const route = useRoute()

  const showRight = ref(false)
  const panel = ref('pc')
  const diceDialog = ref(false)
  const tableDialog = ref(false)
  const leaveDialog = ref(false)
  let resolveLeaveDialog: ((value: string) => void) | null = null

  /**
   * Modo leitura (`?readonly=1`): visão da ficha **sem nenhuma escrita** — não anuncia
   * entrada em combate, não manda deltas, não salva, não marca ficha ativa e não cria
   * token. Usada pelo Mestre para olhar a ficha de um jogador (e pelo próprio jogador
   * para conferir sem mexer no estado da mesa).
   */
  const readOnly = computed(() => String(route.query.readonly ?? '') === '1')
  /** Ficha efêmera do modo leitura (não entra em `pilot_sheets`). */
  const readOnlySheet = ref<any>(null)

  /**
   * A busca pela ficha terminou sem resultado?
   *
   * Sem isto a tela ficava no "Carregando ficha do piloto…" para sempre quando a ficha
   * não estava nesta janela nem na sala.
   */
  const sheetLookupFailed = ref(false)

  /**
   * Procura o piloto pelo id da FICHA viva ou pelo piloto de ORIGEM.
   *
   * Em `PilotInstance` o `OriginId` é o piloto base (conteúdo) e o `ID` é a ficha viva: a
   * sala guarda pelo `ID`, mas o alvo pode chegar como `OriginId` (ex.: um encontro
   * antigo, ou o botão de outra janela), então os dois valem.
   */
  function findPilotInStore(pilotStore: any, id: string): any | null {
    if (!id) return null
    const pilots = (pilotStore?.Pilots as any[]) ?? []
    return (
      pilots.find((p: any) => p.ID === id) ?? pilots.find((p: any) => p.OriginId === id) ?? null
    )
  }
  /**
   * Procura a ficha DESTA janela por id do container ou do piloto.
   *
   * Não usa `PilotSheetStore.GetSheet`: ele registra um `logger.error` ("No pilot sheet
   * found with ID …") para um caso que é normal — a ficha pode estar só na sala, e o
   * `onMounted` abaixo a pede ao TableSyncSocket.
   *
   * O tipo inferido do store é estruturalmente mais fraco que a classe (perde os membros
   * privados do `SaveController`), daí o cast na coleção com a busca em runtime.
   */
  function findLocalSheet(store: any, id: string): any | null {
    if (!id) return null
    return (
      (store.PilotSheets as any[])?.find(
        (ps: any) => !ps.SaveController?.IsDeleted && (ps.PilotID === id || ps.ID === id)
      ) ?? null
    )
  }

  // Enquanto esta ficha estiver em modo leitura, os serviços que desenham no token
  // (marcadores/trackers) ficam inertes nesta janela — ver `sheetReadOnlySession`.
  watch(readOnly, value => setSheetReadOnlySession(value), { immediate: true })

  const sheet = computed(() => {
    if (readOnlySheet.value) return readOnlySheet.value
    const store = PilotSheetStore()
    const targetId = props.id || (route.params.id as string) || store.CurrentActiveID
    if (!targetId) return null
    return findLocalSheet(store, targetId)
  })

  /**
   * A janela da ficha é REUTILIZADA: o botão "abrir ficha em modo leitura" troca o alvo
   * pela rota (`pilot-runner/:id?readonly=1`) e o componente não remonta — o `onMounted`
   * não roda de novo. Sem este watcher a tela ficava presa em "Carregando ficha do
   * piloto…" (ou mostrando a ficha anterior).
   */
  watch(
    [
      () => props.id,
      () => route.params.id as string,
      () => String(route.query.readonly ?? ''),
    ],
    async () => {
      if (!readOnly.value) {
        // Saiu do modo leitura: a `sheet` computada volta a resolver pela ficha local.
        readOnlySheet.value = null
        sheetLookupFailed.value = false
        return
      }

      readOnlySheet.value = null
      sheetLookupFailed.value = false
      await loadReadOnlySheet()
    }
  )

  onMounted(async () => {
    // Modo leitura: nada de store, de ficha ativa, de token ou de anúncio na sala.
    if (readOnly.value) {
      await loadReadOnlySheet()
      return
    }

    const sheetStore = PilotSheetStore()
    if (!sheetStore.PilotSheets?.length) {
      await sheetStore.LoadPilotSheets()
    }

    const targetId = (props.id || (route.params.id as string) || sheetStore.CurrentActiveID) as string
    if (targetId) {
      let targetSheet = findLocalSheet(sheetStore, targetId)
      if (targetSheet?.Archived) {
        targetSheet.Unarchive()
      }

      if (!targetSheet) {
        // Esta janela NÃO tem a ficha (outra janela criou, ou o armazenamento local
        // daqui não tem a coleção): pede a cópia viva da mesa ao TableSyncSocket e a
        // materializa aqui. É o que evita o "No pilot sheet found with ID … (0 carregadas)".
        const fromRoom = await tableSyncSocket.requestSheet(targetId)
        const pilotStore = PilotStore()
        if (!pilotStore.Pilots?.length) {
          await pilotStore.LoadPilots()
        }
        const roomPilotId = fromRoom?.id || fromRoom?.ID || targetId
        const pilotObj: any =
          findPilotInStore(pilotStore, roomPilotId) ?? findPilotInStore(pilotStore, targetId)

        if (pilotObj) {
          if (!pilotObj.ActiveMech && pilotObj.Mechs?.length) {
            pilotObj.ActiveMech = pilotObj.Mechs[0]
          }
          // Só a cópia da SALA preserva o estado: uma ficha local sem container é uma
          // ficha nova no runner (o container nasce zerado de propósito).
          await sheetStore.AddPilotSheet(pilotObj, undefined, {
            preserveCombatState: !!fromRoom,
          })
          targetSheet = findLocalSheet(sheetStore, sheetStore.CurrentActiveID)
        }
      }

      if (targetSheet && sheetStore.CurrentActiveID !== targetSheet.ID) {
        await sheetStore.SetActiveSheet(targetSheet.ID)
      }
    }

    // Cria automaticamente o token no Owlbear Rodeo para esta ficha (se habilitado)
    if (sheet.value && sheet.value.Combatant?.actor) {
      void obrBridge.createTokenForSheet(sheet.value.Combatant.actor, 'pilot').catch(() => {})
      await announceActiveSheetIfNeeded()
    }
  })

  /**
   * Monta a ficha EFÊMERA do modo leitura a partir da cópia que esta janela já tem.
   *
   * Prefere `PilotStore` (é a cópia que recebe os patches da sala) e preserva o estado
   * de combate — a visão precisa mostrar os PV/calor reais, não os máximos de uma ficha
   * de encontro recém-criada. Nada é gravado em `pilot_sheets`, `pilots` ou na ficha
   * ativa da janela.
   */
  async function loadReadOnlySheet(): Promise<void> {
    const targetId = (props.id || (route.params.id as string)) as string
    if (!targetId) {
      sheetLookupFailed.value = true
      return
    }

    const pilotStore = PilotStore()
    if (!pilotStore.Pilots?.length) {
      await pilotStore.LoadPilots().catch(() => {})
    }

    // A ficha pode estar só na sala (esta janela não tem nem `pilots` nem
    // `pilot_sheets`): pede a cópia viva ao TableSyncSocket antes de desistir.
    if (!findPilotInStore(pilotStore, targetId)) {
      await tableSyncSocket.requestSheet(targetId).catch(() => null)
    }

    const pilot: any = findPilotInStore(pilotStore, targetId)
    if (pilot) {
      if (!pilot.ActiveMech && pilot.Mechs?.length) pilot.ActiveMech = pilot.Mechs[0]
      try {
        readOnlySheet.value = PilotSheet.FromPilot(pilot, undefined, { preserveCombatState: true })
        return
      } catch (err) {
        console.warn('[PilotRunner] Falha ao montar a cópia do piloto em modo leitura:', err)
      }
    }

    // Sem o piloto nesta janela, cai para uma ficha já existente (sem unarchive/save).
    const sheetStore = PilotSheetStore()
    if (!sheetStore.PilotSheets?.length) {
      await sheetStore.LoadPilotSheets().catch(() => {})
    }
    readOnlySheet.value = findLocalSheet(sheetStore, targetId)

    // Terminou a busca sem ficha: a tela não pode ficar no "Carregando…" para sempre.
    if (!readOnlySheet.value) sheetLookupFailed.value = true
  }

  /**
   * Anuncia a ficha ativa para a sala **apenas** quando ela ainda não está lá.
   *
   * Reanunciar a cada montagem (reload, reabrir a janela) reenviava a cópia local por
   * cima do estado da mesa e marcava uma entrada em combate nova — o GM via o piloto
   * "entrando em combate" de novo e os PV/calor voltavam ao estado do join. Esperamos o
   * `INIT_SYNC` para saber o que a sala já tem antes de decidir.
   */
  async function announceActiveSheetIfNeeded(): Promise<void> {
    const currentSheet = sheet.value
    const p = currentSheet?.Combatant?.actor as Pilot | undefined
    if (!currentSheet || !p) return

    await waitForInitialSync()

    const known = roomSyncedSheets.value?.[p.ID]

    // O contador de versão da sala é monotônico e sobrevive ao reload; o servidor
    // descarta patches com `version` menor que a atual, então recomeçar de 1 depois de
    // um reload fazia as primeiras alterações serem ignoradas em silêncio.
    const roomVersion = Number(known?.version)
    if (Number.isFinite(roomVersion) && roomVersion >= patchVersion) {
      patchVersion = roomVersion
      console.log(`[PilotSync] Contador de versão continuando da sala (v${patchVersion}).`)
    }

    if (known?.inCombat) {
      console.log(`[PilotSync] Ficha de "${p.Callsign || p.Name}" (${p.ID}) já está ativa na sala (v${known.version}); sincronizando estado do combate...`)
      if (known.data) {
        hydrateCombatStateFromRoom(known.data)
      }
      return
    }

    console.log(`[PilotSync] PilotRunner montado para "${p.Callsign || p.Name}" (${p.ID}). Anunciando entrada em combate via WebSocket...`)
    tableSyncSocket.sendPilotJoinCombat({
      pilotId: p.ID,
      pilotData: Pilot.Serialize(p as any),
      activeMechId: p.ActiveMech?.ID,
      sheetId: currentSheet.ID,
      version: 1,
    })
  }

  /** Espera o primeiro `INIT_SYNC` (ou desiste) para não decidir com a sala desconhecida. */
  function waitForInitialSync(timeoutMs = 3000): Promise<void> {
    if (tableSyncSocket.HasSyncedRoom) return Promise.resolve()

    return new Promise<void>(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.removeEventListener('compcon-init-sync', finish)
        resolve()
      }

      window.addEventListener('compcon-init-sync', finish)
      setTimeout(finish, timeoutMs)
    })
  }
  const sheetID = computed(() => (sheet.value ? sheet.value.ID : 0))
  const pilot = computed(() => sheet.value!.Combatant.actor as Pilot)

  // Encontro geral compartilhado (fonte de verdade da mesa)
  const sharedEncounter = computed(() => {
    const store = EncounterStore()
    return store.getActiveEncounter(store.CurrentActiveID) ?? null
  })

  // Combatente do jogador dentro do encontro compartilhado
  const encounterCombatant = computed(() => {
    const enc = sharedEncounter.value
    if (!enc || !sheet.value) return null
    const p = sheet.value.Combatant.actor as Pilot
    return (
      enc.Combatants.find(
        (c: any) => c.type === 'pilot' && (c.actor.ID === p.ID || c.id === p.ID)
      ) ?? null
    )
  })

  // A ficha só existe depois que `onMounted` carrega o store, e os watchers
  // avaliam o valor inicial no setup: este acesso não pode estourar.
  const combatant = computed(
    () => (encounterCombatant.value ?? sheet.value?.Combatant) as CombatantData
  )
  const encounterInstance = computed(
    () => (sharedEncounter.value ?? sheet.value?.EncounterInstance) as EncounterInstance
  )

  // Autosave local: qualquer alteração de combate (PV, calor, ações, condições)
  // precisa sobreviver ao reload. O encontro ativo vive só nesta janela.
  //
  // O painel edita a cópia do combatente que está no encontro compartilhado
  // quando ele existe (`combatant`), e a ficha local quando não existe — então a
  // persistência segue a mesma escolha, senão gravamos um estado que ninguém
  // editou. A versão agregada cobre o mech (onde vivem PV/calor/ações).
  const combatStateSignal = computed(() => {
    // Sem ficha carregada (setup inicial) não há estado de combate para observar.
    if (!sheet.value) return 0
    return combatant.value ? combatantCombatVersion(combatant.value) : 0
  })

  /**
   * Coalescência das alterações de combate (PV, calor, estrutura, estresse, sobreescudo).
   *
   * Cada input da ficha mexe no `StatController` a cada tecla/clique; sem agrupar, cada
   * alteração vira um `PATCH_FIELD` na sala e um save. Com esta janela de debounce, uma
   * rajada de 1–4 alterações vira um único envio (com o valor final) e um único save; o
   * teto de espera impede que segurar um botão de +/- adie o envio indefinidamente.
   */
  const COMBAT_SYNC_DEBOUNCE_MS = 600
  const COMBAT_SYNC_MAX_WAIT_MS = 2000

  const combatSync = createCoalescedDispatcher({
    debounceMs: COMBAT_SYNC_DEBOUNCE_MS,
    maxWaitMs: COMBAT_SYNC_MAX_WAIT_MS,
    run: () => {
      broadcastCombatDeltas()
      persistCombatState()
    },
  })

  function persistCombatState() {
    // Modo leitura não grava nada (nem ficha local, nem encontro).
    if (readOnly.value) return
    const currentSheet = sheet.value
    if (!currentSheet) return
    const enc = sharedEncounter.value
    if (enc && encounterCombatant.value) {
      console.log(`[PilotSync] Salvando alterações de combate no encontro compartilhado "${enc.Name || enc.ID}"...`)
      // Grava localmente o encontro editado.
      void enc.Save?.()
    }
    console.log(`[PilotSync] Salvando alterações de combate na ficha local "${currentSheet.Name || currentSheet.ID}"...`)
    currentSheet.Save()
  }

  let lastDispatchedHp: number | undefined
  let lastDispatchedHeat: number | undefined
  let lastDispatchedStructure: number | undefined
  let lastDispatchedStress: number | undefined
  let lastDispatchedOvershield: number | undefined
  let lastDispatchedSpeed: number | undefined
  let lastDispatchedActions: string | undefined
  let lastDispatchedStatuses: string | undefined
  let lastDispatchedCorePower: boolean | undefined
  let lastDispatchedCoreActive: boolean | undefined
  /** Flag `destroyed` já enviado, por `caminho#ID do item`. */
  const lastDispatchedDestroyed = new Map<string, boolean>()
  let patchVersion = 1
  let isInitialized = false

  function hydrateCombatStateFromRoom(roomData: any): void {
    const currentSheet = sheet.value
    const p = (combatant.value?.actor ?? currentSheet?.Combatant?.actor) as Pilot | undefined
    if (!p || !roomData) return

    const mechs = Array.isArray(roomData.mechs) ? roomData.mechs : []
    const activeId = p.ActiveMech?.ID
    const roomMech = mechs.find((m: any) => m?.id === activeId) || mechs[0]
    if (!roomMech) return

    const currentStats = roomMech.stats?.current || roomMech.stats?.stats?.current
    const sc = p.ActiveMech?.StatController ?? (p as any).CombatController?.StatController
    if (sc && currentStats) {
      if (currentStats.hp !== undefined) sc.setCurrentStat('hp', Number(currentStats.hp), { silent: true })
      if (currentStats.heat !== undefined || currentStats.heatcap !== undefined) {
        const h = Number(currentStats.heat ?? currentStats.heatcap)
        sc.setCurrentStat('heat', h, { silent: true })
        sc.setCurrentStat('heatcap', h, { silent: true })
      }
      if (currentStats.structure !== undefined) sc.setCurrentStat('structure', Number(currentStats.structure), { silent: true })
      if (currentStats.stress !== undefined) sc.setCurrentStat('stress', Number(currentStats.stress), { silent: true })
      if (currentStats.overshield !== undefined) sc.setCurrentStat('overshield', Number(currentStats.overshield), { silent: true })
      if (currentStats.speed !== undefined) sc.setCurrentStat('speed', Number(currentStats.speed), { silent: true })
    }

    const cc = p.ActiveMech?.CombatController ?? p.CombatController
    if (cc) {
      if (roomMech.combatActions) {
        cc.CombatActions = { ...roomMech.combatActions }
        cc.CombatLogVersion++
      }
      if (Array.isArray(roomMech.statuses)) {
        cc.StatusController.Deserialize({ statuses: roomMech.statuses })
        cc.CombatLogVersion++
        cc.StatusController.NotifyStatusChange()
      }
    }

    // Sincroniza também a cópia da ficha local (se diferente da cópia do encontro)
    const localPilot = currentSheet?.Combatant?.actor as Pilot | undefined
    if (localPilot && localPilot !== p) {
      const localSc = localPilot.ActiveMech?.StatController
      if (localSc && currentStats) {
        if (currentStats.hp !== undefined) localSc.setCurrentStat('hp', Number(currentStats.hp), { silent: true })
        if (currentStats.heat !== undefined || currentStats.heatcap !== undefined) {
          const h = Number(currentStats.heat ?? currentStats.heatcap)
          localSc.setCurrentStat('heat', h, { silent: true })
          localSc.setCurrentStat('heatcap', h, { silent: true })
        }
        if (currentStats.structure !== undefined) localSc.setCurrentStat('structure', Number(currentStats.structure), { silent: true })
        if (currentStats.stress !== undefined) localSc.setCurrentStat('stress', Number(currentStats.stress), { silent: true })
        if (currentStats.overshield !== undefined) localSc.setCurrentStat('overshield', Number(currentStats.overshield), { silent: true })
        if (currentStats.speed !== undefined) localSc.setCurrentStat('speed', Number(currentStats.speed), { silent: true })
      }
      const localCc = localPilot.ActiveMech?.CombatController
      if (localCc) {
        if (roomMech.combatActions) {
          localCc.CombatActions = { ...roomMech.combatActions }
          localCc.CombatLogVersion++
        }
        if (Array.isArray(roomMech.statuses)) {
          localCc.StatusController.Deserialize({ statuses: roomMech.statuses })
          localCc.CombatLogVersion++
          localCc.StatusController.NotifyStatusChange()
        }
      }
    }

    // Captura imediatamente como estado inicial para que broadcastCombatDeltas não envie falsos deltas
    const finalStats = sc?.CurrentStats
    lastDispatchedHp = finalStats?.hp !== undefined ? finalStats.hp : sc?.getCurrent('hp')
    lastDispatchedHeat = finalStats?.heatcap !== undefined ? finalStats.heatcap : (finalStats?.heat !== undefined ? finalStats.heat : sc?.getCurrent('heatcap'))
    lastDispatchedStructure = finalStats?.structure !== undefined ? finalStats.structure : sc?.getCurrent('structure')
    lastDispatchedStress = finalStats?.stress !== undefined ? finalStats.stress : sc?.getCurrent('stress')
    lastDispatchedOvershield = finalStats?.overshield !== undefined ? finalStats.overshield : sc?.getCurrent('overshield')
    lastDispatchedSpeed = finalStats?.speed !== undefined ? finalStats.speed : sc?.getCurrent('speed')
    lastDispatchedActions = cc?.CombatActions ? JSON.stringify(cc.CombatActions) : undefined
    lastDispatchedStatuses = cc?.Statuses ? JSON.stringify(cc.Statuses) : undefined
    isInitialized = true

    console.log(`[PilotSync] Ficha hidratada do estado da sala: HP=${lastDispatchedHp}, Calor=${lastDispatchedHeat}, Est=${lastDispatchedStructure}, Estresse=${lastDispatchedStress}`)

    persistCombatState()
  }

  function broadcastCombatDeltas() {
    // Modo leitura: nenhum delta sai daqui — nem patch para a sala, nem o aviso de
    // "trackers do token mudaram" no fim desta função (que faz o serviço escrever
    // metadados nos tokens da cena).
    if (readOnly.value) return

    // Quando em combate com encontro compartilhado, o ator ativo editado na tela é `combatant.value.actor`.
    // Sem encontro, é `sheet.value.Combatant.actor`.
    const activeCombatant = combatant.value ?? sheet.value?.Combatant
    const p = (activeCombatant?.actor ?? sheet.value?.Combatant?.actor) as Pilot | undefined
    if (!p) {
      console.warn('[PilotSync] Piloto não encontrado para sincronização.')
      return
    }
    const mech = p.ActiveMech
    const statsController = mech?.StatController ?? (p as any).CombatController?.StatController
    const stats = statsController?.CurrentStats
    if (!stats && !statsController) {
      console.warn(`[PilotSync] StatController não encontrado para "${p.Callsign || p.Name}".`)
      return
    }

    const currentHp = stats?.hp !== undefined ? stats.hp : statsController?.getCurrent('hp')
    const currentHeat = stats?.heatcap !== undefined ? stats.heatcap : (stats?.heat !== undefined ? stats.heat : statsController?.getCurrent('heatcap'))
    const currentStructure = stats?.structure !== undefined ? stats.structure : statsController?.getCurrent('structure')
    const currentStress = stats?.stress !== undefined ? stats.stress : statsController?.getCurrent('stress')
    const currentOvershield = stats?.overshield !== undefined ? stats.overshield : statsController?.getCurrent('overshield')
    const currentSpeed = stats?.speed !== undefined ? stats.speed : statsController?.getCurrent('speed')

    const combatActionsObj = mech?.CombatController?.CombatActions ?? p.CombatController?.CombatActions
    const currentActions = combatActionsObj ? JSON.stringify(combatActionsObj) : undefined

    const statusesList = mech?.CombatController?.Statuses ?? p.CombatController?.Statuses
    const currentStatuses = statusesList ? JSON.stringify(statusesList) : undefined

    // Na primeira execução (montagem do componente), captura o estado existente como base.
    // Nenhum PATCH_FIELD é despachado: abrir/recarregar a ficha não deve sobrescrever a sala com valores padrão.
    if (!isInitialized) {
      isInitialized = true
      lastDispatchedHp = currentHp
      lastDispatchedHeat = currentHeat
      lastDispatchedStructure = currentStructure
      lastDispatchedStress = currentStress
      lastDispatchedOvershield = currentOvershield
      lastDispatchedSpeed = currentSpeed
      lastDispatchedActions = currentActions
      lastDispatchedStatuses = currentStatuses
      console.log(`[PilotSync] Estado inicial de combate capturado (HP=${currentHp}, Calor=${currentHeat}, Est=${currentStructure}, Estresse=${currentStress}). Nenhum delta despachado na montagem.`)
      return
    }

    // Sincroniza também a cópia da ficha local (se diferente da cópia do encontro)
    const localPilot = sheet.value?.Combatant?.actor as Pilot | undefined
    if (localPilot && localPilot !== p) {
      if (localPilot.ActiveMech?.StatController) {
        const localMechSc = localPilot.ActiveMech.StatController
        if (currentHp !== undefined) localMechSc.setCurrentStat('hp', currentHp, { silent: true })
        if (currentHeat !== undefined) {
          localMechSc.setCurrentStat('heat', currentHeat, { silent: true })
          localMechSc.setCurrentStat('heatcap', currentHeat, { silent: true })
        }
        if (currentStructure !== undefined) localMechSc.setCurrentStat('structure', currentStructure, { silent: true })
        if (currentStress !== undefined) localMechSc.setCurrentStat('stress', currentStress, { silent: true })
        if (currentOvershield !== undefined) localMechSc.setCurrentStat('overshield', currentOvershield, { silent: true })
        if (currentSpeed !== undefined) localMechSc.setCurrentStat('speed', currentSpeed, { silent: true })
      }
      if (combatActionsObj && localPilot.ActiveMech?.CombatController) {
        localPilot.ActiveMech.CombatController.CombatActions = { ...combatActionsObj }
        localPilot.ActiveMech.CombatController.CombatLogVersion++
      }
      if (statusesList && localPilot.ActiveMech?.CombatController) {
        localPilot.ActiveMech.CombatController.Statuses = [ ...statusesList ]
        localPilot.ActiveMech.CombatController.CombatLogVersion++
      }
      sheet.value?.Save()
    }

    const pilotName = p.Callsign || p.Name || p.ID
    let changesCount = 0

    // O estado de combate vive no mech (`mechs[i].stats.current.*`); patchear a raiz do
    // piloto gravava tudo no nó errado e a ficha voltava do join ao recarregar a página.
    const mechIndex = activeMechIndex(p)
    const statPath = (stat: string) =>
      mechIndex >= 0 ? mechStatsPath(mechIndex, stat) : `stats.current.${stat}`

    if (currentHp !== undefined && currentHp !== lastDispatchedHp) {
      console.log(`[PilotSync] HP alterado: ${lastDispatchedHp} ➔ ${currentHp} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedHp = currentHp
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('hp'), currentHp, patchVersion)
      changesCount++
    }
    if (currentHeat !== undefined && currentHeat !== lastDispatchedHeat) {
      console.log(`[PilotSync] Calor alterado: ${lastDispatchedHeat} ➔ ${currentHeat} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedHeat = currentHeat
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('heat'), currentHeat, patchVersion)
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('heatcap'), currentHeat, patchVersion)
      changesCount++
    }
    if (currentStructure !== undefined && currentStructure !== lastDispatchedStructure) {
      console.log(`[PilotSync] Estrutura alterada: ${lastDispatchedStructure} ➔ ${currentStructure} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedStructure = currentStructure
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('structure'), currentStructure, patchVersion)
      changesCount++
    }
    if (currentStress !== undefined && currentStress !== lastDispatchedStress) {
      console.log(`[PilotSync] Estresse alterado: ${lastDispatchedStress} ➔ ${currentStress} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedStress = currentStress
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('stress'), currentStress, patchVersion)
      changesCount++
    }
    if (currentOvershield !== undefined && currentOvershield !== lastDispatchedOvershield) {
      console.log(`[PilotSync] Sobreescudo alterado: ${lastDispatchedOvershield} ➔ ${currentOvershield} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedOvershield = currentOvershield
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('overshield'), currentOvershield, patchVersion)
      changesCount++
    }
    if (currentSpeed !== undefined && currentSpeed !== lastDispatchedSpeed) {
      console.log(`[PilotSync] Movimento alterado: ${lastDispatchedSpeed} ➔ ${currentSpeed} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedSpeed = currentSpeed
      patchVersion++
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statPath('speed'), currentSpeed, patchVersion)
      changesCount++
    }
    if (currentActions !== undefined && currentActions !== lastDispatchedActions) {
      console.log(`[PilotSync] Ações de combate alteradas (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedActions = currentActions
      patchVersion++
      const actionsField = mechIndex >= 0 ? mechCombatActionsPath(mechIndex) : 'combatActions'
      tableSyncSocket.sendPatchField(p.ID, 'pilot', actionsField, combatActionsObj, patchVersion)
      changesCount++
    }
    if (currentStatuses !== undefined && currentStatuses !== lastDispatchedStatuses) {
      console.log(`[PilotSync] Condições/Status alterados (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
      lastDispatchedStatuses = currentStatuses
      patchVersion++
      const statusesField = mechIndex >= 0 ? mechStatusesPath(mechIndex) : 'statuses'
      tableSyncSocket.sendPatchField(p.ID, 'pilot', statusesField, statusesList, patchVersion)
      changesCount++
    }

    // Poder de núcleo e equipamento destruído não passam pelo StatController: sem um
    // delta explícito, gastar o núcleo ou perder uma arma/sistema num teste de estrutura
    // não chegava à mesa (nem ao autosave) até alguma outra coisa mudar.
    const mechCc = mech?.CombatController ?? p.CombatController
    if (mechIndex >= 0 && mechCc) {
      if (mechCc.CorePower !== lastDispatchedCorePower) {
        console.log(`[PilotSync] Poder de núcleo ${mechCc.CorePower ? 'disponível' : 'GASTO'} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
        lastDispatchedCorePower = mechCc.CorePower
        patchVersion++
        tableSyncSocket.sendPatchField(p.ID, 'pilot', corePowerPath(mechIndex), mechCc.CorePower, patchVersion)
        changesCount++
      }
      if (mechCc.CoreActive !== lastDispatchedCoreActive) {
        lastDispatchedCoreActive = mechCc.CoreActive
        patchVersion++
        tableSyncSocket.sendPatchField(p.ID, 'pilot', coreActivePath(mechIndex), mechCc.CoreActive, patchVersion)
        changesCount++
      }

      for (const ref of equipmentDestroyedRefs(p, mechIndex)) {
        const destroyed = !!ref.item.Destroyed
        // A chave inclui o ID do item: trocar de loadout desloca os índices do caminho.
        const key = `${ref.path}#${ref.item.ID ?? ''}`
        if (lastDispatchedDestroyed.get(key) === destroyed) continue

        lastDispatchedDestroyed.set(key, destroyed)
        console.log(`[PilotSync] ${ref.kind === 'weapon' ? 'Arma' : 'Sistema'} "${ref.item.Name ?? ref.item.ID}" ${destroyed ? 'destruído' : 'reparado'} (Piloto: "${pilotName}"). Enviando PATCH_FIELD (v${patchVersion + 1})...`)
        patchVersion++
        tableSyncSocket.sendPatchField(p.ID, 'pilot', ref.path, destroyed, patchVersion)
        changesCount++
      }
    }

    if (changesCount > 0) {
      console.log(`[PilotSync] ${changesCount} alteração(ões) granular(es) despachada(s) para a sala via WebSocket.`)
      // Notifica o tokenTrackerService para atualizar imediatamente os badges na cena local e no token
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('compcon-token-trackers-changed', { detail: { sheetId: p.ID } }))
      }
    }
  }

  /** Descarrega a rajada pendente sem esperar o timer (sair/desmontar a janela). */
  function flushCombatSync() {
    // Em modo leitura não há envio nem save pendentes.
    if (readOnly.value) return
    if (combatSync.pending) {
      // `run()` do dispatcher envia os deltas e persiste.
      combatSync.flush()
      return
    }
    // Sem rajada pendente nada ficou para trás; aqui só garantimos o save final.
    persistCombatState()
  }

  watch(combatStateSignal, (newSignal, oldSignal) => {
    // Modo leitura: a ficha é uma cópia, nada de delta para a mesa nem autosave.
    if (readOnly.value) return
    console.log(`[PilotSync] Sinal de combate alterado (${oldSignal} -> ${newSignal}). Agendando deltas (timer de ${COMBAT_SYNC_DEBOUNCE_MS}ms)...`)
    combatSync.schedule()
  })

  function onRemotePatch(e: Event) {
    const patch = (e as CustomEvent).detail
    const currentSheet = sheet.value
    const p = (combatant.value?.actor ?? currentSheet?.Combatant?.actor) as Pilot | undefined
    if (!patch || !p || patch.characterId !== p.ID) return
    const v = Number(patch.version)
    if (Number.isFinite(v) && v > patchVersion) {
      patchVersion = v
    }
    const key = patchFieldKey(patch.field)
    if (key === 'hp') lastDispatchedHp = Number(patch.value)
    else if (key === 'heat' || key === 'heatcap') lastDispatchedHeat = Number(patch.value)
    else if (key === 'structure') lastDispatchedStructure = Number(patch.value)
    else if (key === 'stress') lastDispatchedStress = Number(patch.value)
    else if (key === 'overshield') lastDispatchedOvershield = Number(patch.value)
    else if (key === 'speed') lastDispatchedSpeed = Number(patch.value)
    else if (patchFieldTarget(patch.field) === 'combatActions') lastDispatchedActions = JSON.stringify(patch.value)
    else if (patchFieldTarget(patch.field) === 'statuses') {
      lastDispatchedStatuses = JSON.stringify(patch.value)
      const cc = p.ActiveMech?.CombatController ?? p.CombatController
      if (cc && Array.isArray(patch.value)) {
        cc.StatusController.Deserialize({ statuses: patch.value })
        cc.CombatLogVersion++
        cc.StatusController.NotifyStatusChange()
      }
    }
  }

  function onRemoteFullSheet(e: Event) {
    const payload = (e as CustomEvent).detail
    const currentSheet = sheet.value
    const p = (combatant.value?.actor ?? currentSheet?.Combatant?.actor) as Pilot | undefined
    if (!payload || !p || payload.characterId !== p.ID || !payload.data) return
    const v = Number(payload.version)
    if (Number.isFinite(v) && v >= patchVersion) {
      patchVersion = v
      hydrateCombatStateFromRoom(payload.data)
    }
  }

  onMounted(() => {
    // Modo leitura é um RETRATO do momento em que abriu: não escuta nem aplica nada da
    // sala (hidratar aqui mexia nos stats/status da cópia e podia disparar o serviço de
    // marcadores, que escreve metadados nos tokens da cena).
    if (readOnly.value) return

    window.addEventListener('compcon-patch-field', onRemotePatch)
    window.addEventListener('compcon-sync-full-sheet', onRemoteFullSheet)
    // Um reload de página não desmonta os componentes: sem estes listeners o envio e o
    // autosave que ainda estão no timer morreriam com a janela. `pagehide` cobre o
    // reload do navegador; `compcon-before-reload` é o botão "Recarregar a Janela".
    window.addEventListener('pagehide', flushCombatSync)
    window.addEventListener('compcon-before-reload', flushCombatSync)
  })

  onBeforeUnmount(() => {
    // Sai do modo leitura ao desmontar a ficha (a janela volta a desenhar seus tokens).
    setSheetReadOnlySession(false)

    if (readOnly.value) return

    window.removeEventListener('compcon-patch-field', onRemotePatch)
    window.removeEventListener('compcon-sync-full-sheet', onRemoteFullSheet)
    window.removeEventListener('pagehide', flushCombatSync)
    window.removeEventListener('compcon-before-reload', flushCombatSync)
    flushCombatSync()
  })

function selectPanel(p: string) {
    panel.value = panel.value === p ? 'pc' : p
}

function openLeaveDialog(): Promise<string> {
    leaveDialog.value = true
    return new Promise(resolve => {
      resolveLeaveDialog = resolve
    })
}

function handleLeave(choice: 'save' | 'exit' | 'cancel') {
    leaveDialog.value = false
    resolveLeaveDialog?.(choice)
    resolveLeaveDialog = null
}

  // onBeforeRouteLeave só pode ser registrado se o componente for filho direto de <router-view>.
  // Quando montado diretamente em App.vue (como camada persistente da janela única),
  // matchedRouteKey não possui registro ativo, o que gerava o aviso "[Vue Router warn]: No active route record was found".
  const hasActiveRouteRecord = inject(matchedRouteKey, null as any)?.value
  if (hasActiveRouteRecord) {
    onBeforeRouteLeave(async () => {
      if (consumeLeaveGuardBypass()) return true
      // Modo leitura: nada foi editado, então não há o que salvar nem o que confirmar.
      if (readOnly.value) return true
      const choice = await openLeaveDialog()
      if (choice === 'save') {
        // Persiste o container realmente editado (encontro compartilhado ou ficha),
        // descarregando antes o que ainda estiver no timer.
        flushCombatSync()
        return true
      } else if (choice === 'exit') {
        return true
      }
      return false
    })
  }
</script>

<style scoped>
  /*
   * Modo leitura (`?readonly=1`): os controles das abas (tickbars, campos, selects,
   * botões) não recebem ponteiro. O `pointer-events: none` fica só nos CONTROLES de
   * propósito — bloquear o container inteiro mataria a rolagem da ficha.
   */
  .readonly-view :deep(input),
  .readonly-view :deep(textarea),
  .readonly-view :deep(select),
  .readonly-view :deep(button),
  .readonly-view :deep([role='slider']),
  .readonly-view :deep(.v-btn),
  .readonly-view :deep(.v-field) {
    pointer-events: none !important;
  }

  /*
   * Elementos de leitura e navegação precisam continuar operáveis na ficha de leitura:
   * 1. Sanfonas/Painéis expansíveis (Traços da Estrutura, Bônus de Núcleo, Talentos do Piloto,
   *    Sistemas, Armas, etc.) são botões em Vuetify (.v-expansion-panel-title), mas servem
   *    para abrir e ler a informação.
   * 2. Abas (.v-tab) e botões de alternância de visão (Mecha vs Piloto).
   */
  .readonly-view :deep(.v-expansion-panel-title),
  .readonly-view :deep(.v-expansion-panel-title *) {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  .readonly-view :deep(.v-tab),
  .readonly-view :deep(.v-tab *),
  .readonly-view :deep(.view-switcher-row),
  .readonly-view :deep(.view-switcher-row *) {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /*
   * Ficha de leitura não tem AÇÃO: os botões de rolagem/ativação somem em vez de ficarem
   * inertes. Eles se identificam pela cor de ativação (`bg-action--quick|full|protocol|
   * free|overcharge`, de `Action.Color`), o que evita esconder navegação (abas, troca
   * mech/piloto) e indicadores informativos (status, frequência, uso gasto).
   */
  .readonly-view :deep([class*='bg-action--']) {
    display: none !important;
  }
</style>
