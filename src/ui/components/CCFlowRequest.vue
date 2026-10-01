<template>
  <div v-if="request && request.kind !== 'stage'">
    <div class="text-cc-overline text-disabled">{{ displayLabel }}</div>

    <div
      v-if="request.kind === 'check' && request.pending?.length"
      class="body-text"
    >
      {{ $t('ui.flow.unresolved', { list: request.pending.join(', ') }) }}
    </div>

    <v-select
      v-else-if="request.kind === 'select'"
      :model-value="modelValue"
      :items="request.options ?? []"
      item-title="label"
      item-value="id"
      :placeholder="$t('active.structureCheck.chooseOne')"
      density="compact"
      variant="outlined"
      hide-details
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { IFlowRequest } from '@/classes/components/combat/flows/Flow'

  const props = defineProps<{
    request?: IFlowRequest
    modelValue?: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const { t, te } = useI18n()

  const REQUEST_TRANSLATIONS: Record<string, string> = {
    Encaixe: 'Encaixe a destruir',
    encaixe: 'Encaixe a destruir',
    Mount: 'Encaixe a destruir',
    mount: 'Encaixe a destruir',
    mountToDestroy: 'Encaixe a destruir',
    Sistema: 'Sistema a destruir',
    sistema: 'Sistema a destruir',
    System: 'Sistema a destruir',
    system: 'Sistema a destruir',
    systemToDestroy: 'Sistema a destruir',
  }

  const displayLabel = computed(() => {
    if (!props.request?.label) return ''
    const raw = props.request.label
    if (REQUEST_TRANSLATIONS[raw]) {
      return REQUEST_TRANSLATIONS[raw]
    }
    const flowKey = `ui.flow.request.${raw}`
    if (te(flowKey)) return t(flowKey)
    if (te(raw)) return t(raw)
    return raw
  })
</script>

