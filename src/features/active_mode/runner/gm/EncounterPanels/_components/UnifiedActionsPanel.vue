<template>
  <div class="unified-actions-container">
    <!-- 1. Barra de Ações (Tiles rápidos de combate) -->
    <combat-action-panel
      v-if="controller?.StatController?.MaxStats['activations']"
      :controller="controller"
      :hide-overcharge="isNpc"
    />

    <!-- 2. Acordeão Todas as Ações -->
    <v-expansion-panels
      focusable
      tile
      color="panel"
      flat
      class="mt-1"
    >
      <v-expansion-panel>
        <v-expansion-panel-title class="heading h4 py-0">
          {{ $t('active.actions.allActions') }}
        </v-expansion-panel-title>
        <v-expansion-panel-text style="border: 2px solid rgb(var(--v-theme-panel))">
          <!-- Protocolos e Ações Livres -->
          <v-row dense>
            <v-col
              v-for="pa in controller.AllActions('Protocol')"
              :key="pa.ID"
            >
              <deploy-button
                v-if="pa.Deployable"
                action-only
                :deployable="toDeployable(pa)"
                :actor="actor"
                @deploy="$emit('deploy', $event)"
              />
              <basic-action-button
                v-else
                :action="pa"
                @activate="activate($event)"
              />
            </v-col>
            <v-col
              v-for="fa in controller.AllActions('Free')"
              :key="fa.ID"
            >
              <deploy-button
                v-if="fa.Deployable"
                action-only
                :deployable="toDeployable(fa)"
                :actor="actor"
                @deploy="$emit('deploy', $event)"
              />
              <basic-action-button
                v-else
                :action="fa"
                @activate="activate($event)"
              />
            </v-col>
          </v-row>
          <v-divider class="my-2" />

          <!-- Ações de NPC especiais antes das rápidas -->
          <template v-if="isNpc">
            <v-row dense>
              <v-col v-if="skirmishAction">
                <npc-skirmish-button :action="skirmishAction" />
              </v-col>
              <v-col v-if="barrageAction">
                <npc-barrage-button :action="barrageAction" />
              </v-col>
            </v-row>
            <v-divider class="my-1" />
          </template>

          <!-- Grade de Rápidas e Completas -->
          <v-row align="start" dense>
            <!-- Coluna de Ações Rápidas -->
            <v-col>
              <v-row dense>
                <v-col
                  v-for="(actionId, index) in quickActions"
                  :key="`quick-${index}`"
                >
                  <invade-button
                    v-if="actionId === 'act_invade'"
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                  <search-action-button
                    v-else-if="actionId === 'act_search'"
                    :action="getBaseAction(actionId)"
                  />
                  <targeted-action-button
                    v-else-if="controller.NeedsTarget(actionId)"
                    :action="getBaseAction(actionId)"
                  />
                  <basic-action-button
                    v-else
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                </v-col>

                <v-divider class="my-1" />

                <!-- Ações Rápidas Dinâmicas de Itens/Sistemas -->
                <v-col
                  v-for="qa in controller.AllActions('Quick')"
                  :key="qa.ID"
                >
                  <deploy-button
                    v-if="qa.Deployable"
                    action-only
                    :deployable="toDeployable(qa)"
                    :actor="actor"
                    @deploy="$emit('deploy', $event)"
                  />
                  <basic-action-button
                    v-else
                    :action="qa"
                    @activate="activate($event)"
                  />
                </v-col>
                <v-col
                  v-for="qta in controller.AllActions('Quick Tech')"
                  :key="qta.ID"
                >
                  <deploy-button
                    v-if="qta.Deployable"
                    action-only
                    :deployable="toDeployable(qta)"
                    :actor="actor"
                    @deploy="$emit('deploy', $event)"
                  />
                  <basic-action-button
                    v-else
                    :action="qta"
                    @activate="activate($event)"
                  />
                </v-col>
              </v-row>
            </v-col>

            <!-- Coluna de Ações Completas -->
            <v-col>
              <v-row dense>
                <v-col
                  v-for="(actionId, index) in fullActions"
                  :key="`full-${index}`"
                >
                  <stabilize-button
                    v-if="actionId === 'act_stabilize'"
                    :action="getBaseAction(actionId)"
                  />
                  <skill-check-button
                    v-else-if="actionId === 'act_skill_check'"
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                  <mech-full-tech-button
                    v-else-if="actionId === 'act_full_tech'"
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                  <mech-improvised-attack-button
                    v-else-if="actionId === 'act_improvised_attack' || actionId === 'act_improvised_attack_npc'"
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                  <basic-action-button
                    v-else
                    :action="getBaseAction(actionId)"
                    @activate="activate($event)"
                  />
                </v-col>

                <v-divider class="my-1" />

                <!-- Ações Completas Dinâmicas de Itens/Sistemas -->
                <v-col
                  v-for="fa in controller.AllActions('Full')"
                  :key="fa.ID"
                >
                  <deploy-button
                    v-if="fa.Deployable"
                    action-only
                    :deployable="toDeployable(fa)"
                    :actor="actor"
                    @deploy="$emit('deploy', $event)"
                  />
                  <basic-action-button
                    v-else
                    :action="fa"
                    @activate="activate($event)"
                  />
                </v-col>
                <v-col
                  v-for="fta in controller.AllActions('Full Tech')"
                  :key="fta.ID"
                >
                  <deploy-button
                    v-if="fta.Deployable"
                    action-only
                    :deployable="toDeployable(fta)"
                    :actor="actor"
                    @deploy="$emit('deploy', $event)"
                  />
                  <basic-action-button
                    v-else
                    :action="fta"
                    @activate="activate($event)"
                  />
                </v-col>
              </v-row>
            </v-col>
          </v-row>

          <v-divider class="my-2" />

          <!-- Reações e Outras Ações (Rodapé) -->
          <v-row dense>
            <v-col v-if="!isNpc && getBaseAction('act_overcharge')">
              <overcharge-button :action="getBaseAction('act_overcharge')" />
            </v-col>
            <v-col v-if="!isNpc && getBaseAction('act_brace')">
              <basic-action-button
                :action="getBaseAction('act_brace')"
                @activate="activate($event)"
              />
            </v-col>
            <v-col v-if="getBaseAction('act_overwatch')">
              <basic-action-button
                :action="getBaseAction('act_overwatch')"
                @activate="activate($event)"
              />
            </v-col>
            <v-col
              v-for="ra in controller.AllActions('Reaction')"
              :key="ra.ID"
            >
              <deploy-button
                v-if="ra.Deployable"
                action-only
                :deployable="toDeployable(ra)"
                :actor="actor"
                @deploy="$emit('deploy', $event)"
              />
              <basic-action-button
                v-else
                :action="ra"
                @activate="activate($event)"
              />
            </v-col>
            <v-col v-if="!isNpc && getBaseAction('act_self_destruct')">
              <basic-action-button
                :action="getBaseAction('act_self_destruct')"
                @activate="activate($event)"
              />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useEncounterContext } from '../encounterContext'
  import { CompendiumStore } from '@/features/compendium/store'
  import { Deployable } from '@/classes/components/feature/deployable/Deployable'
  import { notify } from '@/util/notify'
  import { useI18n } from 'vue-i18n'
  import CombatActionPanel from './CombatActionPanel.vue'
  import BasicActionButton from './loadouts/action_buttons/basicActionButton.vue'
  import TargetedActionButton from './loadouts/action_buttons/targetedActionButton.vue'
  import DeployButton from './loadouts/_deployButton.vue'
  import InvadeButton from './loadouts/action_buttons/invadeButton.vue'
  import StabilizeButton from './loadouts/action_buttons/stabilizeButton.vue'
  import SkillCheckButton from './loadouts/action_buttons/skillCheckButton.vue'
  import OverchargeButton from './loadouts/action_buttons/overchargeButton.vue'
  import MechFullTechButton from './loadouts/action_buttons/mechFullTechButton.vue'
  import SearchActionButton from './loadouts/action_buttons/searchActionButton.vue'
  import MechImprovisedAttackButton from './loadouts/action_buttons/MechImprovisedAttackButton.vue'
  import NpcSkirmishButton from './loadouts/action_buttons/npcSkirmishButton.vue'
  import NpcBarrageButton from './loadouts/action_buttons/npcBarrageButton.vue'

  const { t } = useI18n()
  const { owner } = useEncounterContext()

  const props = withDefaults(
    defineProps<{
      isNpc?: boolean
    }>(),
    { isNpc: false }
  )

  defineEmits<{ deploy: [event: any] }>()

  const actor = computed(() => {
    return props.isNpc ? owner.value.actor : (owner.value.actor.ActiveMech || owner.value.actor)
  })

  const controller = computed(() => actor.value.CombatController)

  const quickMechActions = [
    'act_boost',
    'act_grapple',
    'act_ram',
    'act_invade',
    'act_bolster',
    'act_lockon',
    'act_hide',
    'act_search',
    'act_scan',
    'act_prepare',
    'act_eject',
    'act_shut_down',
  ]
  const fullMechActions = [
    'act_disengage',
    'act_stabilize',
    'act_improvised_attack',
    'act_skill_check',
    'act_dismount',
    'act_boot_up',
    'act_full_tech',
  ]

  const quickNpcActions = [
    'act_boost',
    'act_grapple_npc',
    'act_hide',
    'act_prepare',
    'act_ram_npc',
    'act_invade',
    'act_lockon',
    'act_search',
  ]
  const fullNpcActions = [
    'act_disengage',
    'act_improvised_attack_npc',
    'act_stabilize_npc',
  ]

  const quickActions = computed(() => (props.isNpc ? quickNpcActions : quickMechActions))
  const fullActions = computed(() => (props.isNpc ? fullNpcActions : fullMechActions))

  const skirmishAction = computed(() =>
    props.isNpc ? CompendiumStore().Actions.find(a => a.ID === 'act_skirmish') : null
  )
  const barrageAction = computed(() =>
    props.isNpc ? CompendiumStore().Actions.find(a => a.ID === 'act_barrage') : null
  )

  function getBaseAction(actionId: string) {
    return CompendiumStore().Actions.find((a: any) => a.ID === actionId)!
  }

  function toDeployable(action: any) {
    return new Deployable(action.Deployable)
  }

  const NOTICES: Record<string, { ok: [string, string]; fail?: [string, string] }> = {
    act_prepare: { ok: ['active.mechActions.preparedTitle', 'active.common.preparedText'] },
    act_eject: {
      ok: ['active.mechActions.pilotEjectedTitle', 'active.mechActions.pilotEjectedText'],
      fail: ['active.mechActions.ejectFailedTitle', 'active.mechActions.ejectFailedText'],
    },
    act_stabilize_npc: {
      ok: ['active.npcActions.npcStabilizedTitle', 'active.npcActions.npcStabilizedText'],
    },
    act_hide: { ok: ['active.npcActions.npcHiddenTitle', 'active.common.hiddenText'] },
    act_disengage: {
      ok: ['active.npcActions.npcDisengagedTitle', 'active.common.disengagedText'],
      fail: ['active.common.disengageFailed', 'active.common.disengageFailedText'],
    },
  }

  function activate(event: string) {
    const ok = controller.value.RunAction(event)
    const notice = NOTICES[event]
    if (!notice) return
    if (!ok && !notice.fail) return
    const [title, text] = ok ? notice.ok : notice.fail!
    notify({
      type: ok ? 'success' : 'warning',
      title: t(title),
      text: t(text, { name: controller.value.CombatName }),
    })
  }
</script>

<style scoped>
  .v-expansion-panel-text :deep(.v-expansion-panel-text__wrapper) {
    padding: 8px;
  }
</style>
