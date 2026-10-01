<template>
  <cc-panel
    icon="cc:talent"
    :title="talent.Name"
    title-color="primary"
  >
    <template #title-prepend>
    </template>
    <template #toolbar-items>
      <v-btn
        icon="mdi-message-text"
        variant="text"
        size="small"
        color="white"
        title="Enviar para o chat"
        class="mr-2"
        style="opacity: 0.7;"
        @click.stop="broadcastTalent"
      />
    </template>
    <v-row
      v-for="n in rank"
      :key="`rank-${n}`"
      dense
    >
      <v-col
        cols="auto"
        style="position: relative"
      >
        <v-icon>cc:rank_{{ n }}</v-icon>
      </v-col>
      <v-col>
        <talent-rank-contents
          :talent-rank="talent.Rank(Number(n))"
          hide-actions
        />
      </v-col>
    </v-row>
    <slot name="combat" />
  </cc-panel>
</template>

<script setup lang="ts">
  import type { Talent } from '@/classes/pilot/components/talent/Talent'
  import { computed, ref } from 'vue'
  import TalentEmblem from './_TalentEmblem.vue'
  import TalentRankContents from './_TalentRankContents.vue'
  import { useDisplay } from 'vuetify'
  import { useTableActionStore } from '@/stores/tableActionStore'

  defineOptions({ name: 'talent-full' })

  const { smAndDown: mobile, xs: portrait } = useDisplay()
  const tableActionStore = useTableActionStore()

  const props = withDefaults(
    defineProps<{
      hideLocked?: boolean
      talent: Talent
      selectable?: boolean
      canAdd?: boolean
      hideChange?: boolean
      hideTitle?: boolean
      inColumn?: boolean
      rank?: number | string
    }>(),
    {
      rank: undefined,
    }
  )

  const emit = defineEmits<{
    expand: []
    add: []
    remove: []
  }>()

  const showAll = ref(false)

  const showFull = computed(() => {
    if (props.hideLocked) return showAll.value
    return true
  })

  function broadcastTalent() {
    const ranksDescription = props.talent.Ranks
      .filter((_, index) => !props.rank || index < Number(props.rank))
      .map((r, index) => `<strong>Grau ${index + 1} - ${r.Name}:</strong><br/>${r.Description}`)
      .join('<br/><br/>')

    const detail = props.talent.Terse ? `${props.talent.Terse}<br/><br/>${ranksDescription}` : ranksDescription

    tableActionStore.broadcastCombatAction({
      actorName: 'Piloto',
      actionName: `Talento: ${props.talent.Name}`,
      actionType: 'chat',
      detail
    })
  }
</script>
