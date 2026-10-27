<template>
  <v-dialog v-model="isVisible" max-width="500" persistent>
    <v-card class="bg-grey-darken-4 border border-grey-darken-2">
      <v-card-title class="bg-grey-darken-3 text-body-1 font-weight-bold d-flex align-center justify-space-between pa-3">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-shield-account" size="small" color="accent" />
          {{ $t('active.handshake.gmAuthTitle') }}
        </div>
        <v-badge v-if="requests.length > 1" :content="requests.length" color="accent" inline />
      </v-card-title>
      
      <v-card-text v-if="currentRequest" class="pa-4 text-body-2">
        <p class="mb-4">
          <span class="font-weight-bold text-accent">{{ currentRequest.playerName }}</span> 
          {{ $t('active.handshake.wantsToJoin') }}
        </p>
        
        <v-sheet color="grey-darken-3" rounded class="pa-3 border border-grey-darken-2 mb-2">
          <div class="d-flex align-center ga-3">
            <v-avatar size="48" rounded="0" class="border border-grey-darken-2 bg-black flex-shrink-0">
              <v-icon icon="cc:pilot" size="24" color="accent" />
            </v-avatar>
            <div>
              <div class="font-weight-bold text-body-1 text-white">
                {{ currentRequest.callsign || currentRequest.name }}
              </div>
              <div class="text-caption text-grey-lighten-1">
                {{ currentRequest.mechName }}
              </div>
            </div>
          </div>
        </v-sheet>
      </v-card-text>
      
      <v-card-actions class="pa-3 bg-grey-darken-3">
        <v-spacer />
        <v-btn color="error" variant="text" @click="deny">
          {{ $t('active.handshake.deny') }}
        </v-btn>
        <v-btn color="accent" variant="elevated" class="text-black font-weight-bold ml-2" @click="approve">
          {{ $t('active.handshake.approve') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onUnmounted } from 'vue'
  import { obrReady, obrRole } from '@/services/obrRuntime'
  import OBR from '@owlbear-rodeo/sdk'
  import type { PilotJoinRequestMetadata } from '@/types/compcon-obr'

  const requests = ref<PilotJoinRequestMetadata[]>([])
  const isVisible = computed(() => requests.value.length > 0)
  const currentRequest = computed(() => requests.value[0] || null)
  let metadataListenerUnsub: (() => void) | null = null

  const syncRequests = (metadata: Record<string, any>) => {
    if (obrRole.value !== 'GM') return
    const newQueue: PilotJoinRequestMetadata[] = []
    
    for (const key of Object.keys(metadata)) {
      if (key.startsWith('com.compcon.activemode/joinRequest_')) {
        const item = metadata[key] as PilotJoinRequestMetadata
        if (item && item.status === 'PENDING') {
          newQueue.push(item)
        }
      }
    }
    
    requests.value = newQueue.sort((a, b) => a.timestamp - b.timestamp)
  }

  const approve = async () => {
    const req = currentRequest.value
    if (!req) return

    try {
      const key = `com.compcon.activemode/joinRequest_${req.playerId}`
      await OBR.room.setMetadata({ [key]: { ...req, status: 'APPROVED' } })
    } catch (err) {
      console.error('[GmJoinAuth] Erro ao aprovar piloto:', err)
    }
  }

  const deny = async () => {
    const req = currentRequest.value
    if (!req) return
    try {
      const key = `com.compcon.activemode/joinRequest_${req.playerId}`
      await OBR.room.setMetadata({ [key]: undefined })
    } catch (err) {
      console.error('[GmJoinAuth] Erro ao negar piloto:', err)
    }
  }

  /**
   * `main.ts` monta o Vue ANTES de `obrBridge.init()` resolver o handshake do
   * Owlbear (`void obrBridge.init()` seguido de `mount`). Ler
   * `obrBridge.getRole()` no `onMounted` congelava o papel em 'PLAYER' e o
   * listener de metadados nunca era registrado: o pedido de entrada do jogador
   * ficava invisível para o Mestre. Observamos os refs reativos e registramos
   * o listener (com sync inicial) assim que o SDK confirmar o papel GM.
   */
  const stopAuthWatcher = watch(
    [obrReady, obrRole],
    async ([ready, role]) => {
      if (!ready || role !== 'GM' || metadataListenerUnsub) return
      try {
        syncRequests(await OBR.room.getMetadata())
      } catch (err) {
        console.warn('[GmJoinAuth] Erro ao ler metadados da sala:', err)
      }
      metadataListenerUnsub = OBR.room.onMetadataChange(syncRequests)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    stopAuthWatcher()
    if (metadataListenerUnsub) metadataListenerUnsub()
  })
</script>
