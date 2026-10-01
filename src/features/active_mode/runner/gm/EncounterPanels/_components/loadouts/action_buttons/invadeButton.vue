<template>
  <combat-action-button
    :action="action"
    min-width="760px"
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

        <cc-synergy-display
          location="tech_attack"
          :mech="controller.Parent"
          alert
          class="mb-3"
        />

        <v-row dense>
          <!-- Options Sidebar / Column -->
          <v-col
            cols="12"
            md="4"
          >
            <div class="pa-2 rounded bg-panel border-sm h-100">
              <div class="text-overline font-weight-bold text-disabled px-2 mb-1">
                {{ $t('active.invade.available') || 'Ações de Invasão' }}
              </div>
              <v-list
                density="compact"
                bg-color="transparent"
                class="pa-0"
              >
                <v-list-item
                  v-for="item in invadeActions"
                  :key="item.ID"
                  :value="item.ID"
                  :active="selectedOptionId === item.ID"
                  class="rounded mb-1"
                  :class="selectedOptionId === item.ID ? 'bg-action--invade' : ''"
                  @click="selectedOptionId = item.ID"
                >
                  <template #prepend>
                    <v-icon
                      :icon="item.Icon || 'mdi-radio-tower'"
                      size="20"
                      class="mr-2"
                    />
                  </template>
                  <v-list-item-title class="font-weight-bold text-body-2">
                    {{ item.Name }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </div>
          </v-col>

          <!-- Main Content Column -->
          <v-col
            cols="12"
            md="8"
          >
            <!-- Option Profile Card -->
            <div class="pa-3 mb-3 rounded bg-panel border-sm">
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <div class="d-flex align-center ga-2">
                  <v-icon
                    :icon="currentOption.Icon || 'mdi-radio-tower'"
                    color="accent"
                    size="22"
                  />
                  <span class="text-subtitle-1 font-weight-bold text-white">
                    {{ currentOption.Name }}
                  </span>
                </div>
                <div class="d-flex ga-1 flex-wrap">
                  <v-chip
                    size="x-small"
                    color="orange-accent-3"
                    variant="tonal"
                    class="font-weight-bold"
                  >
                    +2 Calor no Alvo
                  </v-chip>
                </div>
              </div>

              <div class="text-body-2 text-text opacity-90 mb-2">
                {{ currentOption.Detail || currentOption.Terse }}
              </div>

              <!-- Conditions / Statuses applied -->
              <div
                v-if="appliedStatuses.length"
                class="d-flex align-center ga-1 flex-wrap mt-2 pt-2 border-t-sm border-panel-border"
              >
                <span class="text-caption text-disabled mr-1">Condições:</span>
                <v-chip
                  v-for="st in appliedStatuses"
                  :key="st.name"
                  size="x-small"
                  variant="elevated"
                  class="font-weight-bold rounded-0"
                >
                  {{ st.name }}
                </v-chip>
                <span class="text-caption text-disabled ml-2">// Até o final do próximo turno do alvo</span>
              </div>
            </div>

            <!-- Tech Attack HUD Row -->
            <div class="pa-3 mb-3 rounded bg-panel border-sm">
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <div class="d-flex align-center ga-2">
                  <span class="text-overline font-weight-bold text-accent">
                    <v-icon icon="mdi-cpu-64-bit" size="16" class="mr-1" />
                    Rolagem de Ataque Tecnológico
                  </span>
                  <v-chip
                    size="x-small"
                    color="secondary"
                    variant="outlined"
                  >
                    Sensores {{ sensorRange }} // Ataque Tec: {{ techAttackBonus >= 0 ? `+${techAttackBonus}` : techAttackBonus }}
                  </v-chip>
                </div>
                <span class="text-caption text-disabled">
                  d20 + Ataque Tecnológico vs Def-E do Alvo
                </span>
              </div>

              <div class="weapon-actions-row">
                <weapon-attack-hud-modal
                  :item="syntheticTechAttackWeapon"
                  :controller="controller"
                />
              </div>
            </div>
          </v-col>
        </v-row>

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

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useI18n } from 'vue-i18n'
  import type { Action } from '@/classes/Action'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import { useEncounterContext } from '../../../encounterContext'
  import CombatActionButton from './CombatActionButton.vue'
  import WeaponAttackHudModal from './WeaponAttackHudModal.vue'
  import CcForceOverride from '@/ui/components/modals/CCForceOverride.vue'
  import { notify } from '@/util/notify'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { CompendiumStore } from '@/stores'

  const { owner, encounterInstance, activeController: controller } = useEncounterContext()
  const { t } = useI18n()
  const _display = useDisplay()

  const props = defineProps<{
    action: Action
  }>()

  const emit = defineEmits<{
    activate: [payload: any]
  }>()

  const mobile = computed(() => _display.mdAndDown.value)
  const overridePrompt = ref(false)

  const activation = computed(
    () => controller.value?.ActivationFor?.(props.action.ID) ?? props.action.Activation
  )
  const blockReason = computed(() =>
    controller.value?.BlockedReasonFor?.(activation.value, { actionId: props.action.ID })
  )

  const invadeActions = computed(() => {
    const opts = controller.value?.InvadeOptions?.() || []
    const list = [...opts]
    if (!list.some((o: any) => o.ID === 'act_inv_fragment_signal')) {
      const fromComp = CompendiumStore().Actions.find((a: any) => a.ID === 'act_inv_fragment_signal')
      if (fromComp) {
        list.unshift(fromComp)
      } else {
        list.unshift({
          ID: 'act_inv_fragment_signal',
          Name: 'Fragmentar Sinal',
          Icon: 'mdi-radio-tower',
          Detail: 'Você transmite informações falsas, mensagens obscenas ou sinais fantasmas para o núcleo computacional do alvo. Ele fica IMPEDIDO e LENTO até o final do próximo turno dele.',
          Terse: 'Deixa um personagem IMPEDIDO e LENTO até o final do próximo turno dele.',
          Activation: 'Invade',
        } as any)
      }
    }
    return list
  })

  const selectedOptionId = ref(invadeActions.value[0]?.ID || 'act_inv_fragment_signal')

  watch(invadeActions, (newVal) => {
    if (!newVal.some((a: any) => a.ID === selectedOptionId.value)) {
      selectedOptionId.value = newVal[0]?.ID || 'act_inv_fragment_signal'
    }
  }, { immediate: true })

  const currentOption = computed(() => {
    return invadeActions.value.find((a: any) => a.ID === selectedOptionId.value) || invadeActions.value[0] || {
      ID: 'act_inv_fragment_signal',
      Name: 'Fragmentar Sinal',
      Icon: 'mdi-radio-tower',
      Detail: 'Você transmite informações falsas, mensagens obscenas ou sinais fantasmas para o núcleo computacional do alvo. Ele fica IMPEDIDO e LENTO até o final do próximo turno dele.',
      Terse: 'Deixa um personagem IMPEDIDO e LENTO até o final do próximo turno dele.',
    }
  })

  const sensorRange = computed(() => {
    return (
      (controller.value?.Parent as any)?.SensorRange ||
      (controller.value?.Parent as any)?.Sensors ||
      controller.value?.StatController?.getCurrent?.('sensors') ||
      controller.value?.RootActor?.SensorRange ||
      10
    )
  })

  const techAttackBonus = computed(() => {
    return controller.value?.TechAttackBonus ?? 0
  })

  const syntheticTechAttackWeapon = computed(() => {
    const opt = currentOption.value
    return {
      Name: `${opt?.Name || 'Invasão'}`,
      Size: 'Tech',
      WeaponTypes: ['Tech'],
      Range: [{ Type: 'Sensors', Value: sensorRange.value }],
      Damage: [{ Type: 'Heat', Value: 2 }],
      Tags: [{ Name: 'Ataque Tecnológico' }, { Name: 'Invasão' }],
    }
  })

  interface TargetOption {
    id: string
    title: string
    subtitle: string
    eDef: number
    combatant: CombatantData | null
  }

  const availableTargets = computed<TargetOption[]>(() => {
    const currentId = controller.value?.RootActor?.ID
    const list: TargetOption[] = []

    const combatants = encounterInstance.value?.Combatants || []
    for (const c of combatants) {
      if (c.actor?.CombatController?.RootActor?.ID === currentId) continue
      const name = c.actor?.Callsign || c.actor?.Name || c.name || 'Alvo'
      const eDef = c.actor?.CombatController?.Edefense || c.actor?.Edefense || c.actor?.StatController?.getCurrent?.('edef') || 8
      const heat = c.actor?.CombatController?.CurrentHeat ?? c.actor?.CurrentHeat ?? 0
      const maxHeat = c.actor?.CombatController?.MaxHeat ?? c.actor?.MaxHeat ?? 0
      const frame = c.actor?.Frame?.Name || c.actor?.Class || (c.side ? `Lado ${c.side}` : 'Combatente')

      list.push({
        id: c.id,
        title: name,
        subtitle: `${frame} // Calor: ${heat}/${maxHeat}`,
        eDef,
        combatant: c,
      })
    }

    list.push({
      id: 'manual_target',
      title: 'Alvo Manual / Qualquer Inimigo',
      subtitle: 'Aplicar invasão sem vincular a token',
      eDef: 8,
      combatant: null,
    })

    return list
  })

  const selectedTargetId = ref<string>(availableTargets.value[0]?.id || 'manual_target')

  watch(availableTargets, (targets) => {
    if (!targets.some(t => t.id === selectedTargetId.value)) {
      selectedTargetId.value = targets[0]?.id || 'manual_target'
    }
  }, { immediate: true })

  const selectedTarget = computed(() => {
    return availableTargets.value.find(t => t.id === selectedTargetId.value)
  })

  const appliedStatuses = computed(() => {
    const opt = currentOption.value
    if (!opt) return []
    if (opt.ID === 'act_inv_fragment_signal' || opt.ID === 'invade') {
      return [
        { name: 'Impedido', id: 'impaired', color: 'warning' },
        { name: 'Lento', id: 'slow', color: 'info' },
      ]
    }
    if (opt.AddStatus && Array.isArray(opt.AddStatus)) {
      return opt.AddStatus.map((s: any) => ({
        name: s.id ? s.id.toUpperCase() : 'Status',
        id: s.id,
        color: 'warning',
      }))
    }
    return [
      { name: 'Invasão Ativa', id: opt.ID, color: 'accent' },
    ]
  })

  const finishButtonText = computed(() => {
    return 'Concluir Invasão'
  })

  function apply(close: () => void, force = false) {
    if (!force && blockReason.value) {
      overridePrompt.value = true
      return
    }

    const opt = currentOption.value
    const optName = opt?.Name || 'Fragmentar Sinal'
    const targetCombatant = selectedTarget.value?.combatant
    const targetCc = targetCombatant?.actor?.CombatController

    if (targetCc) {
      controller.value.PerformAction(props.action.ID, {
        target: targetCc,
        force,
      })
      // Apply heat to target (+2 Heat)
      targetCc.ApplyHeat?.(2, { external: true })

      // Apply statuses
      if (opt.ID === 'act_inv_fragment_signal' || opt.ID === 'invade') {
        targetCc.AddStatus?.('impaired')
        targetCc.AddStatus?.('slow')
      } else if (opt.AddStatus) {
        opt.AddStatus.forEach((s: any) => {
          targetCc.AddStatus?.(s.id)
        })
      }
    } else {
      controller.value.PerformAction(props.action.ID, { force })
    }

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      controller.value?.CombatName ||
      'Piloto'
    const targetName = selectedTarget.value?.title || 'Alvo'

    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: `Invasão: ${optName}`,
      actionType: 'quick_action',
      targetName,
      detail: `Invasão executada com sucesso! Alvo sofreu +2 de Calor e recebeu ${appliedStatuses.value.map((s: any) => s.name).join(', ')}.`,
    })

    notify({
      title: 'Invasão Concluída',
      text: `${optName} aplicado com sucesso!`,
      type: 'success',
    })

    close()
  }
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
</style>
