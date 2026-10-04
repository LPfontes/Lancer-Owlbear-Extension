import type { SyncedTrackerSnapshot } from '@/types/tracker-sync'
import { watch, type WatchHandle } from 'vue'
import { obrBridge } from '@/services/obrBridge'
import { isGmClient, obrReady } from '@/services/obrRuntime'
import { useTrackerSyncStore } from '@/stores/trackerSyncStore'
import {
  buildTrackerSnapshot,
  fitSnapshotToBudget,
  sanitizeTrackerSnapshot,
  trackerSnapshotSignature,
} from '@/services/trackerSyncPayload'

/**
 * Sincronização do tracker de iniciativa: Mestre → jogadores.
 *
 * O Mestre é a única fonte da verdade. A cada mudança relevante do encontro ativo
 * (rodada, turno, ativações, entrada/saída de combatente, ocultar/revelar) ele publica
 * um snapshot LEVE — sem nenhum dado de ficha — via broadcast, para os jogadores
 * acompanharem a iniciativa em tempo real.
 *
 * Quem entra na mesa depois (ou abre a janela do chat atrasado) não pegou o broadcast:
 * para esses o snapshot fica guardado no metadata da SALA do Owlbear (payload pequeno,
 * com limite de cards) e a hidratação inicial lê de lá. Além disso, ao iniciar, o
 * jogador pede um snapshot novo ao Mestre (`TRACKER_SYNC_REQUEST`), o que cobre o caso
 * de o metadata estar velho.
 *
 * Gatilhos são eventos de estrutura do encontro e de ativação — nunca estado de ficha
 * (PV, calor, estrutura), que muda o tempo todo e não é publicado.
 */

/** Janela de coalescência: rajadas de mudanças viram um único broadcast. */
const PUBLISH_DEBOUNCE_MS = 200

/** Intervalo mínimo entre gravações do snapshot no metadata da sala. */
const ROOM_SAVE_THROTTLE_MS = 1500

/** Intervalo mínimo entre respostas do Mestre a pedidos de snapshot. */
const REQUEST_RESPONSE_THROTTLE_MS = 2000

/** O que o serviço precisa para montar o snapshot, lido da janela que o registrou. */
export interface TrackerSyncSource {
  instance: any
  inTurnId: string | null
}

function notifyError(context: string, error: unknown) {
  console.warn(`[TrackerSync] ${context}`, error)
}

class TrackerSyncService {
  private started = false
  private listenersBound = false
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  private lastPublishedSignature = ''
  private lastRoomSaveAt = 0
  private lastRequestResponseAt = 0
  private pendingPublish: { instance: any; inTurnId: string | null } | null = null
  private source: (() => TrackerSyncSource | null) | null = null
  private readyWatcher: WatchHandle | null = null

  /**
   * Registra de onde sai o estado atual do combate nesta janela. O serviço lê a fonte
   * no momento de publicar, e não guarda uma cópia: o encontro ativo muda no lugar.
   */
  public setSource(source: (() => TrackerSyncSource | null) | null): void {
    this.source = source
  }

  /**
   * Liga o serviço nesta janela: escuta os eventos do bridge e hidrata o estado
   * a partir do metadata da sala. Idempotente.
   */
  public start(): void {
    if (this.started) return
    this.started = true

    if (typeof window !== 'undefined') {
      window.addEventListener('compcon-tracker-sync', this.onRemoteSnapshot as EventListener)
      window.addEventListener('compcon-tracker-clear', this.onRemoteClear)
      window.addEventListener('compcon-tracker-sync-request', this.onRemoteRequest)
      this.listenersBound = true
    }

    void this.hydrate()
    this.watchBridgeReadiness()
  }

  /**
   * O papel (Mestre/jogador) só é conhecido quando o bridge do Owlbear fica pronto — a
   * janela monta antes disso. Até lá não se publica nada; quando fica pronto, o Mestre
   * publica o estado atual e o jogador pede um snapshot.
   */
  private watchBridgeReadiness(): void {
    this.readyWatcher = watch(
      obrReady,
      ready => {
        if (ready) this.onBridgeReady()
      },
      { immediate: true }
    )
  }

  private stopWatchingBridge(): void {
    this.readyWatcher?.()
    this.readyWatcher = null
  }

  private onBridgeReady(): void {
    if (this.isGM()) {
      void this.publishOrClearRoom()
      return
    }

    // Jogador: a primeira hidratação pode ter acontecido antes do bridge existir,
    // então lê a sala de novo e, na sequência, pede o estado vivo ao Mestre.
    void this.hydrate().then(() => this.requestSync())
  }

  /**
   * Mestre: publica o encontro aberto agora. Sem encontro ativo, remove o snapshot que
   * uma sessão anterior possa ter deixado no metadata da sala — só se houver algo lá,
   * para não apagar o estado publicado por outra janela do próprio Mestre.
   */
  private async publishOrClearRoom(): Promise<void> {
    if (this.publishFromSource()) return

    try {
      const existing = await obrBridge.getRoomTrackerSync()
      if (existing) await this.clear()
    } catch (error) {
      notifyError('Falha ao limpar tracker obsoleto da sala:', error)
    }
  }

  /**
   * Publica o estado atual lido da fonte registrada. Devolve `false` quando não há
   * encontro ativo nesta janela (nada a publicar).
   */
  public publishFromSource(): boolean {
    const current = this.source?.()
    if (!current || !current.instance) return false
    this.publish(current.instance, current.inTurnId)
    return true
  }

  /**
   * Lê o último snapshot gravado pelo Mestre no metadata da sala (entrada tardia).
   * Passa pela mesma sanitização do broadcast: o metadata é dado de fora desta janela.
   */
  public async hydrate(): Promise<void> {
    try {
      const stored = await obrBridge.getRoomTrackerSync()
      const snapshot = sanitizeTrackerSnapshot(stored)
      if (snapshot) {
        useTrackerSyncStore().applySnapshot(snapshot)
      }
    } catch (error) {
      notifyError('Falha ao hidratar o tracker da sala:', error)
    }
  }

  /**
   * Pede ao Mestre um snapshot atualizado (usado por quem entra depois).
   */
  public requestSync(): void {
    if (this.isGM()) return
    void obrBridge
      .sendTrackerSyncRequest()
      .catch(error => notifyError('Falha ao pedir sincronização:', error))
  }

  /**
   * Publica o estado atual do encontro. Só o Mestre publica; chamadas de jogadores
   * são ignoradas. Mudanças em rajada são coalescidas em um único broadcast.
   */
  public publish(instance: any, inTurnId: string | null = null): void {
    if (!this.isGM()) return
    this.pendingPublish = { instance, inTurnId }

    if (this.publishTimer) clearTimeout(this.publishTimer)
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null
      const pending = this.pendingPublish
      this.pendingPublish = null
      if (pending) void this.flush(pending.instance, pending.inTurnId)
    }, PUBLISH_DEBOUNCE_MS)
  }

  /**
   * Encerra a sincronização (fim do combate): limpa o estado local, o metadata da
   * sala e avisa os jogadores.
   */
  public async clear(): Promise<void> {
    if (!this.isGM()) return

    if (this.publishTimer) {
      clearTimeout(this.publishTimer)
      this.publishTimer = null
    }
    this.pendingPublish = null
    this.lastPublishedSignature = ''

    useTrackerSyncStore().clear()
    await obrBridge
      .sendTrackerSyncClear()
      .catch(error => notifyError('Falha ao avisar fim de combate:', error))
    await obrBridge
      .saveRoomTrackerSync(null)
      .catch(error => notifyError('Falha ao limpar o tracker da sala:', error))
  }

  private async flush(instance: any, inTurnId: string | null): Promise<void> {
    const snapshot = buildTrackerSnapshot(instance, inTurnId)

    if (!snapshot) {
      await this.clear()
      return
    }

    const signature = trackerSnapshotSignature(snapshot)
    if (signature === this.lastPublishedSignature) return
    this.lastPublishedSignature = signature

    // Aplica localmente primeiro: a prévia "ver como jogador" do Mestre lê o mesmo store.
    useTrackerSyncStore().applySnapshot(snapshot)

    await obrBridge
      .sendTrackerSync(snapshot)
      .catch(error => notifyError('Falha ao transmitir o tracker:', error))
    this.scheduleRoomSave(snapshot)
  }

  private scheduleRoomSave(snapshot: SyncedTrackerSnapshot): void {
    const now = Date.now()
    if (now - this.lastRoomSaveAt < ROOM_SAVE_THROTTLE_MS) return
    this.lastRoomSaveAt = now
    void obrBridge
      .saveRoomTrackerSync(fitSnapshotToBudget(snapshot))
      .catch(error => notifyError('Falha ao gravar o tracker na sala:', error))
  }

  private onRemoteSnapshot = (event: Event): void => {
    // O Mestre é a fonte da verdade deste fluxo: ele ignora snapshots recebidos
    // (inclusive de um cliente malicioso) e usa apenas o que ele mesmo publicou.
    if (this.isGM()) return

    const incoming = (event as CustomEvent).detail
    const snapshot = sanitizeTrackerSnapshot(incoming)
    if (!snapshot) return

    useTrackerSyncStore().applySnapshot(snapshot)
  }

  private onRemoteClear = (): void => {
    if (this.isGM()) return
    this.lastPublishedSignature = ''
    useTrackerSyncStore().clear()
  }

  private onRemoteRequest = (): void => {
    if (!this.isGM()) return
    const now = Date.now()
    if (now - this.lastRequestResponseAt < REQUEST_RESPONSE_THROTTLE_MS) return
    this.lastRequestResponseAt = now

    // Responde com o estado vivo do encontro; se não houver nenhum aberto, cai para o
    // último snapshot aplicado (ex.: prévia do Mestre).
    if (this.publishFromSource()) return

    const snapshot = useTrackerSyncStore().snapshot
    if (!snapshot) return

    void obrBridge
      .sendTrackerSync(snapshot)
      .catch(error => notifyError('Falha ao responder pedido de sync:', error))
  }

  private isGM(): boolean {
    return isGmClient()
  }

  /** Remove os listeners e cancela publicações pendentes (testes/desmontagem). */
  public stop(): void {
    if (this.listenersBound && typeof window !== 'undefined') {
      window.removeEventListener('compcon-tracker-sync', this.onRemoteSnapshot as EventListener)
      window.removeEventListener('compcon-tracker-clear', this.onRemoteClear)
      window.removeEventListener('compcon-tracker-sync-request', this.onRemoteRequest)
      this.listenersBound = false
    }
    this.stopWatchingBridge()
    if (this.publishTimer) {
      clearTimeout(this.publishTimer)
      this.publishTimer = null
    }
    this.pendingPublish = null
    this.source = null
    this.started = false
  }
}

export const trackerSyncService = new TrackerSyncService()
