<template>
  <cc-panel
    :title-color="color"
    :title="trait.Name"
  >
    <template #toolbar-items>
      <v-btn
        icon="mdi-message-text"
        variant="text"
        size="small"
        color="white"
        title="Enviar para o chat"
        class="mr-2"
        style="opacity: 0.7;"
        @click.stop="broadcastTrait"
      />
      <v-chip
        v-if="trait.Use && trait.Use !== 'Mission'"
        size="small"
        flat
        tile
        prepend-icon="mdi-timer-sync-outline"
      >
        {{ trait.Use }}
      </v-chip>
    </template>
    <p v-html-safe="trait.Description" />
    <div v-if="!combat">
      <cc-action
        v-for="(a, index) in trait.Actions"
        :key="`action-${index}`"
        :action="a"
        :panel="!mobile"
        class="my-2"
      />
      <cc-deployable-info
        v-for="(d, index) in trait.Deployables"
        :key="`deployable-${index}`"
        :deployable="d"
        :panel="!mobile"
        :owner="mech"
        class="my-2"
      />
      <cc-integrated-info
        v-for="(x, index) in trait.IntegratedEquipment"
        :key="`integrated-${index}`"
        :item="x"
        :panel="!mobile"
        class="my-2"
      />
    </div>
    <slot name="combat" />
  </cc-panel>
</template>

<script setup lang="ts">
  import { useDisplay } from 'vuetify'
  import type { FrameTrait } from '@/classes/mech/components/frame/FrameTrait'
  import type { Mech } from '@/classes/mech/Mech'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const { smAndDown: mobile } = useDisplay()
  const tableActionStore = useTableActionStore()

  const props = withDefaults(
    defineProps<{
      trait: FrameTrait
      color?: string
      combat?: boolean
      mech?: Mech | null
    }>(),
    {
      color: 'primary',
      mech: null,
    }
  )

  function broadcastTrait() {
    const actorName = props.mech?.Name || props.mech?.Pilot?.Name || 'Piloto'
    tableActionStore.broadcastCombatAction({
      actorName,
      actionName: `Característica: ${props.trait.Name}`,
      actionType: 'chat',
      detail: props.trait.Description
    })
  }
</script>
