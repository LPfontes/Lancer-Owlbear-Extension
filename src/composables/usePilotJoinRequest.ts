import { ref, onUnmounted } from 'vue'
import { obrPlayerId } from '@/services/obrRuntime'
import { obrBridge } from '@/services/obrBridge'
import OBR from '@owlbear-rodeo/sdk'
import type { PilotJoinRequestMetadata } from '@/types/compcon-obr'

export function usePilotJoinRequest() {
  const isWaiting = ref(false)
  const currentRequestId = ref('')
  
  let responseResolver: ((approved: boolean) => void) | null = null
  let metadataListenerUnsub: (() => void) | null = null

  const getMetadataKey = () => `com.compcon.activemode/joinRequest_${obrPlayerId.value}`

  const cancelRequest = async () => {
    if (!isWaiting.value || !currentRequestId.value) return
    
    // Remove do metadado
    if (OBR.isReady) {
      await OBR.room.setMetadata({ [getMetadataKey()]: undefined })
    }

    finishRequest(false)
  }

  const finishRequest = (approved: boolean) => {
    if (metadataListenerUnsub) {
      metadataListenerUnsub()
      metadataListenerUnsub = null
    }
    isWaiting.value = false
    currentRequestId.value = ''
    if (responseResolver) {
      responseResolver(approved)
      responseResolver = null
    }
    window.dispatchEvent(new CustomEvent('compcon-player-join-wait-close'))
  }

  const requestPilotJoin = async (sheet: any): Promise<boolean> => {
    if (obrBridge.getRole() === 'GM') {
      return true // GM bypasses authorization
    }

    if (OBR.isReady) {
      const metadata = await OBR.room.getMetadata()
      const existing = metadata[getMetadataKey()] as PilotJoinRequestMetadata | undefined
      if (existing && existing.status === 'APPROVED' && existing.sheetId === (sheet.ID || sheet.id)) {
        // Já foi aprovado previamente pelo Mestre e os metadados ainda estão lá.
        // Limpamos o metadado e entramos.
        await OBR.room.setMetadata({ [getMetadataKey()]: undefined })
        return true
      }
    }

    isWaiting.value = true
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    currentRequestId.value = requestId
    
    const playerName = (await OBR.player.getName()) || 'Jogador'
    const pilotId = sheet.PilotID || sheet.ID || sheet.id

    const reqMeta: PilotJoinRequestMetadata = {
      requestId,
      playerId: obrPlayerId.value,
      playerName,
      pilotId,
      sheetId: sheet.ID || sheet.id,
      callsign: sheet.Callsign || sheet.Name,
      name: sheet.Name,
      mechName: sheet.ActiveMech?.Name || sheet.Pilot?.ActiveMech?.Name || 'Sem Mech',
      timestamp: Date.now(),
      status: 'PENDING'
    }

    await OBR.room.setMetadata({ [getMetadataKey()]: reqMeta })

    window.dispatchEvent(new CustomEvent('compcon-player-join-wait', {
      detail: {
        callsign: reqMeta.callsign,
        name: reqMeta.name,
        mechName: reqMeta.mechName,
        cancelCallback: cancelRequest
      }
    }))

    return new Promise((resolve) => {
      responseResolver = resolve
      
      const onMetadataChange = async (metadata: any) => {
        const myReq = metadata[getMetadataKey()] as PilotJoinRequestMetadata | undefined
        
        if (!myReq) {
          // Removido (pelo GM negando ou nós mesmos cancelando)
          if (isWaiting.value) finishRequest(false)
        } else if (myReq.requestId === currentRequestId.value) {
          if (myReq.status === 'APPROVED') {
            await OBR.room.setMetadata({ [getMetadataKey()]: undefined })
            finishRequest(true)
          } else if (myReq.status === 'DENIED') {
            await OBR.room.setMetadata({ [getMetadataKey()]: undefined })
            finishRequest(false)
          }
        }
      }
      
      metadataListenerUnsub = OBR.room.onMetadataChange(onMetadataChange)
    })
  }

  onUnmounted(async () => {
    // Janela fechada enquanto aguardava: tira o pedido da fila do Mestre
    // para não deixar requisição órfã pendente na sala.
    if (isWaiting.value && currentRequestId.value && OBR.isReady) {
      await OBR.room.setMetadata({ [getMetadataKey()]: undefined }).catch(() => {})
    }
    finishRequest(false)
  })

  return {
    isWaiting,
    requestPilotJoin,
    cancelRequest
  }
}
