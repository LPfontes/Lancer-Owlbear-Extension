<template>
  <div
    v-if="!sheet"
    :key="sheetID"
  >
    <v-progress-linear
      indeterminate
      color="primary"
      height="20"
      class="my-5"
    />
    <div class="text-center text-cc-overline">{{ $t('active.pilotRunner.loading') }}</div>
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
            <div>
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
              <pc-end-round :sheet="sheet" />
            </v-col>
            <v-col>
              <pc-end-encounter :sheet="sheet" />
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
  import { ref, computed, onMounted } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useRoute, onBeforeRouteLeave } from 'vue-router'
  import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
  import { PilotStore } from '@/features/pilot_management/store'
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

  const sheet = computed(() => {
    const store = PilotSheetStore()
    const targetId = props.id || (route.params.id as string) || store.CurrentActiveID
    if (!targetId) return null
    let s = store.GetSheet(targetId)
    if (!s && store.PilotSheets?.length) {
      s = store.PilotSheets.find(
        (ps: any) => !ps.SaveController?.IsDeleted && (ps.PilotID === targetId || ps.ID === targetId)
      ) as any
    }
    return s || null
  })

  onMounted(async () => {
    const sheetStore = PilotSheetStore()
    if (!sheetStore.PilotSheets?.length) {
      await sheetStore.LoadPilotSheets()
    }

    const targetId = (props.id || (route.params.id as string) || sheetStore.CurrentActiveID) as string
    if (targetId) {
      let targetSheet = sheetStore.GetSheet(targetId)
      if (!targetSheet) {
        targetSheet = sheetStore.PilotSheets.find(
          (s: any) => !s.SaveController?.IsDeleted && (s.PilotID === targetId || s.ID === targetId)
        )
        if (targetSheet?.Archived) {
          targetSheet.Unarchive()
        }
      }

      if (!targetSheet) {
        const pilotStore = PilotStore()
        if (!pilotStore.Pilots?.length) {
          await pilotStore.LoadPilots()
        }
        const pilotObj: any = pilotStore.Pilots.find((p: any) => p.ID === targetId)
        if (pilotObj) {
          if (!pilotObj.ActiveMech && pilotObj.Mechs?.length) {
            pilotObj.ActiveMech = pilotObj.Mechs[0]
          }
          await sheetStore.AddPilotSheet(pilotObj)
          targetSheet = sheetStore.GetSheet(sheetStore.CurrentActiveID)
        }
      }

      if (targetSheet && sheetStore.CurrentActiveID !== targetSheet.ID) {
        await sheetStore.SetActiveSheet(targetSheet.ID)
      }
    }
  })
  const sheetID = computed(() => (sheet.value ? sheet.value.ID : 0))
  const combatant = computed(() => sheet.value!.Combatant)
  const pilot = computed(() => sheet.value!.Combatant.actor as Pilot)
  const encounterInstance = computed(() => sheet.value!.EncounterInstance)

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

onBeforeRouteLeave(async () => {
    if (consumeLeaveGuardBypass()) return true
    const choice = await openLeaveDialog()
  if (choice === 'save') {
      sheet.value?.Save()
      return true
  } else if (choice === 'exit') {
      return true
  }
    return false
  })
</script>
