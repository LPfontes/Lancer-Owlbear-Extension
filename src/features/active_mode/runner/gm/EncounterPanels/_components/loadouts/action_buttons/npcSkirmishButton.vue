<template>
  <combat-action-button
    :action="action"
    :preset-weapon="presetWeapon"
    :mobile="mobile"
    min-width="760px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-3"
              color="action--quick"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                Alvejar — Armas do NPC
              </div>
              <div class="text-caption text-disabled">
                {{ action.Terse || 'Selecione uma arma do NPC para atacar e rolar o dano.' }}
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

        <!-- Weapon Selector -->
        <div class="weapon-selector-card pa-3 mb-3 rounded bg-panel border-sm">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-overline font-weight-bold text-accent">
              <v-icon icon="mdi-vector-combine" size="16" class="mr-1" />
              Selecione a Arma
            </span>
            <span class="text-caption text-disabled">
              {{ availableWeapons.length }} {{ availableWeapons.length === 1 ? 'arma disponível' : 'armas disponíveis' }}
            </span>
          </div>

          <v-select
            v-model="selectedWeaponId"
            :items="availableWeapons"
            item-value="ID"
            variant="outlined"
            density="compact"
            hide-details
            bg-color="surface"
            class="weapon-select"
          >
            <template #selection="{ item }">
              <div class="d-flex align-center justify-space-between w-100 pr-2">
                <span class="font-weight-bold text-white">{{ item.raw.Name }}</span>
                <span class="text-caption text-disabled ml-2">// {{ item.raw.WeaponType || item.raw.FeatureType || 'Arma' }}</span>
              </div>
            </template>
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <template #title>
                  <div class="d-flex align-center justify-space-between">
                    <span class="font-weight-bold">{{ item.raw.Name }}</span>
                    <v-chip size="x-small" color="primary" class="ml-2">
                      {{ item.raw.WeaponType || 'Arma' }}
                    </v-chip>
                  </div>
                </template>
                <template #subtitle>
                  <div class="text-caption text-disabled mt-1">
                    {{ item.raw.Effect || item.raw.Detail || '' }}
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>

        <!-- No Weapons Warning -->
        <div
          v-if="!currentWeapon"
          class="pa-4 text-center text-disabled bg-panel rounded border-sm mb-3"
        >
          <v-icon icon="mdi-alert-circle-outline" size="32" class="mb-2" />
          <div>Nenhuma arma de combate disponível encontrada neste NPC.</div>
        </div>

        <!-- Weapon Card Display -->
        <div v-else class="mount-weapons-container">
          <div class="weapon-card pa-3 mb-3 rounded bg-panel border-sm">
            <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
              <div class="d-flex align-center flex-wrap ga-2">
                <div class="d-flex align-center ga-1 font-weight-bold">
                  <v-icon icon="cc:weapon" size="18" class="text-primary mr-1" />
                  <span class="text-subtitle-1 text-white">{{ currentWeapon.Name }}</span>
                  <v-chip size="x-small" color="secondary" variant="outlined" class="ml-1">
                    {{ currentWeapon.WeaponType || 'Arma NPC' }}
                  </v-chip>
                </div>

                <span class="text-disabled">//</span>

                <div class="d-flex align-center ga-1 text-caption text-disabled">
                  <v-icon icon="cc:range" size="14" />
                  <span>{{ getRangeString(currentWeapon) }}</span>
                </div>

                <span class="text-disabled">//</span>

                <div class="d-flex align-center ga-1 text-caption text-accent font-weight-bold">
                  <v-icon icon="mdi-flash" size="14" />
                  <span>{{ getDamageString(currentWeapon) }}</span>
                </div>
              </div>

              <!-- Tags -->
              <div class="d-flex ga-1 flex-wrap">
                <v-chip
                  v-for="tg in (currentWeapon.Tags || [])"
                  :key="tg.ID || tg.Name"
                  size="x-small"
                  variant="tonal"
                  color="disabled"
                >
                  {{ tg.Name }}
                </v-chip>
              </div>
            </div>

            <!-- Attack & Damage Modals -->
            <div class="weapon-actions-row d-flex ga-2 mt-2">
              <div class="flex-grow-1">
                <weapon-attack-hud-modal
                  :item="currentWeapon"
                  :controller="controller"
                />
              </div>
              <div class="flex-grow-1">
                <weapon-damage-hud-modal
                  :item="currentWeapon"
                  :controller="controller"
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
  import type { NpcWeapon } from '@/classes/npc/feature/NpcItem/NpcWeapon'
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
    presetWeapon?: NpcWeapon
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const mobile = computed(() => _display.mdAndDown.value)

  const controller = computed(() => {
    return activeController.value || ownerController.value || (owner.value?.actor as any)?.CombatController
  })

  const availableWeapons = computed<any[]>(() => {
    const actor = owner.value?.actor as any
    if (!actor) return []
    const weapons: any[] = []
    const features = actor.NpcFeatureController?.ActiveFeatures || actor.Features || []
    for (const f of features) {
      if (f.ItemType === 'NpcWeapon' || f.Damage || f.WeaponType) {
        weapons.push(f)
      }
    }
    return weapons
  })

  const selectedWeaponId = ref<string>('')

  watch(
    availableWeapons,
    list => {
      if (!list.length) return
      if (props.presetWeapon?.ID) {
        selectedWeaponId.value = props.presetWeapon.ID
        return
      }
      if (!selectedWeaponId.value || !list.some(w => w.ID === selectedWeaponId.value)) {
        selectedWeaponId.value = list[0]?.ID || ''
      }
    },
    { immediate: true }
  )

  const currentWeapon = computed(() => {
    return availableWeapons.value.find(w => w.ID === selectedWeaponId.value) || availableWeapons.value[0] || null
  })

  const npcTier = computed(() => {
    const actor = owner.value?.actor as any
    return Number(actor?.Tier || actor?.NpcClassController?.Tier || 1)
  })

  function getRangeString(w: any): string {
    const tier = npcTier.value
    let r = w?.Range
    if (typeof r === 'function') {
      try { r = r.call(w, tier, []) } catch (_) { r = [] }
    }
    if (!r || (Array.isArray(r) && r.length === 0)) {
      if (w?._range || w?.RangeData) {
        const rawRange = w.RangeData || w._range
        if (Array.isArray(rawRange)) {
          r = rawRange.map((item: any) => {
            let val = item.Value ?? item.val
            if (Array.isArray(val)) val = val[tier - 1] ?? val[0]
            return { Type: item.Type || item.type, Value: val }
          })
        }
      }
    }
    if (Array.isArray(r) && r.length) {
      return r.map((item: any) => {
        const typeLabel = item.Type ? enumLabel('rangeType', item.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${item.Value}`
      }).join(', ')
    }
    return '10'
  }

  function getDamageString(w: any): string {
    const tier = npcTier.value
    let d = w?.Damage
    if (typeof d === 'function') {
      try { d = d.call(w, tier, []) } catch (_) { d = [] }
    }
    if (!d || (Array.isArray(d) && d.length === 0)) {
      if (w?._damage_data || w?.DamageData) {
        const rawDmg = w.DamageData || w._damage_data
        if (Array.isArray(rawDmg)) {
          d = rawDmg.map((item: any) => {
            let val = item.val || item.damage || item.Value
            if (Array.isArray(val)) val = val[tier - 1] ?? val[0]
            return { Type: item.type || item.Type, Value: val }
          })
        }
      }
    }
    if (Array.isArray(d) && d.length) {
      return d.map((item: any) => {
        const typeLabel = item.Type ? enumLabel('damageType', item.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${item.Value}`
      }).join(' + ')
    }
    return '—'
  }

  function finishSkirmish(closeDialog: () => void) {
    const c = controller.value
    if (c) {
      c.MarkActionUsed('act_skirmish')
      c.DropAttackRevealedStatuses()
      c.SetCombatAction('quick', false)

      const actorName = (owner.value?.actor as any)?.Name || c.CombatName || 'NPC'
      void useTableActionStore().broadcastCombatAction({
        actorName,
        actionName: 'Alvejar',
        actionType: 'quick_action',
      })
      emit('activate', 'act_skirmish')
    }
    notify({ text: t('hud.skirmishCompleted') || 'Alvejar concluído!', type: 'success' })
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
  .weapon-selector-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
</style>
