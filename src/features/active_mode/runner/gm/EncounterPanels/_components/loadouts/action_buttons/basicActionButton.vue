<script setup lang="ts">
  import { useEncounterContext } from '../../../encounterContext'
  import type { Action } from '@/classes/Action'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { notify } from '@/util/notify'
  import CombatActionButton from './CombatActionButton.vue'
  import MenuInput from '@/ui/components/chips/_activeeffect/_ae_menu_input.vue'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { enumLabel } from '@/i18n/enumLabel'

  const { owner, encounterInstance, activeController, ownerController } = useEncounterContext()
  const { t } = useI18n()

  const props = defineProps<{
    action: Action
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const activeMech = computed(() => {
    return (
      (owner.value?.actor as any)?.ActiveMech ||
      (activeController.value as any)?.RootActor?.ActiveMech ||
      null
    )
  })

  const combatController = computed(() => {
    return (
      activeMech.value?.CombatController ||
      activeController.value ||
      (owner.value?.actor as any)?.CombatController ||
      ownerController.value
    )
  })

  const isTechAttack = computed(() => {
    if (props.action.ID.includes('tech_attack')) return true
    return props.action.ActiveEffects?.some(ae => ae.Attack && ae.Attack === 'tech')
  })

  const requiresDialog = computed(() => {
    if (isTechAttack.value) return true
    if (
      props.action.ActiveEffects?.some(
        ae => ae.Attack || (ae.Damage && ae.Damage.length > 0) || ae.Save
      )
    ) {
      return true
    }
    return false
  })

  function apply() {
    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      activeMech.value?.Name ||
      'Piloto'
    const activation = (props.action.Activation || 'Quick').toLowerCase()
    const cat = activation === 'full' ? 'full_action' : activation === 'protocol' ? 'protocol' : 'quick_action'
    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: props.action.Name,
      actionType: cat,
    })
    emit('activate', props.action.ID)
  }

  function reset() {
    combatController.value?.UndoActivation(props.action.Activation, { actionId: props.action.ID })
  }

  function executeDirectAction() {
    const cc = combatController.value
    if (!cc) return

    const activationRaw = props.action.Activation || 'Quick'
    const activation = activationRaw.toLowerCase()

    // 1. Check if activating as Overcharge
    const isOvercharge = cc.CanRepeatAsOvercharge(props.action.ID, activationRaw)

    // 2. Spend the respective action in the Action Pool
    if (isOvercharge) {
      cc.SetCombatAction('overcharge', false)
      if (activeController.value && activeController.value !== cc) {
        activeController.value.SetCombatAction('overcharge', false)
      }
      if (
        ownerController.value &&
        ownerController.value !== cc &&
        ownerController.value !== activeController.value
      ) {
        ownerController.value.SetCombatAction('overcharge', false)
      }
    } else if (activation !== 'free') {
      cc.SetCombatAction(activation, false)
      if (activeController.value && activeController.value !== cc) {
        activeController.value.SetCombatAction(activation, false)
      }
      if (
        ownerController.value &&
        ownerController.value !== cc &&
        ownerController.value !== activeController.value
      ) {
        ownerController.value.SetCombatAction(activation, false)
      }
    }

    // 3. Mark action as used
    cc.MarkActionUsed(props.action.ID)

    // 4. Record action in CombatLog
    try {
      cc.Record?.('action', {
        action: { id: props.action.ID, name: props.action.Name },
        activation: isOvercharge ? 'overcharge' : activation,
        free: activation === 'free',
      })
    } catch (_e) {}

    // 5. Emit activate (parent panel handles RunAction & NOTICES announcements)
    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      activeMech.value?.Name ||
      'Piloto'
    const cat = activation === 'full' ? 'full_action' : activation === 'protocol' ? 'protocol' : 'quick_action'
    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: props.action.Name,
      actionType: cat,
    })

    emit('activate', props.action.ID)

    // 6. If action doesn't have an announcement in NOTICES, show a clean toast
    const standardNotices = [
      'act_prepare',
      'act_eject',
      'act_dismount',
      'act_hide',
      'act_disengage',
      'act_boot_up',
      'act_self_destruct',
      'act_shut_down',
      'act_brace',
      'act_overwatch',
      'act_mount',
      'act_stabilize_npc',
    ]
    if (!standardNotices.includes(props.action.ID)) {
      notify({
        title: props.action.Name,
        text: t('active.combatAction.activationAction', {
          n: enumLabel('activationType', props.action.Activation),
        }),
        type: 'success',
      })
    }
  }
</script>

<template>
  <combat-action-button
    v-if="requiresDialog"
    :action="action"
    min-width="1000"
  >
    <template #default="{ close }">
      <cc-synergy-display
        :location="action.ID.replace('act_', '')"
        :mech="combatController?.Parent"
        alert
      />

      <cc-synergy-display
        v-if="isTechAttack"
        location="tech_attack"
        :mech="combatController?.Parent"
        alert
      />

      <menu-input
        :owner="owner"
        :encounter-instance="encounterInstance"
        :active-effect="action"
        :close="close"
        @apply="apply"
        @reset="reset"
      />
    </template>
  </combat-action-button>

  <combat-action-button
    v-else
    :action="action"
    direct
    @click="executeDirectAction"
  />
</template>
