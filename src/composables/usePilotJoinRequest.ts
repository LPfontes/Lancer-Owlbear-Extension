import { ref, onUnmounted } from 'vue'
import { obrPlayerId } from '@/services/obrRuntime'
import { obrBridge } from '@/services/obrBridge'
import OBR from '@owlbear-rodeo/sdk'
import type { PilotJoinRequestMetadata } from '@/types/compcon-obr'
import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
import { roomSyncedSheets, roomSyncedTracker, tableSyncSocket } from '@/services/tableSyncSocket'

// Cache em memória de fichas já autorizadas nesta sessão pelo Mestre
const sessionApprovedSheetIds = new Set<string>()

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

  /**
   * Pede ao Mestre autorização para a ficha entrar no combate.
   *
   * `force` (pedido explícito do jogador pelo Combat Tracker) sempre passa pelo Mestre:
   * ignora os atalhos de "sem combate na sala", "ficha já ativa" e o cache da sessão,
   * que existem para não interromper quem só está abrindo a própria ficha.
   */
  const requestPilotJoin = async (
    sheet: any,
    options: { force?: boolean } = {}
  ): Promise<boolean> => {
    if (obrBridge.getRole() === 'GM') {
      return true // GM bypasses authorization
    }

    const sheetId = sheet.ID || sheet.id || sheet.PilotID
    if (!options.force) {
      if (sheetId && sessionApprovedSheetIds.has(sheetId)) {
        return true
      }

      // Se a sala não estiver em combate ativo (sem tracker ativo), o jogador
      // pode ativar a ficha livremente sem pedir autorização ao Mestre.
      const hasActiveCombat = Boolean(
        roomSyncedTracker.value &&
        Array.isArray(roomSyncedTracker.value.cards) &&
        roomSyncedTracker.value.cards.length > 0
      )
      if (!hasActiveCombat) {
        if (sheetId) sessionApprovedSheetIds.add(sheetId)
        return true
      }

      try {
        if (sheetId && PilotSheetStore().CurrentActiveID === sheetId) {
          sessionApprovedSheetIds.add(sheetId)
          return true
        }
      } catch (_e) {
        // Store pode não estar pronto
      }
    }

    if (OBR.isReady) {
      const metadata = await OBR.room.getMetadata()
      const existing = metadata[getMetadataKey()] as PilotJoinRequestMetadata | undefined
      if (existing && existing.status === 'APPROVED' && existing.sheetId === sheetId) {
        // Já foi aprovado previamente pelo Mestre e os metadados ainda estão lá.
        // Limpamos o metadado e entramos.
        sessionApprovedSheetIds.add(sheetId)
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
      callsign: sheet.Callsign || sheet.Pilot?.Callsign || sheet.Name,
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
            if (sheetId) sessionApprovedSheetIds.add(sheetId)
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

  /**
   * Pedido explícito de entrada no combate (botão do Combat Tracker do jogador).
   *
   * Depois da aprovação do Mestre, a ficha vira a ativa desta janela e o jogador anuncia
   * a entrada (`PILOT_JOIN_COMBAT`) com a ficha completa — é esse anúncio que o Mestre já
   * reconcilia no encontro contínuo (`reconcilePilotCombatant`) e que marca a posse da
   * ficha na sala. Disparo único, por evento do jogador: nada de rede em watcher.
   */
  const requestCombatEntry = async (sheet: any): Promise<boolean> => {
    const pilot = sheet?.Pilot ?? sheet?.Combatant?.actor
    if (!sheet?.ID || !pilot?.ID) return false

    const approved = await requestPilotJoin(sheet, { force: true })
    if (!approved) return false

    try {
      await PilotSheetStore().SetActiveSheet(sheet.ID)
    } catch (_e) {
      // Store pode não estar pronto; o anúncio abaixo continua valendo
    }

    const { Pilot } = await import('@/classes/pilot/Pilot')
    const knownVersion = Number(roomSyncedSheets.value?.[pilot.ID]?.version)
    tableSyncSocket.sendPilotJoinCombat({
      pilotId: pilot.ID,
      pilotData: Pilot.Serialize(pilot),
      activeMechId: pilot.ActiveMech?.ID,
      sheetId: sheet.ID,
      version: Number.isFinite(knownVersion) && knownVersion > 0 ? knownVersion : 1,
    })
    return true
  }

  return {
    isWaiting,
    requestPilotJoin,
    requestCombatEntry,
    cancelRequest
  }
}
