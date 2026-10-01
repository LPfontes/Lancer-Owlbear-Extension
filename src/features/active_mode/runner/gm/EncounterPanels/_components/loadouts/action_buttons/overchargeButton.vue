<template>
  <combat-action-button :action="action">
    <template #default="{ close }">
      <v-card
        color="panel"
        flat
        tile
        class="px-12"
      >
        <cc-synergy-display
          location="overcharge"
          :mech="controller.Parent"
          alert
        />
        <div class="text-center text-cc-overline text-disabled my-2">
          {{ $t('active.overcharge.cost') }}
        </div>
        <div class="d-flex align-stretch justify-space-between position-relative mt-6 mb-8 px-1">
          <div
            v-for="(t, n) in controller.OverchargeTrack"
            :key="`overcharge-${n}`"
            class="d-flex flex-column align-center justify-center position-relative"
            style="z-index: 2; flex: 1;"
          >


            <v-card
              @click="roll(Number(n))"
              :variant="Number(currentOvercharge) > Number(n) ? 'flat' : (Number(currentOvercharge) === Number(n) ? 'elevated' : 'outlined')"
              :color="Number(currentOvercharge) >= Number(n) ? 'overcharge' : 'grey-darken-2'"
              class="d-flex flex-column align-center justify-center py-2 w-100 mx-1 bg-panel cursor-pointer"
              style="transform: skewX(-15deg); border-radius: 4px; transition: all 0.3s ease; position: relative; overflow: visible;"
              :style="Number(currentOvercharge) === Number(n) ? 'box-shadow: 0 0 15px rgba(var(--v-theme-overcharge), 0.5); transform: scale(1.1) skewX(-15deg); z-index: 3; border: 1px solid rgb(var(--v-theme-overcharge));' : (Number(currentOvercharge) > Number(n) ? 'opacity: 0.3;' : 'border-style: dashed !important; border-width: 2px !important;')"
            >
              <div 
                style="transform: skewX(15deg);" 
                class="d-flex align-center justify-center text-center px-1"
              >
                <v-icon size="18" class="mr-1" :color="Number(currentOvercharge) === Number(n) ? 'white' : ''">cc:heat</v-icon>
                <span class="heading h4 mb-0 font-weight-black" :class="Number(currentOvercharge) === Number(n) ? 'text-white' : ''">
                  +{{ t }}
                </span>
              </div>
            </v-card>
          </div>
        </div>

      </v-card>

      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mt-4 pb-2 px-12">
        <v-btn
          variant="plain"
          color="disabled"
          @click="close"
        >
          Cancelar
        </v-btn>
        <v-btn
          color="action--quick"
          variant="elevated"
          class="font-weight-bold px-4"
          height="36"
          :disabled="heatMissing"
          @click="apply(); close()"
        >
          <v-icon start icon="mdi-check-all" size="18" />
          Concluir Sobrecarga {{ heatCost !== null ? `(${heatCost} de Calor)` : '' }}
        </v-btn>
      </div>
    </template>
  </combat-action-button>
</template>

<script setup lang="ts">
  import type { EncounterInstance } from '@/classes/encounter/EncounterInstance'
  import { useEncounterContext } from '../../../encounterContext'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import type { Action } from '@/classes/Action'
  import { computed, ref } from 'vue'
  import { DamageType } from '@/classes/enums'
  import { DiceRoller } from '@/classes/dice/DiceRoller'
  import CombatActionButton from './CombatActionButton.vue'
  import MenuInput from '@/ui/components/chips/_activeeffect/_ae_menu_input.vue'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const { owner, encounterInstance, activeController: controller } = useEncounterContext()

  const props = defineProps<{
    action: Action
  }>()

  const heatCost = ref<number | null>(null)

  const heatMissing = computed(() => {
    const v = heatCost.value
    return v === null || String(v).trim() === '' || !Number.isFinite(Number(v))
  })

  const currentOvercharge = computed(() => {
    return controller.value.OverchargeLevel
  })

  function roll(index: number) {
    const formula = controller.value.OverchargeTrack[index] || '1d6'
    heatCost.value = DiceRoller.roll(formula)

    void dddiceService.rollDice({
      diceString: formula,
      label: `Overcharge Heat [${controller.value.CombatName || 'Mech'}]`,
      external_id: controller.value.CombatName || undefined,
    })

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      controller.value?.CombatName ||
      'Piloto'
    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'roll',
      title: 'Rolagem de Calor de Superaquecimento',
      detail: `Gerou ${heatCost.value} de calor (${formula})`,
      roll: {
        total: Number(heatCost.value) || 0,
        formula: formula,
        isCrit: false,
      },
      tags: ['Superaquecimento', 'Calor'],
    })
  }
  function apply() {
    const cost = heatCost.value === null ? undefined : Number(heatCost.value)
    controller.value.RunAction(props.action.ID, {
      value: cost,
    })

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      controller.value?.CombatName ||
      'Piloto'
    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: 'Sobrecarga',
      actionType: 'protocol',
      detail: cost !== undefined ? `+${cost} de Calor recebido` : undefined,
    })

    heatCost.value = null
  }
  function reset() {
    controller.value.UndoActivation(props.action.Activation, { actionId: props.action.ID })
  }
</script>
