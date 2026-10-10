<template>
  <div>
    <div class="text-cc-overline text-disabled">{{ $t('active.statusCond.title') }}</div>
    <v-row dense>
      <v-col
        v-for="status in applicableStatuses.filter(x => x.StatusType === 'Status')"
        :key="`${isPilot}_${status.ID}`"
      >
        <status-condition-item
          :status="status"
          :active="isStatusActive(status)"
          @click="setStatus(status)"
        />
      </v-col>
    </v-row>

    <v-row dense>
      <v-col
        v-for="status in applicableStatuses.filter(x => x.StatusType === 'Condition')"
        :key="`${isPilot}_${status.ID}`"
      >
        <status-condition-item
          :status="status"
          :active="isStatusActive(status)"
          :applied-detail="appliedStatus(status)"
          @click="setStatus(status)"
        />
      </v-col>
    </v-row>

    <v-scroll-y-reverse-transition>
      <div
        v-if="special.length"
        class="my-1"
      >
        <v-card
          v-for="cs in special"
          :key="cs.ID"
          flat
          tile
          border
          style="border-color: rgb(var(--v-theme-exotic))"
        >
          <v-row
            no-gutters
            align="center"
            class="heading h3 bg-exotic px-2 py-1"
          >
            <v-col>
              <v-icon icon="mdi-star-four-points-circle-outline" />
              {{ cs.status.Attribute }}
            </v-col>
            <v-col cols="auto">
              <v-btn
                flat
                tile
                size="x-small"
                @click="controller.RemoveCustomStatus(cs.status.Attribute)"
              >
                <v-icon
                  icon="mdi-close"
                  size="22"
                />
              </v-btn>
            </v-col>
          </v-row>
          <div
            v-if="cs.status.Detail"
            class="text-cc-overline pl-4 py-1"
          >
            {{ cs.status.Detail }}
          </div>
        </v-card>
      </div>
    </v-scroll-y-reverse-transition>

    <div class="top-element">
      <v-row
        no-gutters
        justify="end"
      >
        <v-col cols="auto">
          <v-menu
            :close-on-content-click="false"
            offset-y
          >
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                size="x-small"
                color="exotic"
                class="mt-1"
                flat
                tile
                block
                prepend-icon="mdi-plus"
              >
                {{ $t('active.statusCond.addCustom') }}
              </v-btn>
            </template>

            <v-card>
              <v-card-text>
                <v-text-field
                  v-model="customStatus"
                  :label="$t('active.fields.customStatusName')"
                  variant="outlined"
                  dense
                  hide-details
                />
                <v-btn
                  flat
                  tile
                  color="primary"
                  class="mt-2"
                  @click="addCustomStatus(customStatus)"
                >
                  {{ $t('active.statusCond.addCustom') }}
                </v-btn>
              </v-card-text>
            </v-card>
          </v-menu>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { CombatController } from '@/classes/components/combat/CombatController'
  import { computed, ref, watch } from 'vue'
  import * as _ from 'lodash-es'
  import { CompendiumStore } from '@/features/compendium/store'
  import { obrBridge } from '@/services/obrBridge'
  import StatusConditionItem from './StatusConditionItem.vue'

  defineOptions({ name: 'StatusConditionSelector' })

  const props = defineProps<{
    controller: CombatController
  }>()

  const customStatus = ref('')

  const isPilot = computed(() => (props.controller as any).Parent.ItemType === 'Pilot')

  const statuses = computed(() => _.orderBy(CompendiumStore().Statuses, 'StatusType'))

  const applicableStatuses = computed(() => {
    let exclude: string[] = []
    if (isPilot.value) {
      exclude = [`dangerzone`, 'shut-down']
    } else exclude = [`dangerzone`, `downandout`]
    return statuses.value.filter((s: any) => !exclude.includes(s.ID))
  })

  const special = computed(() => (props.controller as any).CustomStatuses)

  function syncMarkers() {
    try {
      const parent = (props.controller as any).Parent
      const parentId = parent?.ID
      if (!parentId) return
      // Passa pelo MESMO agregador que o evento de status usa. Montar a lista aqui
      // à mão deixava a Cobertura de fora, e como o sync substitui o conjunto
      // inteiro de marcadores, o badge do cover era apagado ao adicionar uma
      // condição. `MarkerStatusIds` já inclui status + dangerzone + cobertura.
      const list = (props.controller as any).StatusController.MarkerStatusIds(props.controller)
      obrBridge
        .syncCombatantStatusMarkers(parentId, list, parent?.OriginId || parentId)
        .catch(() => {})
    } catch (_e) {}
  }

  function setStatus(status: any) {
    ;(props.controller as any).ToggleStatus(status, undefined, true)
    syncMarkers()
  }

  watch(
    () => (props.controller as any).Statuses?.map((s: any) => s.status?.ID || s.status),
    () => syncMarkers(),
    { deep: true }
  )

  function addCustomStatus(name: string) {
    if (!name || !name.trim().length) return
    ;(props.controller as any).SetCustomStatus({ Attribute: name.trim() })
    customStatus.value = ''
  }

  function getStatusKey(s: any): string {
    if (!s) return ''
    if (typeof s === 'string') return s.toLowerCase()
    if (s.status) {
      if (typeof s.status === 'string') return s.status.toLowerCase()
      return String(s.status.ID || s.status.id || '').toLowerCase()
    }
    return String(s.ID || s.id || '').toLowerCase()
  }

  function isStatusActive(status: any): boolean {
    const targetKey = getStatusKey(status)
    if (!targetKey) return false
    const list = (props.controller as any)?.Statuses || []
    return list.some((s: any) => getStatusKey(s) === targetKey)
  }

  function appliedStatus(status: any) {
    const targetKey = getStatusKey(status)
    if (!targetKey) return null
    const list = (props.controller as any)?.Statuses || []
    const applied = list.find((s: any) => getStatusKey(s) === targetKey)
    if (!applied || !applied.expires) return null
    return applied.expires?.Text || ''
  }
</script>

<style scoped>
  ::v-deep(.short .v-field__input) {
    min-height: 28px !important;
    padding: 4px !important;
    padding-left: 8px !important;
  }

  ::v-deep(.short .v-field) {
    height: 28px !important;
  }
</style>
