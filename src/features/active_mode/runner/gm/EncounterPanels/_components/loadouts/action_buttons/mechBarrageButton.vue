<template>
  <combat-action-button
    :action="action"
    :preset-weapon="presetWeapon"
    :mobile="mobile"
    min-width="840px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Mount Barrage Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-6"
              color="action--full"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ $t('hud.barrageMountTitle') }}
              </div>
              <div class="text-caption text-disabled">
                {{ action.Terse || 'Ataque com dois encaixes de armas (ou uma única arma Superpesada). Além dos seus ataques primários, você também pode atacar com armas Auxiliares adicionais nos mesmos encaixes.' }}
              </div>
            </div>
          </div>
          <v-chip
            color="action--full"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            {{ $enum('activationType', action.Activation) }}
          </v-chip>
        </div>

        <!-- Mount Selectors (Dual Mount / Superheavy) -->
        <v-row dense class="mb-3">
          <!-- Mount 1 Selector -->
          <v-col cols="12" :md="isMount1Superheavy ? 12 : 6">
            <div class="mount-selector-card pa-3 rounded bg-panel border-sm h-100">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-overline font-weight-bold text-accent">
                  <v-icon icon="mdi-numeric-1-box" size="16" class="mr-1" />
                  {{ $t('hud.selectMount1') }}
                </span>
                <span class="text-caption text-disabled">
                  {{ availableMounts.length }} {{ availableMounts.length === 1 ? 'encaixe disponível' : 'encaixes disponíveis' }}
                </span>
              </div>

              <v-select
                v-model="selectedMount1Id"
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
                          v-else-if="item.raw.isSuperheavy"
                          size="x-small"
                          color="warning"
                          class="ml-2 font-weight-bold"
                        >
                          Superpesada
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
          </v-col>

          <!-- Superheavy Alert (When Mount 1 is Superheavy) -->
          <v-col v-if="isMount1Superheavy" cols="12" class="mt-2">
            <div class="superheavy-alert-card pa-3 rounded border-sm d-flex align-center ga-3">
              <v-icon icon="mdi-alert-decagram" color="warning" size="28" />
              <div>
                <div class="font-weight-bold text-warning">
                  {{ $t('hud.superheavyBarrageNotice') }}
                </div>
                <div class="text-caption text-disabled">
                  Armas Superpesadas consomem toda a ação de Barragem para atacar e não requerem um 2º encaixe de armas.
                </div>
              </div>
            </div>
          </v-col>

          <!-- Mount 2 Selector (When Mount 1 is NOT Superheavy) -->
          <v-col v-else cols="12" md="6">
            <div class="mount-selector-card pa-3 rounded bg-panel border-sm h-100">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-overline font-weight-bold text-accent">
                  <v-icon icon="mdi-numeric-2-box" size="16" class="mr-1" />
                  {{ $t('hud.selectMount2') }}
                </span>
                <span class="text-caption text-disabled">
                  {{ availableMounts2.length }} {{ availableMounts2.length === 1 ? 'encaixe disponível' : 'encaixes disponíveis' }}
                </span>
              </div>

              <v-select
                v-if="availableMounts2.length > 0"
                v-model="selectedMount2Id"
                :items="availableMounts2"
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
              <div v-else class="pa-2 text-caption text-disabled text-center">
                Apenas 1 encaixe de armas ativo disponível neste Mech.
              </div>
            </div>
          </v-col>
        </v-row>

        <!-- No Mounts Warning -->
        <div
          v-if="!currentMount1 || currentWeapons1.length === 0"
          class="pa-4 text-center text-disabled bg-panel rounded border-sm mb-3"
        >
          <v-icon icon="mdi-alert-circle-outline" size="32" class="mb-2" />
          <div>Nenhum Encaixe de Armas com armas operacionais encontrado neste Mech.</div>
        </div>

        <!-- Weapons Display -->
        <div v-else class="mount-weapons-container">
          <!-- Mount 1 Weapons Section -->
          <div class="mount-section mb-4">
            <div class="mount-section-header d-flex align-center ga-2 px-3 py-1 mb-2 rounded">
              <v-chip size="x-small" color="accent" variant="elevated" class="font-weight-bold">
                1º ENCAIXE
              </v-chip>
              <span class="font-weight-bold text-white text-body-2">{{ currentMount1.title }}</span>
              <span class="text-caption text-disabled">// {{ currentMount1.weaponsText }}</span>
            </div>

            <div
              v-for="(w, idx) in currentWeapons1"
              :key="`m1-${w.InstanceID || idx}`"
              class="weapon-card pa-3 mb-2 rounded bg-panel border-sm"
            >
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <div class="d-flex align-center flex-wrap ga-2">
                  <v-chip
                    v-if="currentWeapons1.length > 1"
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

          <!-- Mount 2 Weapons Section (When NOT Superheavy and Mount 2 selected) -->
          <div v-if="!isMount1Superheavy && currentMount2 && currentWeapons2.length > 0" class="mount-section mb-4">
            <div class="mount-section-header d-flex align-center ga-2 px-3 py-1 mb-2 rounded">
              <v-chip size="x-small" color="accent" variant="elevated" class="font-weight-bold">
                2º ENCAIXE
              </v-chip>
              <span class="font-weight-bold text-white text-body-2">{{ currentMount2.title }}</span>
              <span class="text-caption text-disabled">// {{ currentMount2.weaponsText }}</span>
            </div>

            <div
              v-for="(w, idx) in currentWeapons2"
              :key="`m2-${w.InstanceID || idx}`"
              class="weapon-card pa-3 mb-2 rounded bg-panel border-sm"
            >
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <div class="d-flex align-center flex-wrap ga-2">
                  <v-chip
                    v-if="currentWeapons2.length > 1"
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
            color="action--full"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            :disabled="isFinishDisabled"
            @click="finishBarrage(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>{{ $t('hud.finishBarrage') }}</span>
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

  defineOptions({ name: 'MechBarrageButton' })

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
    isSuperheavy: boolean
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
      const isSuperheavy =
        m.Type === 'Superheavy' ||
        weapons.some((w: any) => w.Size === 'Superheavy' || w.Type === 'Superheavy')
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
        isSuperheavy,
        disabled: weapons.length === 0,
        disabledReason: weapons.length === 0 ? 'Sem armas' : undefined,
      }
    })
  })

  const selectedMount1Id = ref<string>('')
  const selectedMount2Id = ref<string>('')

  const currentMount1 = computed(() => {
    return availableMounts.value.find(m => m.id === selectedMount1Id.value) || null
  })

  const isMount1Superheavy = computed(() => {
    return !!currentMount1.value?.isSuperheavy
  })

  const availableMounts2 = computed<MountOption[]>(() => {
    return availableMounts.value.filter(m => {
      if (m.id === selectedMount1Id.value) return false
      if (m.isSuperheavy) return false
      if (m.disabled) return false
      return true
    })
  })

  const currentMount2 = computed(() => {
    if (isMount1Superheavy.value) return null
    return availableMounts2.value.find(m => m.id === selectedMount2Id.value) || null
  })

  const currentWeapons1 = computed<MechWeapon[]>(() => {
    return currentMount1.value?.weapons || []
  })

  const currentWeapons2 = computed<MechWeapon[]>(() => {
    return currentMount2.value?.weapons || []
  })

  // Watch mount changes for auto-selection
  watch(
    availableMounts,
    mounts => {
      if (!mounts.length) return

      // Select Mount 1
      if (props.presetWeapon) {
        const match = mounts.find(m =>
          m.weapons.some(w => w.InstanceID === props.presetWeapon?.InstanceID)
        )
        if (match && !match.disabled) {
          selectedMount1Id.value = match.id
        }
      }
      if (!selectedMount1Id.value || !mounts.some(m => m.id === selectedMount1Id.value)) {
        const firstValid = mounts.find(m => !m.disabled)
        if (firstValid) {
          selectedMount1Id.value = firstValid.id
        }
      }

      // Select Mount 2
      if (isMount1Superheavy.value) {
        selectedMount2Id.value = ''
      } else {
        const validFor2 = mounts.filter(
          m => !m.disabled && !m.isSuperheavy && m.id !== selectedMount1Id.value
        )
        if (!selectedMount2Id.value || !validFor2.some(m => m.id === selectedMount2Id.value)) {
          selectedMount2Id.value = validFor2[0]?.id || ''
        }
      }
    },
    { immediate: true }
  )

  // Watch Mount 1 changes to re-evaluate Mount 2
  watch(selectedMount1Id, newId => {
    if (isMount1Superheavy.value) {
      selectedMount2Id.value = ''
      return
    }
    const validFor2 = availableMounts.value.filter(
      m => !m.disabled && !m.isSuperheavy && m.id !== newId
    )
    if (!selectedMount2Id.value || !validFor2.some(m => m.id === selectedMount2Id.value)) {
      selectedMount2Id.value = validFor2[0]?.id || ''
    }
  })

  const isFinishDisabled = computed(() => {
    if (!currentMount1.value || currentWeapons1.value.length === 0) return true
    if (!isMount1Superheavy.value && availableMounts2.value.length > 0) {
      if (!currentMount2.value || currentWeapons2.value.length === 0) return true
    }
    return false
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

  // Finish Barrage Action
  function finishBarrage(closeDialog: () => void) {
    const primaryWeapon1 = currentWeapons1.value[0]
    const allWeapons: MechWeapon[] = [...currentWeapons1.value]
    if (!isMount1Superheavy.value && currentWeapons2.value.length) {
      allWeapons.push(...currentWeapons2.value)
    }

    const controller = combatController.value || activeController.value || ownerController.value
    if (controller) {
      if (primaryWeapon1) {
        controller.UseAttackAction('act_barrage', primaryWeapon1.InstanceID)
        for (const w of allWeapons) {
          if (w?.InstanceID && w.InstanceID !== primaryWeapon1.InstanceID) {
            controller.MarkActionUsed(w.InstanceID)
          }
        }
      } else {
        controller.MarkActionUsed('act_barrage')
      }

      controller.DropAttackRevealedStatuses()
      controller.SetCombatAction('full', false)

      if (activeController.value && activeController.value !== controller) {
        activeController.value.SetCombatAction('full', false)
      }
      if (
        ownerController.value &&
        ownerController.value !== controller &&
        ownerController.value !== activeController.value
      ) {
        ownerController.value.SetCombatAction('full', false)
      }

      try {
        const action = controller.FindAction?.('act_barrage') || props.action
        controller.Record?.('action', {
          action: { id: 'act_barrage', name: action?.Name || 'Barrage' },
          activation: 'full',
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
        actionName: 'Barragem',
        actionType: 'full_action',
      })

      emit('activate', 'act_barrage')
    }
    notify({ text: t('hud.barrageCompleted'), type: 'success' })
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
  .superheavy-alert-card {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .mount-section-header {
    border-left: 3px solid rgb(var(--v-theme-primary));
    background: rgba(255, 255, 255, 0.03);
  }
</style>
