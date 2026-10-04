import { defineStore } from 'pinia'
import type { SyncedTrackerCard, SyncedTrackerSnapshot } from '@/types/tracker-sync'

/**
 * Estado do tracker de iniciativa sincronizado pelo Mestre.
 *
 * No cliente do Mestre este store guarda o espelho do que foi publicado (é o que a
 * prévia "ver como jogador" desenha). Nos clientes dos jogadores ele é a única fonte
 * do tracker: os jogadores não têm o encontro ativo localmente.
 *
 * O store é passivo de propósito: quem escreve é o `trackerSyncService`, e a UI só lê.
 */
export const useTrackerSyncStore = defineStore('trackerSync', {
  state: () => ({
    snapshot: null as SyncedTrackerSnapshot | null,
    lastReceivedAt: 0,
  }),

  getters: {
    /** Existe um combate sendo transmitido pelo Mestre? */
    isActive: (state): boolean => !!state.snapshot,
    cards: (state): SyncedTrackerCard[] => state.snapshot?.cards ?? [],
    round: (state): number => state.snapshot?.round ?? 0,
    encounterName: (state): string => state.snapshot?.name ?? '',
    inTurnId: (state): string | null => state.snapshot?.inTurnId ?? null,
    totalCount(): number {
      return this.cards.length
    },
    /** Quantos combatentes já gastaram todas as ativações da rodada. */
    spentCount(): number {
      return this.cards.filter(card => card.activations.current <= 0).length
    },
  },

  actions: {
    applySnapshot(snapshot: SyncedTrackerSnapshot): void {
      this.snapshot = snapshot
      this.lastReceivedAt = Date.now()
    },

    clear(): void {
      this.snapshot = null
      this.lastReceivedAt = 0
    },
  },
})
