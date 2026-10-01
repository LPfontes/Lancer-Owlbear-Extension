<script setup lang="ts">
  import { computed, ref, type Ref } from 'vue'
  import { Action } from '@/classes/Action'
  import { useEncounterContext } from '../../../encounterContext'
  import { useI18n } from 'vue-i18n'
  import { notify } from '@/util/notify'
  import LocalTargetSelector from '@/ui/components/chips/_activeeffect/_shared/LocalTargetSelector.vue'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import { ActiveEffect } from '@/classes/components/feature/active_effects/ActiveEffect'
  import { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
  import type { ActiveEventTarget } from '@/classes/components/feature/active_effects/effect_events/eventTarget'
  import BaseTargetSelector from '@/ui/components/chips/_activeeffect/_shared/BaseTargetSelector.vue'
  import CcForceOverride from '@/ui/components/modals/CCForceOverride.vue'
  import CombatActionButton from './CombatActionButton.vue'
  import WeaponAttackHudModal from './WeaponAttackHudModal.vue'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const { owner, encounterInstance, activeController: controller, ownerController } = useEncounterContext()
  const { t } = useI18n()
  const pc = computed(() => (encounterInstance.value as any)?.ItemType === 'PilotSheet')

  const props = defineProps<{
    action: Action
  }>()

  const succeeded = ref(true)
  const overridePrompt = ref(false)

  const contested = computed(() => controller.value.IsContested(props.action.ID))
  const melee = computed(() => controller.value.IsMeleeResolved(props.action.ID))

  const activation = computed(
    () => controller.value.ActivationFor(props.action.ID) ?? props.action.Activation
  )
  const blockReason = computed(() =>
    controller.value.BlockedReasonFor(activation.value, { actionId: props.action.ID })
  )

  const syntheticMeleeWeapon = computed(() => {
    return {
      Name: `${props.action.Name} (Corpo a Corpo)`,
      Size: 'Auxiliary',
      WeaponTypes: ['Melee'],
      Range: [{ Type: 'Threat', Value: 1 }],
      Damage: [],
      Tags: [{ Name: 'Corpo a Corpo' }, { Name: 'Contestado' }],
    }
  })

  const finishButtonText = computed(() => {
    if (props.action.ID === 'act_grapple') {
      return t('hud.finishGrapple') || 'Concluir Agarrar'
    }
    if (props.action.ID === 'act_ram') {
      return t('hud.finishRam') || 'Concluir Empurrão'
    }
    return `${t('hud.finish')} ${props.action.Name}`
  })

  function newEvent(): ActiveEffectEvent {
    const self = encounterInstance.value.Combatants.find(
      (c: CombatantData) => c.actor.CombatController.RootActor.ID === controller.value.RootActor.ID
    )
    if (!self) throw new Error('Owner combatant not found in encounterInstance')
    const built = new ActiveEffectEvent(
      self,
      new ActiveEffect(
        {
          id: props.action.ID,
          name: props.action.Name,
          detail: props.action.Detail,
          activation: props.action.Activation,
          attack: melee.value ? 'melee' : undefined,
        } as any,
        self.actor
      ),
      encounterInstance.value
    )
    if (melee.value) built.AttackBonus = controller.value.MeleeActionBonus(props.action.ID)
    return built
  }

  const event = ref(newEvent()) as Ref<ActiveEffectEvent>

  const chosen = computed(() =>
    (event.value.Targets as ActiveEventTarget[]).filter(t => !!t?.Combatant)
  )

  function landed(target: ActiveEventTarget): boolean {
    if (!melee.value) return succeeded.value
    return target.HitResult === 'hit' || target.HitResult === 'crit'
  }

  function apply(close: () => void, force = false) {
    const targets = chosen.value
    if (!pc.value && !targets.length) return
    if (!force && blockReason.value) {
      overridePrompt.value = true
      return
    }

    const firstTargetController = targets[0]?.Combatant?.actor?.CombatController

    if (pc.value) {
      controller.value.PerformAction(props.action.ID, {
        target: firstTargetController,
        success: succeeded.value,
        force,
      })
    } else {
      targets.forEach((t, i) => {
        const opts = {
          target: t.Combatant!.actor.CombatController,
          success: landed(t),
          force,
        }
        if (i === 0) controller.value.PerformAction(props.action.ID, opts)
        else controller.value.RunAction(props.action.ID, opts)
      })
    }

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      controller.value?.CombatName ||
      'Piloto'
    const targetName = targets[0]?.Combatant?.actor?.Name
    const cat = activation.value === 'Full' ? 'full_action' : 'quick_action'
    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: props.action.Name,
      actionType: cat,
      targetName,
    })

    notify({
      title: props.action.Name,
      text: props.action.ID === 'act_grapple' ? (t('hud.grappleCompleted') || 'Agarrar Concluído!') : `${props.action.Name} Concluído!`,
      type: 'success',
    })

    event.value = newEvent()
    succeeded.value = true
    close()
  }
</script>

<template>
  <combat-action-button
    :action="action"
    min-width="700px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Action Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              :icon="action.Activation === 'Full' ? 'mdi-hexagon-slice-6' : 'mdi-hexagon-slice-3'"
              :color="action.Activation === 'Full' ? 'action--full' : 'action--quick'"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ action.Name }}
              </div>
              <div class="text-caption text-disabled">
                {{ action.Terse || action.Detail }}
              </div>
            </div>
          </div>
          <v-chip
            :color="action.Activation === 'Full' ? 'action--full' : 'action--quick'"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            {{ $enum('activationType', action.Activation) }}
          </v-chip>
        </div>

        <!-- Attack HUD Row -->
        <div
          v-if="melee || action.ID === 'act_grapple' || action.ID === 'act_ram'"
          class="pa-3 mb-3 rounded bg-panel border-sm"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
            <div class="d-flex align-center ga-2">
              <span class="text-overline font-weight-bold text-accent">
                <v-icon icon="mdi-sword-cross" size="16" class="mr-1" />
                Rolagem de Ataque
              </span>
              <v-chip size="x-small" color="secondary" variant="outlined">
                Corpo a Corpo // Ameaça 1
              </v-chip>
            </div>
            <span class="text-caption text-disabled">
              d20 + Brio vs Evasão do Alvo
            </span>
          </div>

          <div class="weapon-actions-row">
            <weapon-attack-hud-modal
              :item="syntheticMeleeWeapon"
              :controller="controller"
            />
          </div>
        </div>

        <cc-force-override
          v-model="overridePrompt"
          :reason="blockReason || 'unavailable'"
          :action="action.Name"
          @confirm="apply(close, true)"
        />

        <!-- Footer Actions -->
        <v-divider class="my-3" />
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <v-btn
            variant="plain"
            color="disabled"
            @click="close"
          >
            {{ $t('hud.cancel') }}
          </v-btn>

          <v-btn
            :color="action.Activation === 'Full' ? 'action--full' : 'action--quick'"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            @click="apply(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>{{ finishButtonText }}</span>
          </v-btn>
        </div>
      </div>
    </template>
  </combat-action-button>
</template>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
</style>
