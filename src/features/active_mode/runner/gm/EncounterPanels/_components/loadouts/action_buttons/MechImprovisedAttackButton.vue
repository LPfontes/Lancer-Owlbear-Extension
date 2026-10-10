<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { Action } from '@/classes/Action'
  import { useEncounterContext } from '../../../encounterContext'
  import CombatActionButton from './CombatActionButton.vue'
  import WeaponAttackHudModal from './WeaponAttackHudModal.vue'
  import WeaponDamageHudModal from './WeaponDamageHudModal.vue'
  import CcForceOverride from '@/ui/components/modals/CCForceOverride.vue'
  import { notify } from '@/util/notify'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const { owner, encounterInstance, activeController, ownerController } = useEncounterContext()
  const { t } = useI18n()

  const props = defineProps<{
    action: Action
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const overridePrompt = ref(false)
  const selectedTargetId = ref<string | null>(null)

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

  const isNpc = computed(() => !!combatController.value?.IsNpc)

  const npcTier = computed(() => {
    return (
      (owner.value?.actor as any)?.Tier ??
      (combatController.value as any)?.RootActor?.Tier ??
      1
    )
  })

  const syntheticImprovisedWeapon = computed(() => {
    let dmgVal = '1d6'
    if (isNpc.value) {
      dmgVal = npcTier.value === 3 ? '6' : npcTier.value === 2 ? '4' : '3'
    }

    return {
      InstanceID: 'improvised_attack_weapon',
      Name: props.action.Name || 'Ataque Improvisado',
      Size: 'Auxiliary',
      WeaponTypes: ['Melee'],
      Range: [{ Type: 'Threat', Value: 1 }],
      Damage: [{ Type: 'Kinetic', Value: dmgVal }],
      Tags: [{ Name: 'Corpo a Corpo' }, { Name: 'Improvisado' }],
    }
  })

  const availableTargets = computed(() => {
    if (!encounterInstance.value?.Combatants) return []
    return encounterInstance.value.Combatants.filter(
      (c: any) =>
        c.actor?.CombatController?.RootActor?.ID !==
        combatController.value?.RootActor?.ID
    )
  })

  const selectedTarget = computed(() => {
    if (!selectedTargetId.value) return null
    return availableTargets.value.find((c: any) => c.actor?.ID === selectedTargetId.value) || null
  })

  const blockReason = computed(() => {
    return combatController.value?.BlockedReasonFor('full', {
      actionId: props.action.ID,
    })
  })

  function apply(close: () => void, force = false) {
    const cc = combatController.value
    if (!cc) return

    if (!force && blockReason.value) {
      overridePrompt.value = true
      return
    }

    cc.SetCombatAction('full', false)
    if (activeController.value && activeController.value !== cc) {
      activeController.value.SetCombatAction('full', false)
    }
    if (
      ownerController.value &&
      ownerController.value !== cc &&
      ownerController.value !== activeController.value
    ) {
      ownerController.value.SetCombatAction('full', false)
    }

    cc.MarkActionUsed(props.action.ID)
    cc.DropAttackRevealedStatuses()

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      activeMech.value?.Name ||
      cc.CombatName ||
      'Piloto'

    const targetName = selectedTarget.value?.actor?.Name || undefined

    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: props.action.Name || 'Ataque Improvisado',
      actionType: 'full_action',
      targetName,
    })

    notify({
      title: props.action.Name || 'Ataque Improvisado',
      text: t('hud.improvisedAttackCompleted') || 'Ataque Improvisado Concluído!',
      type: 'success',
    })

    emit('activate', props.action.ID)
    close()
  }
</script>

<template>
  <combat-action-button
    :action="action"
    min-width="650px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Action Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-6"
              color="action--full"
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
            color="action--full"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            {{ $enum('activationType', action.Activation || 'Full') }}
          </v-chip>
        </div>

        <!-- Target Selector (Optional) -->
        <div
          v-if="availableTargets.length"
          class="pa-3 mb-3 bg-panel rounded border-sm"
        >
          <div class="text-caption text-disabled mb-1 font-weight-bold">
            <v-icon icon="mdi-crosshairs-gps" size="14" class="mr-1" />
            {{ $t('ui.fields.selectTarget') }}
          </div>
          <v-select
            v-model="selectedTargetId"
            :items="availableTargets"
            item-title="actor.Name"
            item-value="actor.ID"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            :placeholder="$t('ui.combat.noTarget')"
          />
        </div>

        <!-- Weapon Card Profile -->
        <div class="weapon-card pa-3 mb-3 rounded bg-panel border-sm">
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
            <div class="d-flex align-center flex-wrap ga-2">
              <div class="d-flex align-center ga-1 font-weight-bold">
                <v-icon icon="mdi-hammer-wrench" size="18" class="text-primary mr-1" />
                <span class="text-subtitle-1 text-white">{{ syntheticImprovisedWeapon.Name }}</span>
                <v-chip size="x-small" color="secondary" variant="outlined" class="ml-1">
                  Auxiliar // Corpo a Corpo
                </v-chip>
              </div>

              <span class="text-disabled">//</span>

              <div class="d-flex align-center ga-1 text-caption text-disabled">
                <v-icon icon="cc:range" size="14" />
                <span>Ameaça 1</span>
              </div>

              <span class="text-disabled">//</span>

              <div class="d-flex align-center ga-1 text-caption text-accent font-weight-bold">
                <v-icon icon="mdi-flash" size="14" />
                <span>{{ syntheticImprovisedWeapon.Damage[0].Value }} Cinético</span>
              </div>
            </div>

            <!-- Tags -->
            <div class="d-flex ga-1 flex-wrap">
              <v-chip
                v-for="tg in syntheticImprovisedWeapon.Tags"
                :key="tg.Name"
                size="x-small"
                variant="tonal"
                color="disabled"
              >
                {{ tg.Name }}
              </v-chip>
            </div>
          </div>

          <!-- Weapon Attack & Damage Modals Activators -->
          <div class="weapon-actions-row d-flex ga-2 mt-2">
            <div class="flex-grow-1">
              <weapon-attack-hud-modal
                :item="syntheticImprovisedWeapon"
                :controller="combatController"
              />
            </div>
            <div class="flex-grow-1">
              <weapon-damage-hud-modal
                :item="syntheticImprovisedWeapon"
                :controller="combatController"
              />
            </div>
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
            color="action--full"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            @click="apply(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>{{ $t('hud.finishImprovisedAttack') || 'Concluir Ataque Improvisado' }}</span>
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
  .weapon-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
</style>
