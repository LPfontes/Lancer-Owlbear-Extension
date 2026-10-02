<template>
  <div class="npc-horizontal-bar bg-surface border-b d-flex align-center px-2 py-1">
    <!-- Botão de Info do Encontro / Sitrep -->
    <v-tooltip
      :text="$t('common.encounter')"
      location="bottom"
    >
      <template #activator="{ props: tooltipProps }">
        <button
          v-bind="tooltipProps"
          type="button"
          class="npc-chip sitrep-chip d-flex flex-column align-center justify-center mr-2 px-2"
          :class="{ active: isEncounterInfoActive }"
          @click="$emit('select-panel', 'encounter-info')"
        >
          <v-icon
            icon="cc:encounter"
            size="20"
            :color="isEncounterInfoActive ? 'accent' : 'primary'"
          />
          <span class="text-caption text-no-wrap" style="font-size: 0.65rem !important;">
            SITREP
          </span>
        </button>
      </template>
    </v-tooltip>

    <div class="divider-vertical mx-1" />

    <!-- Carrossel horizontal de combatentes -->
    <div
      ref="scrollContainer"
      class="npc-scroll-container d-flex align-center flex-grow-1"
      @wheel.passive="handleWheel"
    >
      <div
        v-for="c in sortedCombatants"
        :key="c.id"
        class="npc-chip d-flex align-center mr-2 px-2 py-1"
        :class="{
          active: selectedCombatant?.id === c.id,
          destroyed: isDestroyed(c),
          unactivated: hasActivations(c),
          [`side-${c.side}`]: true,
        }"
        @click="$emit('select-combatant', c)"
      >
        <!-- Miniatura / Avatar -->
        <div class="avatar-wrapper mr-2">
          <v-img
            v-if="hasPortrait(c)"
            :src="getPortrait(c)"
            width="32"
            height="32"
            cover
            class="rounded-sm"
          />
          <div
            v-else
            class="fallback-icon d-flex align-center justify-center rounded-sm bg-panel"
            style="width: 32px; height: 32px;"
          >
            <v-icon
              :icon="c.actor.Icon || 'cc:npc'"
              size="20"
              :color="selectedCombatant?.id === c.id ? 'accent' : 'grey-lighten-1'"
            />
          </div>
          <!-- Badge de reforço se não ativado -->
          <div
            v-if="c.reinforcement"
            class="reinforcement-badge"
            title="Reforço"
          >
            R
          </div>
        </div>

        <!-- Info do NPC -->
        <div class="npc-details d-flex flex-column">
          <div class="d-flex align-center">
            <span class="npc-name text-no-wrap text-truncate font-weight-bold">
              {{ c.actor.Name }}
            </span>
            <span
              v-if="c.number"
              class="npc-number text-accent ml-1"
            >
              #{{ c.number }}
            </span>
          </div>

          <!-- Barra de HP compacta e ativações -->
          <div class="d-flex align-center mt-1">
            <div
              v-if="getHp(c)"
              class="hp-meter mr-2"
              :title="`HP: ${getHp(c)?.current}/${getHp(c)?.max}`"
            >
              <div
                class="hp-fill"
                :style="{
                  width: `${getHpPercent(c)}%`,
                  backgroundColor: getHpColor(c),
                }"
              />
            </div>
            <span
              v-if="getHp(c)"
              class="hp-text text-caption"
              style="font-size: 0.65rem !important;"
            >
              {{ getHp(c)?.current }}/{{ getHp(c)?.max }}
            </span>

            <!-- Ativações restantes -->
            <div
              v-if="getActivations(c)"
              class="activations-indicator ml-2 d-flex align-center"
              :title="`Ativações: ${getActivations(c)?.current}/${getActivations(c)?.max}`"
            >
              <v-icon
                icon="cc:activate"
                size="12"
                :color="getActivations(c)?.current ? 'accent' : 'disabled'"
              />
              <span
                class="ml-0.5 text-caption"
                style="font-size: 0.65rem !important;"
                :class="getActivations(c)?.current ? 'text-accent' : 'text-disabled'"
              >
                {{ getActivations(c)?.current }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import type { EncounterInstance } from '@/classes/encounter/EncounterInstance'

  const props = defineProps<{
    encounterInstance: EncounterInstance
    selectedCombatant: CombatantData | null
    isEncounterInfoActive: boolean
  }>()

  defineEmits<{
    'select-combatant': [combatant: CombatantData]
    'select-panel': [panel: string]
    'toggle-initiative': []
  }>()

  const scrollContainer = ref<HTMLElement | null>(null)

  function handleWheel(e: WheelEvent) {
    if (scrollContainer.value) {
      scrollContainer.value.scrollLeft += e.deltaY
    }
  }

  const sortedCombatants = computed(() => {
    if (!props.encounterInstance?.Combatants) return []
    // Exibir ativos primeiro, ordenados por índice
    return [...props.encounterInstance.Combatants].sort((a, b) => {
      if (a.reinforcement !== b.reinforcement) {
        return a.reinforcement ? 1 : -1
      }
      return a.index - b.index
    })
  })

  function hasPortrait(c: CombatantData): boolean {
    return !!(c.actor?.PortraitController?.HasImage && c.actor?.Portrait)
  }

  function getPortrait(c: CombatantData): string {
    return c.actor?.Portrait || ''
  }

  function isDestroyed(c: CombatantData): boolean {
    return !!c.actor?.CombatController?.IsDestroyed
  }

  function hasActivations(c: CombatantData): boolean {
    const act = getActivations(c)
    return !!(act && act.current > 0)
  }

  function getHp(c: CombatantData): { current: number; max: number } | null {
    const stats = c.actor?.CombatController?.StatController?.CurrentStats
    const maxStats = c.actor?.CombatController?.StatController?.MaxStats
    if (!stats || !maxStats || maxStats.hp === undefined) return null
    return {
      current: Math.max(0, stats.hp ?? 0),
      max: maxStats.hp || 1,
    }
  }

  function getHpPercent(c: CombatantData): number {
    const hp = getHp(c)
    if (!hp || hp.max <= 0) return 0
    return Math.min(100, Math.max(0, (hp.current / hp.max) * 100))
  }

  function getHpColor(c: CombatantData): string {
    const pct = getHpPercent(c)
    if (pct > 50) return 'rgb(var(--v-theme-success))'
    if (pct > 25) return 'rgb(var(--v-theme-warning))'
    return 'rgb(var(--v-theme-error))'
  }

  function getActivations(c: CombatantData): { current: number; max: number } | null {
    const stats = c.actor?.CombatController?.StatController?.CurrentStats
    const maxStats = c.actor?.CombatController?.StatController?.MaxStats
    if (!stats || !maxStats || maxStats.activations === undefined) return null
    return {
      current: stats.activations ?? 0,
      max: maxStats.activations ?? 1,
    }
  }
</script>

<style scoped>
  .npc-horizontal-bar {
    width: 100%;
    min-height: 52px;
    height: 52px;
    background-color: rgb(var(--v-theme-surface));
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .divider-vertical {
    width: 1px;
    height: 32px;
    background-color: rgba(255, 255, 255, 0.15);
  }

  .npc-scroll-container {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
    scrollbar-width: thin;
  }

  .npc-scroll-container::-webkit-scrollbar {
    height: 3px;
  }

  .npc-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .npc-chip {
    cursor: pointer;
    user-select: none;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    transition: all 0.15s ease-in-out;
    flex-shrink: 0;
    max-width: 180px;
    height: 42px;
  }

  .npc-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .npc-chip.active {
    border-color: rgb(var(--v-theme-accent)) !important;
    background: rgba(var(--v-theme-accent), 0.15) !important;
    box-shadow: 0 0 8px rgba(var(--v-theme-accent), 0.3);
  }

  .npc-chip.destroyed {
    opacity: 0.45;
    filter: grayscale(80%);
  }

  .sitrep-chip {
    height: 42px;
    min-width: 44px;
  }

  .sitrep-chip.active {
    border-color: rgb(var(--v-theme-accent)) !important;
    background: rgba(var(--v-theme-accent), 0.15) !important;
  }


  .avatar-wrapper {
    position: relative;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  .reinforcement-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    background: rgb(var(--v-theme-warning));
    color: black;
    font-size: 8px;
    font-weight: bold;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .npc-details {
    overflow: hidden;
  }

  .npc-name {
    font-size: 0.75rem;
    max-width: 100px;
  }

  .npc-number {
    font-size: 0.75rem;
  }

  .hp-meter {
    width: 44px;
    height: 4px;
    background-color: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
  }

  .hp-fill {
    height: 100%;
    transition: width 0.2s ease;
  }

  .side-enemy {
    border-left: 3px solid rgb(var(--v-theme-error));
  }

  .side-ally {
    border-left: 3px solid rgb(var(--v-theme-success));
  }

  .side-neutral {
    border-left: 3px solid rgb(var(--v-theme-warning));
  }
</style>
