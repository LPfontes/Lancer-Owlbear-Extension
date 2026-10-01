<template>
  <div
    class="action-card rounded mb-2 px-3 py-2"
    :class="`action-border-${action.category}`"
  >
    <!-- Header: Ator, Categoria e Hora -->
    <div class="d-flex align-center justify-space-between ga-2 mb-1">
      <div class="d-flex align-center ga-1 text-truncate">
        <v-avatar
          size="20"
          :color="categoryColor"
          class="rounded-0 mr-1"
        >
          <v-icon
            :icon="categoryIcon"
            size="12"
            color="black"
          />
        </v-avatar>
        <span class="text-caption font-weight-bold actor-name text-truncate">
          {{ action.senderName || 'Jogador' }}
        </span>
      </div>

      <div class="d-flex align-center ga-1 flex-shrink-0">
        <v-chip
          size="x-small"
          :color="categoryColor"
          variant="text"
          class="font-weight-bold text-uppercase px-1"
          style="font-size: 10px; height: 18px;"
        >
          {{ categoryLabel }}
        </v-chip>
        <span class="text-caption text-disabled action-time" style="font-size: 10px;">
          {{ formattedTime }}
        </span>
      </div>
    </div>

    <!-- Conteúdo da Ação -->
    <div class="action-body">
      <!-- Indicativo de Ação Tática ou Título -->
      <div
        class="text-body-2 font-weight-bold mb-1"
        :class="{ 'text-chat': action.category === 'chat', 'text-action-title': action.category !== 'chat' }"
      >
        {{ action.title }}
      </div>

      <!-- Alvo (se houver) -->
      <div
        v-if="action.targetName"
        class="text-caption text-disabled mb-1 d-flex align-center ga-1"
      >
        <v-icon icon="mdi-crosshairs-gps" size="12" color="accent" />
        <span>Alvo: <strong>{{ action.targetName }}</strong></span>
      </div>

      <!-- Detalhe adicional ou descrição -->
      <div
        v-if="action.detail"
        v-html-safe="action.detail"
        class="text-caption text-grey-lighten-1 action-detail mb-1"
      />

      <!-- Caixa de Rolagem de Dados (se houver) -->
      <div
        v-if="action.roll"
        class="roll-box d-flex align-center justify-space-between px-2 py-1 rounded mt-1"
      >
        <div class="d-flex align-center ga-1">
          <v-icon icon="mdi-dice-multiple" size="14" color="accent" />
          <span class="text-caption text-disabled">
            {{ action.roll.formula || 'Resultado:' }}
          </span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-chip
            size="x-small"
            :color="action.roll.isCrit ? 'warning' : 'accent'"
            variant="flat"
            class="font-weight-bold text-black px-2"
          >
            {{ action.roll.total }}
          </v-chip>
          <span
            v-if="action.roll.isCrit"
            class="text-caption text-warning font-weight-bold ml-1"
            style="font-size: 10px;"
          >
            CRÍTICO!
          </span>
        </div>
      </div>

      <!-- Tags (se houver) -->
      <div
        v-if="action.tags && action.tags.length"
        class="d-flex flex-wrap ga-1 mt-1"
      >
        <v-chip
          v-for="tag in action.tags"
          :key="tag"
          size="x-small"
          variant="outlined"
          color="grey"
          style="font-size: 9px; height: 16px;"
        >
          {{ tag }}
        </v-chip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { TableActionItem, ActionCategory } from '@/types/table-actions'

  const props = defineProps<{
    action: TableActionItem
  }>()

  const formattedTime = computed(() => {
    if (!props.action.timestamp) return ''
    const d = new Date(props.action.timestamp)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })

  const categoryColor = computed(() => {
    switch (props.action.category) {
      case 'full_action':
        return 'purple-accent-3'
      case 'quick_action':
        return 'cyan-accent-3'
      case 'protocol':
        return 'amber-accent-3'
      case 'reaction':
        return 'orange-accent-3'
      case 'free_action':
        return 'green-accent-3'
      case 'roll':
        return 'teal-accent-3'
      case 'damage':
        return 'red-accent-3'
      case 'status':
        return 'deep-purple-accent-2'
      case 'chat':
      default:
        return 'blue-grey-lighten-2'
    }
  })

  const categoryIcon = computed(() => {
    switch (props.action.category) {
      case 'full_action':
        return 'mdi-hexagon-slice-6'
      case 'quick_action':
        return 'mdi-hexagon-slice-3'
      case 'protocol':
        return 'mdi-shield-alert-outline'
      case 'reaction':
        return 'mdi-flash-alert-outline'
      case 'free_action':
        return 'mdi-lightning-bolt-outline'
      case 'roll':
        return 'mdi-dice-multiple-outline'
      case 'damage':
        return 'mdi-sword-cross'
      case 'status':
        return 'mdi-alert-decagram-outline'
      case 'chat':
      default:
        return 'mdi-message-text-outline'
    }
  })

  const categoryLabel = computed(() => {
    switch (props.action.category) {
      case 'full_action':
        return 'Completa'
      case 'quick_action':
        return 'Rápida'
      case 'protocol':
        return 'Protocolo'
      case 'reaction':
        return 'Reação'
      case 'free_action':
        return 'Livre'
      case 'roll':
        return 'Rolagem'
      case 'damage':
        return 'Dano'
      case 'status':
        return 'Status'
      case 'chat':
      default:
        return 'Chat'
    }
  })
</script>

<style scoped>
  .action-card {
    background: rgba(18, 22, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .action-card:hover {
    background: rgba(24, 30, 40, 0.95);
  }

  .actor-name {
    color: #00e5ff;
    letter-spacing: 0.5px;
  }

  .action-border-full_action {
    border-left: 3px solid #d500f9;
  }
  .action-border-quick_action {
    border-left: 3px solid #00e5ff;
  }
  .action-border-protocol {
    border-left: 3px solid #ffd600;
  }
  .action-border-reaction {
    border-left: 3px solid #ff9100;
  }
  .action-border-free_action {
    border-left: 3px solid #00e676;
  }
  .action-border-roll {
    border-left: 3px solid #1de9b6;
  }
  .action-border-damage {
    border-left: 3px solid #ff1744;
  }
  .action-border-status {
    border-left: 3px solid #7c4dff;
  }
  .action-border-chat {
    border-left: 3px solid #78909c;
  }

  .text-chat {
    color: #eceff1;
    font-weight: 400 !important;
    word-break: break-word;
  }

  .text-action-title {
    color: #ffffff;
    font-size: 13px;
    letter-spacing: 0.3px;
  }

  .action-detail {
    font-family: 'Consolas', monospace;
    font-size: 11px;
    background: rgba(0, 0, 0, 0.2);
    padding: 3px 6px;
    border-radius: 2px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .action-detail :deep(sub) {
    font-size: 9px;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
    bottom: -0.2em;
    opacity: 0.85;
  }

  .action-detail :deep(b) {
    font-weight: 700;
  }

  .action-detail :deep(.text-accent) {
    color: rgb(var(--v-theme-accent, 255, 102, 0)) !important;
  }

  .action-detail :deep(.text-disabled) {
    opacity: 0.5;
  }

  .roll-box {
    background: rgba(0, 0, 0, 0.35);
    border: 1px dashed rgba(255, 255, 255, 0.15);
  }

  .action-card :deep(.v-chip__underlay),
  :deep(.v-chip__underlay) {
    background: none !important;
    background-color: transparent !important;
    opacity: 0 !important;
    display: none !important;
  }
</style>
