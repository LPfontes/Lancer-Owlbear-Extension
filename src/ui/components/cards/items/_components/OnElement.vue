<template>
  <cc-panel
    v-if="onElement"
    density="compact"
    icon="cc:weapon"
    class="my-1"
    :title="title"
  >
    <template
      v-if="broadcast"
      #toolbar-items
    >
      <v-btn
        icon="mdi-message-text"
        variant="text"
        size="small"
        color="white"
        title="Enviar para o chat"
        class="mr-2"
        style="height: inherit; opacity: 0.7;"
        @click.stop="broadcastOnElement"
      />
    </template>
    <div v-html-safe="detail" />
  </cc-panel>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useTableActionStore } from '@/stores/tableActionStore'

  const props = withDefaults(
    defineProps<{
      profile: object
      action: string
      broadcast?: boolean
      mech?: any
    }>(),
    {
      broadcast: false,
      mech: undefined,
    }
  )

  const { t } = useI18n()

  const capitalizeAction = computed(
    () => props.action.charAt(0).toUpperCase() + props.action.slice(1)
  )

  const onElement = computed(
    (): any => (props.profile as any)?.[`On${capitalizeAction.value}`]
  )

  const detail = computed((): string => onElement.value?.Detail || '')

  const title = computed(
    (): string =>
      t(`pm.print.on${props.action === 'crit' ? 'CRIT' : props.action.toUpperCase()}`)
  )

  /** Envia o gatilho ("Ao Atacar", "Ao Acertar", …) para o chat da mesa. */
  function broadcastOnElement() {
    const actorName = props.mech?.Name || props.mech?.Pilot?.Name || 'Piloto'
    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: title.value,
      actionType: 'chat',
      detail: detail.value,
    })
  }
</script>
