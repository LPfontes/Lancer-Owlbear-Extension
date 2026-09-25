import OBR, { Item } from '@owlbear-rodeo/sdk'
import type { MechCombatState, CombatRollBroadcast } from '@/types/compcon-obr'

export const COMPCON_METADATA_KEY = 'com.compcon.activemode'
export const COMPCON_BROADCAST_CHANNEL = 'com.compcon.activemode.broadcast'

class OBRBridge {
  private isReady = false
  private role: 'GM' | 'PLAYER' = 'PLAYER'

  public async init(onReadyCallback?: () => void) {
    if (this.isReady) return

    OBR.onReady(async () => {
      this.isReady = true
      this.role = await OBR.player.getRole()
      console.log(`[OBRBridge] Inicializado com sucesso. Role: ${this.role}`)
      
      this.setupContextMenu()
      if (onReadyCallback) onReadyCallback()
    })
  }

  public getIsReady(): boolean {
    return this.isReady
  }

  public getRole(): 'GM' | 'PLAYER' {
    return this.role
  }

  private setupContextMenu() {
    OBR.contextMenu.create({
      id: 'compcon-bind-token',
      icons: [
        {
          icon: '/icon.svg',
          label: 'Vincular Ficha COMP/CON',
          filter: {
            roles: ['GM', 'PLAYER'],
            min: 1,
            max: 1,
          },
        },
      ],
      onClick: (context) => {
        const selectedIds = context.items.map((item: Item) => item.id)
        console.log('[OBRBridge] Token selecionado para vincular:', selectedIds)
        window.dispatchEvent(new CustomEvent('compcon-bind-token-requested', { detail: { tokenIds: selectedIds } }))
      },
    })
  }

  /**
   * Atualiza os metadados do token no Owlbear Rodeo com o estado do Mecha
   */
  public async updateTokenVisuals(tokenId: string, state: MechCombatState) {
    if (!this.isReady) return

    await OBR.scene.items.updateItems([tokenId], (items: Item[]) => {
      for (const item of items) {
        item.metadata[COMPCON_METADATA_KEY] = {
          mechId: state.id,
          name: state.name,
          hp: state.hp,
          heat: state.heat,
          structure: state.structure,
          stress: state.stress,
          statuses: state.statuses,
        }
      }
    })
  }

  /**
   * Envia uma notificação e broadcast de combate para todos os jogadores na sala
   */
  public async broadcastRoll(rollData: CombatRollBroadcast) {
    if (!this.isReady) return

    const rollMsg = rollData.rollResult !== undefined ? ` [Resultado: ${rollData.rollResult}]` : ''
    await OBR.notification.show(`${rollData.senderName}: ${rollData.title} - ${rollData.detail}${rollMsg}`)

    await OBR.broadcast.sendMessage(COMPCON_BROADCAST_CHANNEL, rollData)
  }

  /**
   * Obtém os IDs dos tokens selecionados no mapa atualmente
   */
  public async getSelectedTokenIds(): Promise<string[]> {
    if (!this.isReady) return []
    const selection = await OBR.player.getSelection()
    return selection || []
  }

  /**
   * Salva todo o estado do combate no Metadata da Sala do Owlbear
   */
  public async syncRoomEncounterState(encounters: Record<string, MechCombatState>) {
    if (!this.isReady) return
    await OBR.room.setMetadata({
      [COMPCON_METADATA_KEY]: encounters,
    })
  }

  /**
   * Escuta atualizações de metadados da sala
   */
  public onRoomStateChange(callback: (encounters: Record<string, MechCombatState>) => void) {
    if (!this.isReady) return
    OBR.room.onMetadataChange((metadata) => {
      const state = metadata[COMPCON_METADATA_KEY] as Record<string, MechCombatState>
      if (state) callback(state)
    })
  }
}

export const obrBridge = new OBRBridge()
