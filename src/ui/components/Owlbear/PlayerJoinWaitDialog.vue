<template>
  <v-dialog v-model="isVisible" max-width="450" persistent>
    <v-card class="bg-grey-darken-4 border border-grey-darken-2">
      <v-card-title class="bg-grey-darken-3 text-body-1 font-weight-bold d-flex align-center ga-2 pa-3">
        <v-icon icon="mdi-progress-clock" size="small" color="accent" />
        {{ $t('active.handshake.playerWaitingTitle') }}
      </v-card-title>
      
      <v-card-text class="pa-4 text-body-2">
        <div class="mb-4 text-center">
          <v-progress-circular indeterminate color="accent" size="48" class="mb-3" />
          <p>{{ $t('active.handshake.playerWaitingText') }}</p>
        </div>
        
        <v-sheet color="grey-darken-3" rounded class="pa-3 text-center border border-grey-darken-2">
          <div class="font-weight-bold text-accent">{{ callsign || name }}</div>
          <div class="text-caption text-grey-lighten-1">{{ mechName }}</div>
        </v-sheet>
      </v-card-text>
      
      <v-card-actions class="pa-3 bg-grey-darken-3">
        <v-spacer />
        <v-btn color="error" variant="text" size="small" @click="cancel">
          {{ $t('active.handshake.cancelRequest') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue'

  const isVisible = ref(false)
  const callsign = ref('')
  const name = ref('')
  const mechName = ref('')
  const cancelCallback = ref<(() => void) | null>(null)

  const handleOpen = (e: Event) => {
    const detail = (e as CustomEvent).detail
    callsign.value = detail.callsign
    name.value = detail.name
    mechName.value = detail.mechName
    cancelCallback.value = detail.cancelCallback
    isVisible.value = true
  }

  const handleClose = () => {
    isVisible.value = false
  }

  const cancel = () => {
    if (cancelCallback.value) {
      cancelCallback.value()
    }
    isVisible.value = false
  }

  onMounted(() => {
    window.addEventListener('compcon-player-join-wait', handleOpen)
    window.addEventListener('compcon-player-join-wait-close', handleClose)
  })

  onUnmounted(() => {
    window.removeEventListener('compcon-player-join-wait', handleOpen)
    window.removeEventListener('compcon-player-join-wait-close', handleClose)
  })
</script>
