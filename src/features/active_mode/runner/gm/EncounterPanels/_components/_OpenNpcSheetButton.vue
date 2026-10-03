<template>
  <v-tooltip
    location="top"
    :disabled="!target"
  >
    <template #activator="{ props }">
      <span
        v-bind="props"
        class="d-inline-flex"
      >
        <v-btn
          icon="mdi-book-open-variant"
          size="small"
          variant="tonal"
          color="accent"
          :disabled="!target"
          :aria-label="$t('active.panelBase.openSheet')"
          @click="open"
        />
      </span>
    </template>
    <span>{{ $t('active.panelBase.openSheet') }}</span>
  </v-tooltip>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import type { CombatantData } from '@/classes/encounter/Encounter'

  const props = defineProps<{
    combatant: CombatantData
  }>()

  const router = useRouter()

  const target = computed(() => {
    const actor = (props.combatant?.actor as any) ?? null
    // Instâncias apontam para o item do roster via OriginId; itens diretos usam ID.
    // Mesmo sem item no roster (encontro carregado por sharecode/json), o
    // npc-runner resolve o NPC direto do encontro compartilhado.
    const id = actor?.OriginId || actor?.ID
    if (!id) return null
    return { id }
  })

  function open() {
    if (!target.value) return
    router.push(`/active-mode/npc-runner/${target.value.id}`)
  }
</script>
