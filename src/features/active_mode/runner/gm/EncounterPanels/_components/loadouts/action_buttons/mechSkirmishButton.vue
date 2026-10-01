<template>
  <combat-action-button
    :action="action"
    :preset-weapon="presetWeapon"
    :mobile="mobile"
    min-width="760px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Mount Skirmish Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-3"
              color="action--quick"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ $t('hud.skirmishMountTitle') }}
              </div>
              <div class="text-caption text-disabled">
                {{ action.Terse || 'Ataque com uma única arma. Além do seu ataque primário, você também pode atacar com uma arma Auxiliar diferente que esteja no mesmo encaixe.' }}
              </div>
            </div>
          </div>
          <v-chip
            color="action--quick"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            {{ $enum('activationType', action.Activation) }}
          </v-chip>
        </div>

        <!-- Mount Selector -->
        <div class="mount-selector-card pa-3 mb-3 rounded bg-panel border-sm">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-overline font-weight-bold text-accent">
              <v-icon icon="mdi-vector-combine" size="16" class="mr-1" />
              {{ $t('hud.selectMount') }}
            </span>
            <span class="text-caption text-disabled">
              {{ availableMounts.length }} {{ availableMounts.length === 1 ? 'encaixe disponível' : 'encaixes disponíveis' }}
            </span>
          </div>

          <v-select
            v-model="selectedMountId"
            :items="availableMounts"
            item-value="id"
            variant="outlined"
            density="compact"
            hide-details
            bg-color="surface"
            class="mount-select"
          >
            <template #selection="{ item }">
              <div class="d-flex align-center justify-space-between w-100 pr-2">
                <span class="font-weight-bold text-white">{{ item.raw.title }}</span>
                <span class="text-caption text-disabled ml-2">// {{ item.raw.weaponsText }}</span>
              </div>
            </template>
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps" :disabled="item.raw.disabled">
                <template #title>
                  <div class="d-flex align-center justify-space-between">
                    <span class="font-weight-bold">{{ item.raw.title }}</span>
                    <v-chip
                      v-if="item.raw.disabled"
                      size="x-small"
                      color="error"
                      class="ml-2"
                    >
                      {{ item.raw.disabledReason }}
                    </v-chip>
                    <v-chip
                      v-else
                      size="x-small"
                      color="primary"
                      class="ml-2"
                    >
                      {{ item.raw.weaponCount }} {{ item.raw.weaponCount === 1 ? 'Arma' : 'Armas' }}
                    </v-chip>
                  </div>
                </template>
                <template #subtitle>
                  <div class="text-caption text-disabled mt-1">
                    {{ item.raw.weaponsText }}
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>

        <!-- No Mounts Warning -->
        <div
          v-if="!currentMount || currentWeapons.length === 0"
          class="pa-4 text-center text-disabled bg-panel rounded border-sm mb-3"
        >
          <v-icon icon="mdi-alert-circle-outline" size="32" class="mb-2" />
          <div>Nenhum Encaixe de Armas com armas operacionais encontrado neste Mech.</div>
        </div>

        <!-- Weapons in Selected Mount -->
        <div v-else class="mount-weapons-container">
          <div
            v-for="(w, idx) in currentWeapons"
            :key="w.InstanceID || idx"
            class="weapon-card pa-3 mb-3 rounded bg-panel border-sm"
          >
            <!-- Weapon Header & Details -->
            <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
              <div class="d-flex align-center flex-wrap ga-2">
                <v-chip
                  v-if="currentWeapons.length > 1"
                  size="x-small"
                  :color="idx === 0 ? 'primary' : 'secondary'"
                  variant="elevated"
                  class="font-weight-bold"
                >
                  {{ idx === 0 ? 'Arma Primária' : 'Arma Auxiliar' }}
                </v-chip>

                <div class="d-flex align-center ga-1 font-weight-bold">
                  <v-icon icon="cc:weapon" size="18" class="text-primary mr-1" />
                  <span class="text-subtitle-1 text-white">{{ w.Name }}</span>
                  <v-chip size="x-small" color="secondary" variant="outlined" class="ml-1">
                    {{ w.Size }} {{ (w.WeaponTypes && w.WeaponTypes.length) ? w.WeaponTypes.join('/') : '' }}
                  </v-chip>
                </div>

                <span class="text-disabled">//</span>

                <div class="d-flex align-center ga-1 text-caption text-disabled">
                  <v-icon icon="cc:range" size="14" />
                  <span>{{ getRangeString(w) }}</span>
                </div>

                <span class="text-disabled">//</span>

                <div class="d-flex align-center ga-1 text-caption text-accent font-weight-bold">
                  <v-icon icon="mdi-flash" size="14" />
                  <span>{{ getDamageString(w) }}</span>
                </div>
              </div>

              <!-- Weapon Tags -->
              <div class="d-flex ga-1 flex-wrap">
                <v-chip
                  v-for="tg in (w.Tags || [])"
                  :key="tg.ID || tg.Name"
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
                  :item="w"
                  :controller="combatController"
                />
              </div>
              <div class="flex-grow-1">
                <weapon-damage-hud-modal
                  :item="w"
                  :controller="combatController"
                />
              </div>
            </div>
          </div>
        </div>

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
            color="action--quick"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            :disabled="!currentMount || currentWeapons.length === 0"
            @click="finishSkirmish(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>{{ $t('hud.finishSkirmish') }}</span>
          </v-btn>
        </div>
      </div>
    </template>
  </combat-action-button>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useI18n } from 'vue-i18n'
  import type { Action } from '@/classes/Action'
  import { MechWeapon } from '@/classes/mech/components/equipment/MechWeapon'
  import type Mount from '@/classes/mech/components/mount/Mount'
  import { useEncounterContext } from '../../../encounterContext'
  import CombatActionButton from './CombatActionButton.vue'
  import WeaponAttackHudModal from './WeaponAttackHudModal.vue'
  import WeaponDamageHudModal from './WeaponDamageHudModal.vue'
  import { notify } from '@/util/notify'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { enumLabel } from '@/i18n/enumLabel'

  const _display = useDisplay()
  const { t } = useI18n()
  const { owner, ownerController, activeController } = useEncounterContext()

  const props = defineProps<{
    action: Action
    presetWeapon?: MechWeapon
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const mobile = computed(() => _display.mdAndDown.value)

  const activeMech = computed(() => {
    return (
      ownerController.value?.RootActor?.ActiveMech ||
      owner.value?.actor?.ActiveMech ||
      null
    )
  })

  const combatController = computed(() => {
    return (
      activeMech.value?.CombatController ||
      activeController.value ||
      ownerController.value
    )
  })

  // Mount Interface
  interface MountOption {
    id: string
    title: string
    mount: Mount
    type: string
    weapons: MechWeapon[]
    weaponsText: string
    weaponCount: number
    disabled: boolean
    disabledReason?: string
  }

  function getMountTypeFriendlyName(type: string, name?: string): string {
    if (name && !name.includes('Mount') && !name.includes('Encaixe')) return name
    switch (type) {
      case 'Main':
        return 'Encaixe Principal (Main)'
      case 'Heavy':
        return 'Encaixe Pesado (Heavy)'
      case 'AuxAux':
        return 'Encaixe Auxiliar / Auxiliar (Aux/Aux)'
      case 'MainAux':
        return 'Encaixe Principal / Auxiliar (Main/Aux)'
      case 'Flex':
        return 'Encaixe Flexível (Flex)'
      case 'Integrated':
        return 'Encaixe Integrado'
      case 'Superheavy':
        return 'Encaixe Superpesado'
      default:
        return name || `${type} Mount`
    }
  }

  const availableMounts = computed<MountOption[]>(() => {
    if (!activeMech.value) return []
    const loadout = activeMech.value.MechLoadoutController.ActiveLoadout
    const rawMounts = loadout.AllActiveMounts(activeMech.value)

    return rawMounts.map((m: any, idx: number) => {
      const weapons = (m.Weapons || []).filter((w: any) => !!w) as MechWeapon[]
      const isSuperheavy = weapons.some(
        (w: any) => w.Size === 'Superheavy' || w.Type === 'Superheavy'
      )
      const friendlyName = getMountTypeFriendlyName(m.Type, m.Name)
      const weaponsNames = weapons.map((w: any) => w.Name).join(' + ')

      return {
        id: m.ID || `mount_${idx}`,
        title: friendlyName,
        mount: m,
        type: m.Type,
        weapons,
        weaponsText: weaponsNames || 'Nenhuma arma instalada',
        weaponCount: weapons.length,
        disabled: isSuperheavy || weapons.length === 0,
        disabledReason: isSuperheavy
          ? 'Superpesada (Apenas Barragem)'
          : weapons.length === 0
          ? 'Sem armas'
          : undefined,
      }
    })
  })

  const selectedMountId = ref<string>('')

  // Auto-select mount when available
  watch(
    availableMounts,
    mounts => {
      if (!mounts.length) return
      if (props.presetWeapon) {
        const match = mounts.find(m =>
          m.weapons.some(w => w.InstanceID === props.presetWeapon?.InstanceID)
        )
        if (match && !match.disabled) {
          selectedMountId.value = match.id
          return
        }
      }
      if (!selectedMountId.value || !mounts.some(m => m.id === selectedMountId.value)) {
        const firstValid = mounts.find(m => !m.disabled)
        if (firstValid) {
          selectedMountId.value = firstValid.id
        }
      }
    },
    { immediate: true }
  )

  const currentMount = computed(() => {
    return availableMounts.value.find(m => m.id === selectedMountId.value) || null
  })

  const currentWeapons = computed<MechWeapon[]>(() => {
    return currentMount.value?.weapons || []
  })

  function getRangeString(w: MechWeapon): string {
    if (w.Range && w.Range.length) {
      return w.Range.map((r: any) => {
        const typeLabel = r.Type ? enumLabel('rangeType', r.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${r.Value}`
      }).join(', ')
    }
    return `${t('hud.range')} 10`
  }

  function getDamageString(w: MechWeapon): string {
    if (w.Damage && w.Damage.length) {
      return w.Damage.map((d: any) => {
        const typeLabel = d.Type ? enumLabel('damageType', d.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${d.Value}`
      }).join(' + ')
    }
    return 'Dano'
  }

  // Finish Skirmish Action
  function finishSkirmish(closeDialog: () => void) {
    const primaryWeapon = currentWeapons.value[0]
    const controller = combatController.value || activeController.value || ownerController.value
    if (controller) {
      if (primaryWeapon) {
        controller.UseAttackAction('act_skirmish', primaryWeapon.InstanceID)
        for (let i = 1; i < currentWeapons.value.length; i++) {
          if (currentWeapons.value[i]?.InstanceID) {
            controller.MarkActionUsed(currentWeapons.value[i].InstanceID)
          }
        }
      } else {
        controller.MarkActionUsed('act_skirmish')
      }
      controller.DropAttackRevealedStatuses()
      controller.SetCombatAction('quick', false)

      if (activeController.value && activeController.value !== controller) {
        activeController.value.SetCombatAction('quick', false)
      }
      if (
        ownerController.value &&
        ownerController.value !== controller &&
        ownerController.value !== activeController.value
      ) {
        ownerController.value.SetCombatAction('quick', false)
      }

      try {
        const action = controller.FindAction?.('act_skirmish') || props.action
        controller.Record?.('action', {
          action: { id: 'act_skirmish', name: action?.Name || 'Skirmish' },
          activation: 'quick',
          free: false,
        })
      } catch (_e) {
        // ignore logging error
      }

      const actorName =
        (owner.value?.actor as any)?.Callsign ||
        (owner.value?.actor as any)?.Name ||
        activeMech.value?.Name ||
        'Piloto'
      void useTableActionStore().broadcastCombatAction({
        actorName,
        actionName: 'Alvejar',
        actionType: 'quick_action',
      })

      emit('activate', 'act_skirmish')
    }
    notify({ text: t('hud.skirmishCompleted'), type: 'success' })
    closeDialog()
  }
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
  .weapon-card {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .mount-selector-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
</style>
