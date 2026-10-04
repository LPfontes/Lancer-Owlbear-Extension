<template>
  <!--
    Tracker de iniciativa sincronizado (visão do jogador).
    Somente leitura: o Mestre é quem publica rodada, turno e ativações.
    Nenhum dado de ficha chega aqui — só os cards da iniciativa.
  -->
  <div class="synced-tracker fill-height d-flex flex-column text-white">
    <!-- Cabeçalho do combate transmitido -->
    <div class="tracker-header px-3 py-2 bg-grey-darken-4 border-b border-grey-darken-3 flex-shrink-0">
      <div class="d-flex align-center justify-space-between ga-2">
        <div class="d-flex align-center ga-2 text-truncate">
          <v-chip
            size="small"
            color="accent"
            variant="flat"
            class="font-weight-bold text-black px-2 rounded-0 flex-shrink-0"
            style="height: 22px;"
          >
            {{ t('trackerSync.round') }} {{ trackerStore.round }}
          </v-chip>
          <div class="text-subtitle-2 font-weight-bold text-truncate text-white" :title="trackerStore.encounterName">
            {{ trackerStore.encounterName }}
          </div>
        </div>

        <div class="d-flex align-center text-caption text-grey-lighten-1 flex-shrink-0" style="font-size: 0.72rem !important;">
          <span class="mr-1">{{ t('trackerSync.activations') }}:</span>
          <b class="text-accent">{{ trackerStore.spentCount }}/{{ trackerStore.totalCount }}</b>
        </div>
      </div>

      <div class="d-flex align-center ga-1 text-caption text-grey-lighten-1 pt-1" style="font-size: 0.68rem !important;">
        <v-icon icon="mdi-access-point" size="13" color="success" />
        <span>{{ t('trackerSync.syncedByGM') }}</span>
      </div>
    </div>

    <!-- Filtro sem combatentes -->
    <div
      v-if="trackerStore.cards.length > 0 && !filteredCards.length"
      class="empty-state text-center py-10 px-4 my-auto"
    >
      <v-icon icon="mdi-filter-off-outline" size="44" color="grey-darken-1" class="mb-2" />
      <div class="text-subtitle-2 text-grey-lighten-1">
        {{ t('trackerSync.noCardsForFilter') }}
      </div>
    </div>

    <!-- Nenhum combatente na iniciativa ainda -->
    <div v-else-if="trackerStore.isActive" class="empty-state text-center py-10 px-4 my-auto">
      <v-icon icon="mdi-account-multiple-plus" size="52" color="accent" class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold text-white mb-1">
        {{ t('trackerSync.emptyEncounterTitle') }}
      </div>
      <div class="text-caption text-grey-lighten-2" style="max-width: 280px; margin: 0 auto;">
        {{ t('trackerSync.emptyEncounterHint') }}
      </div>
    </div>

    <!-- Aguardando o Mestre iniciar/transmitir o combate -->
    <div v-else class="empty-state text-center py-10 px-4 my-auto">
      <v-icon icon="cc:encounter" size="52" color="accent" class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold text-white mb-1">
        {{ t('trackerSync.waitingTitle') }}
      </div>
      <div class="text-caption text-grey-lighten-2" style="max-width: 320px; margin: 0 auto;">
        {{ t('trackerSync.waitingHint') }}
      </div>
    </div>

    <!-- Lista de cards da iniciativa -->
    <div
      v-if="filteredCards.length"
      class="combatants-list-container flex-grow-1 px-3 py-2 overflow-y-auto"
    >
      <div
        v-for="card in filteredCards"
        :key="card.id"
        class="combatant-card mb-2 pa-2 rounded-0 position-relative"
        :class="{
          'in-turn': trackerStore.inTurnId === card.id,
          'all-spent': card.activations.current <= 0,
          [`side-${card.side}`]: true,
        }"
      >
        <div class="d-flex align-start justify-space-between ga-2">
          <div class="d-flex align-center ga-2 text-truncate flex-grow-1">
            <div
              class="d-flex align-center justify-center bg-grey-darken-3 border border-grey-darken-2 flex-shrink-0"
              style="width: 36px; height: 36px;"
            >
              <v-icon
                :icon="card.kind === 'pilot' ? 'cc:pilot' : 'cc:npc'"
                size="22"
                :color="trackerStore.inTurnId === card.id ? 'accent' : 'grey-lighten-1'"
              />
            </div>

            <div class="text-truncate">
              <div class="d-flex align-center ga-1 text-truncate">
                <span
                  class="font-weight-bold text-subtitle-2 text-truncate"
                  :class="{ 'text-accent': trackerStore.inTurnId === card.id }"
                >
                  {{ card.name }}
                </span>
                <span v-if="card.number > 1" class="text-accent text-caption font-weight-bold">
                  #{{ card.number }}
                </span>
              </div>
              <div class="text-caption text-grey-lighten-1 text-truncate" style="font-size: 0.7rem !important; line-height: 1.1;">
                {{ getSideLabel(card.side) }}
              </div>
            </div>
          </div>

          <div class="d-flex flex-column align-end flex-shrink-0 ga-1">
            <v-chip
              v-if="trackerStore.inTurnId === card.id"
              color="accent"
              variant="flat"
              size="x-small"
              class="font-weight-bold text-black pulse-badge px-2"
              style="height: 20px; font-size: 10px;"
            >
              {{ t('trackerSync.inTurn') }}
            </v-chip>
            <v-chip
              v-else-if="card.activations.current <= 0"
              color="grey-darken-2"
              variant="flat"
              size="x-small"
              class="text-grey-lighten-1 px-1.5"
              style="height: 18px; font-size: 9.5px;"
            >
              {{ t('trackerSync.done') }}
            </v-chip>

            <div class="d-flex align-center ga-1 mt-0.5" :title="t('trackerSync.activationsLeft')">
              <v-icon
                icon="cc:activate"
                size="13"
                :color="card.activations.current > 0 ? 'accent' : 'grey-darken-1'"
              />
              <div class="d-flex align-center ga-0.5">
                <div
                  v-for="idx in card.activations.max"
                  :key="idx"
                  class="activation-pip"
                  :class="{ 'filled': idx <= card.activations.current }"
                />
              </div>
              <span
                class="text-caption font-weight-bold ml-0.5"
                style="font-size: 0.68rem !important;"
                :class="card.activations.current > 0 ? 'text-accent' : 'text-grey'"
              >
                {{ card.activations.current }}/{{ card.activations.max }}
              </span>
            </div>
          </div>
        </div>

        <!-- Barra de progresso discreta: leitura apenas, sem controles de turno -->
        <div class="d-flex align-center ga-2 mt-2 pt-1 border-t border-grey-darken-3">
          <v-progress-linear
            :model-value="activationProgress(card)"
            :color="card.activations.current > 0 ? 'accent' : 'grey-darken-2'"
            height="3"
            class="rounded-0 flex-grow-1"
          />
          <span class="text-caption text-grey-lighten-1" style="font-size: 0.65rem !important;">
            {{ t('trackerSync.readOnly') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTrackerSyncStore } from '@/stores/trackerSyncStore'
import type { SyncedTrackerCard } from '@/types/tracker-sync'

const props = withDefaults(
  defineProps<{
    activeFilter?: 'all' | 'enemy' | 'ally' | 'neutral' | 'pending'
  }>(),
  {
    activeFilter: 'all',
  }
)

const { t } = useI18n()
const trackerStore = useTrackerSyncStore()

const filteredCards = computed<SyncedTrackerCard[]>(() => {
  const list = trackerStore.cards

  if (props.activeFilter === 'pending') {
    return list.filter(card => card.activations.current > 0)
  }
  if (props.activeFilter && props.activeFilter !== 'all') {
    return list.filter(card => card.side === props.activeFilter)
  }
  return list
})

function activationProgress(card: SyncedTrackerCard): number {
  if (card.activations.max <= 0) return 0
  return Math.round((card.activations.current / card.activations.max) * 100)
}

function getSideLabel(side: string): string {
  if (side === 'enemy') return t('trackerSync.sideEnemy')
  if (side === 'ally') return t('trackerSync.sideAlly')
  return t('trackerSync.sideNeutral')
}
</script>

<style scoped>
.tracker-header {
  background: rgba(18, 24, 32, 0.96);
}

.combatants-list-container::-webkit-scrollbar {
  width: 4px;
}

.combatants-list-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-accent), 0.3);
  border-radius: 2px;
}

.combatant-card {
  background: rgba(22, 28, 38, 0.85);
  border-left: 3px solid rgba(255, 255, 255, 0.12);
  transition: background 0.15s ease;
}

.combatant-card.side-enemy {
  border-left-color: rgb(var(--v-theme-error));
}

.combatant-card.side-ally {
  border-left-color: rgb(var(--v-theme-accent));
}

.combatant-card.side-neutral {
  border-left-color: rgba(255, 255, 255, 0.25);
}

.combatant-card.in-turn {
  background: rgba(0, 229, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-accent), 0.45);
}

.combatant-card.all-spent:not(.in-turn) {
  opacity: 0.62;
}

.activation-pip {
  width: 8px;
  height: 8px;
  border: 1px solid rgba(var(--v-theme-accent), 0.55);
  background: transparent;
}

.activation-pip.filled {
  background: rgb(var(--v-theme-accent));
}

.pulse-badge {
  animation: synced-tracker-pulse 1.6s ease-in-out infinite;
}

@keyframes synced-tracker-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
