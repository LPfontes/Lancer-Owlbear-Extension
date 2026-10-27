<template>
  <v-dialog max-width="900px">
    <template #activator="{ props }">
      <v-btn
        flat
        block
        variant="text"
        color="accent"
        :prepend-icon="icon"
        @click="props.onClick($event)"
      >
        {{ $t(labelKey) }}
      </v-btn>
    </template>
    <template #default="{ isActive }">
      <v-card>
        <v-toolbar
          height="40"
          color="primary"
          class="text-center"
        >
          <div class="heading h3 mt-1">
            <v-icon
              :icon="icon"
              class="mt-n1 ml-2"
              start
            />
            {{ $t(titleKey) }}
          </div>
          <v-spacer />
          <v-btn
            icon
            :disabled="loading"
            @click="isActive.value = false"
          >
            <v-icon icon="mdi-close" />
          </v-btn>
        </v-toolbar>
        <v-progress-linear
          v-if="loading"
          indeterminate
          color="accent"
          height="4"
        />
        <slot :is-active="isActive" />
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
  /**
   * Diálogo de fim de rodada OU de turno.
   *
   * O pilot-runner não tem encontro (não há iniciativa nem ordem de lado), então o
   * botão dele encerra o TURNO. Os rótulos vêm de fora para o mesmo diálogo servir
   * aos dois casos sem duplicar componente.
   */
  withDefaults(
    defineProps<{
      loading?: boolean
      labelKey?: string
      titleKey?: string
      icon?: string
    }>(),
    {
      labelKey: 'active.endRound.endRound',
      titleKey: 'active.endRound.confirmEndRound',
      icon: 'mdi-clock-end',
    }
  )
</script>
