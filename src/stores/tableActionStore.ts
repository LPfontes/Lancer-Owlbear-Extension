import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type { TableActionItem, ActionCategory, DiceRollDetail } from '@/types/table-actions'
import { obrBridge } from '@/services/obrBridge'
import localforage from 'localforage'
import OBR from '@owlbear-rodeo/sdk'
import Tag, { type ITagData } from '@/classes/Tag'
import { CompendiumStore } from '@/features/compendium/store'

const LOCAL_STORAGE_KEY = 'compcon_table_actions_history'
export const tableActionsStorage = localforage.createInstance({
  name: 'COMPCON Persistent',
  storeName: 'table_actions',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
})

let memoryActionBackup: TableActionItem[] = []

/**
 * Verifica se o LocalStorage nativo do navegador está utilizável.
 */
function localStorageWorks(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const probe = '__cc_action_probe__'
    window.localStorage.setItem(probe, '1')
    const ok = window.localStorage.getItem(probe) === '1'
    window.localStorage.removeItem(probe)
    return ok
  } catch {
    return false
  }
}

/**
 * Carrega o histórico de ações com tolerância total a falhas:
 * 1. Tenta IndexedDB via localforage
 * 2. Fallback para LocalStorage nativo
 * 3. Fallback para memória da sessão
 */
async function loadPersistedActions(): Promise<TableActionItem[]> {
  // 1. IndexedDB via localforage
  try {
    const data = await tableActionsStorage.getItem<TableActionItem[]>(LOCAL_STORAGE_KEY)
    if (Array.isArray(data) && data.length > 0) {
      return data.map(toPlainAction)
    }
  } catch (err) {
    console.warn('[TableActionStore] IndexedDB indisponível ou inacessível; acionando fallback.', err)
  }

  // 2. Fallback: LocalStorage nativo
  if (localStorageWorks()) {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(toPlainAction)
        }
      }
    } catch (err) {
      console.warn('[TableActionStore] LocalStorage falhou na leitura:', err)
    }
  }

  // 3. Fallback: Memória volátil
  return memoryActionBackup
}

/**
 * Salva o histórico de ações garantindo persistência mesmo se IndexedDB falhar.
 */
async function savePersistedActions(actions: TableActionItem[]): Promise<void> {
  const plain = actions.slice(-150).map(toPlainAction)
  memoryActionBackup = plain

  let persisted = false

  // 1. Tenta IndexedDB via localforage
  try {
    await tableActionsStorage.setItem(LOCAL_STORAGE_KEY, plain)
    persisted = true
  } catch (err) {
    console.warn('[TableActionStore] IndexedDB falhou na escrita; acionando fallback para LocalStorage.', err)
  }

  // 2. Fallback: LocalStorage nativo (últimas 60 ações para caber com folga na cota de 5MB)
  if (!persisted && localStorageWorks()) {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(plain.slice(-60)))
      persisted = true
    } catch (err) {
      console.warn('[TableActionStore] LocalStorage também falhou na escrita:', err)
    }
  }

  if (!persisted) {
    console.info('[TableActionStore] Histórico operando em memória volátil (dados serão perdidos no reload).')
  }
}

/**
 * Limpa o histórico de ações em todas as camadas de armazenamento.
 */
async function removePersistedActions(): Promise<void> {
  memoryActionBackup = []
  try {
    await tableActionsStorage.removeItem(LOCAL_STORAGE_KEY)
  } catch {
    // ignore
  }
  if (localStorageWorks()) {
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

let saveRoomDebounceTimer: ReturnType<typeof setTimeout> | null = null

function tagLabel(tag: ITagData): string {
  try {
    const known = CompendiumStore().TagData.some(t => t.id === tag.id || (t as any).ID === tag.id)
    if (known) {
      const [resolved] = Tag.Deserialize([tag])
      if (resolved) return resolved.GetName()
    }
  } catch {
    return tag.id
  }
  return tag.id
}

/**
 * Converte qualquer objeto de ação ou Proxy reativo do Vue em um objeto JavaScript
 * puro e serializável, garantindo que o algoritmo de Structured Clone do IndexedDB
 * (localforage) não lance DataCloneError.
 */
function toPlainAction(action: any): TableActionItem {
  if (!action || typeof action !== 'object') {
    return {
      id: `act_${Date.now()}`,
      timestamp: Date.now(),
      senderName: '',
      category: 'chat',
      title: '',
    }
  }

  try {
    const raw = toRaw(action)
    return JSON.parse(JSON.stringify(raw))
  } catch {
    const raw = toRaw(action) || {}
    let plainRoll: any = undefined
    if (raw.roll) {
      try {
        plainRoll = JSON.parse(JSON.stringify(toRaw(raw.roll)))
      } catch {
        plainRoll = {
          total: Number(raw.roll.total || 0),
          notation: typeof raw.roll.notation === 'string' ? raw.roll.notation : undefined,
          dice: Array.isArray(raw.roll.dice) ? raw.roll.dice.map((d: any) => ({
            result: Number(d?.result || 0),
            sides: Number(d?.sides || 6),
          })) : undefined,
        }
      }
    }

    return {
      id: String(raw.id || `act_${Date.now()}`),
      timestamp: Number(raw.timestamp || Date.now()),
      senderName: String(raw.senderName || ''),
      actorType: raw.actorType,
      category: raw.category || 'chat',
      title: String(raw.title || ''),
      detail: typeof raw.detail === 'string' ? raw.detail : (raw.detail ? String(raw.detail) : undefined),
      targetName: typeof raw.targetName === 'string' ? raw.targetName : undefined,
      roll: plainRoll,
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t?.name || t?.title || t || '')) : undefined,
    }
  }
}

export const useTableActionStore = defineStore('tableActions', {
  state: () => ({
    actions: [] as TableActionItem[],
    isDrawerOpen: false,
    isPinned: false,
    unreadCount: 0,
    filterCategory: 'all' as string,
    filterActor: 'all' as string,
    searchQuery: '' as string,
    hasInitialized: false,
    activeActorName: '' as string,
    activeActorType: 'pilot' as 'pilot' | 'npc' | 'gm',
  }),

  getters: {
    /**
     * Feed do chat em ordem cronológica invertida: a ação mais recente vem primeiro.
     * O array `actions` continua armazenado em ordem crescente (é o que vai para a
     * persistência local e para o buffer da sala); a inversão é só de exibição.
     */
    recentActions: (state): TableActionItem[] => {
      return state.actions
        .map((item, index) => ({ item, index }))
        .sort((a, b) => b.item.timestamp - a.item.timestamp || b.index - a.index)
        .map(entry => entry.item)
    },

    filteredActions(): TableActionItem[] {
      let list = this.recentActions

      if (this.filterCategory && this.filterCategory !== 'all') {
        if (this.filterCategory === 'roll') {
          list = list.filter(item => item.category === 'roll' || item.category === 'damage')
        } else {
          list = list.filter(item => item.category === this.filterCategory)
        }
      }

      if (this.filterActor && this.filterActor !== 'all') {
        list = list.filter(item => item.senderName === this.filterActor)
      }

      if (this.searchQuery && this.searchQuery.trim().length > 0) {
        const q = this.searchQuery.toLowerCase().trim()
        list = list.filter(
          item =>
            item.title.toLowerCase().includes(q) ||
            (item.detail && item.detail.toLowerCase().includes(q)) ||
            item.senderName.toLowerCase().includes(q) ||
            (item.targetName && item.targetName.toLowerCase().includes(q))
        )
      }

      return list
    },

    actorsList: (state): string[] => {
      const set = new Set<string>()
      for (const a of state.actions) {
        if (a.senderName) set.add(a.senderName)
      }
      return Array.from(set)
    },
  },

  actions: {
    async init() {
      if (this.hasInitialized) return
      this.hasInitialized = true

      // 1. Carrega histórico persistente com salvaguarda multi-camada (IndexedDB -> LocalStorage -> Memória)
      try {
        const local = await loadPersistedActions()
        if (Array.isArray(local) && local.length > 0) {
          this.actions = local
        }
      } catch (e) {
        console.warn('[TableActionStore] Erro ao carregar histórico local:', e)
      }

      // 2. Busca o buffer recente gravado na sala Owlbear
      const fetchRoomActions = async () => {
        try {
          const roomActions = await obrBridge.getRoomTableActions()
          if (Array.isArray(roomActions) && roomActions.length > 0) {
            this.mergeActions(roomActions)
          }
        } catch (e) {
          console.warn('[TableActionStore] Erro ao carregar ações da sala Owlbear:', e)
        }
      }

      if (OBR.isAvailable && !obrBridge.getIsReady()) {
        OBR.onReady(() => {
          void fetchRoomActions()
        })
      } else {
        void fetchRoomActions()
      }

      // 3. Listener para ações recebidas via broadcast em tempo real
      window.addEventListener('compcon-table-action', (event: Event) => {
        const customEvt = event as CustomEvent<TableActionItem>
        if (customEvt.detail && customEvt.detail.id) {
          this.receiveIncomingAction(customEvt.detail)
        }
      })

      // 4. Listener para sincronização de metadata da sala
      window.addEventListener('compcon-table-actions-synced', (event: Event) => {
        const customEvt = event as CustomEvent<TableActionItem[]>
        if (Array.isArray(customEvt.detail)) {
          this.mergeActions(customEvt.detail)
        }
      })

      // 5. Listener para rolagens de combate compartilhadas (converte em TableAction se ainda não estiver presente)
      window.addEventListener('compcon-combat-roll', (event: Event) => {
        const customEvt = event as CustomEvent<any>
        const d = customEvt.detail
        if (!d) return

        const rollAction: TableActionItem = {
          id: d.id || `roll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: d.timestamp || Date.now(),
          senderName: d.senderName || 'Jogador',
          category: 'roll',
          title: d.title || 'Rolagem de Combate',
          detail: d.detail || '',
          roll: d.rollResult !== undefined ? { total: Number(d.rollResult) } : undefined,
        }
        this.receiveIncomingAction(rollAction)
      })
    },

    openDrawer() {
      this.isDrawerOpen = true
      this.unreadCount = 0
    },

    closeDrawer() {
      this.isDrawerOpen = false
    },

    toggleDrawer() {
      this.isDrawerOpen = !this.isDrawerOpen
      if (this.isDrawerOpen) {
        this.unreadCount = 0
      }
    },

    receiveIncomingAction(action: TableActionItem) {
      if (!action || !action.id) return
      const exists = this.actions.some(a => a.id === action.id)
      if (exists) return

      const plainAction = toPlainAction(action)
      this.actions.push(plainAction)
      if (this.actions.length > 200) {
        this.actions.shift()
      }

      const isChatActive = typeof window !== 'undefined' && window.location.hash.includes('/table-chat')
      if (!isChatActive && !this.isDrawerOpen) {
        this.unreadCount++
      } else {
        this.unreadCount = 0
      }

      void this.persistLocal()
    },

    mergeActions(incoming: TableActionItem[]) {
      if (!Array.isArray(incoming)) return

      if (incoming.length === 0 && this.actions.length > 0) {
        this.actions = []
        void this.persistLocal()
        return
      }

      const currentIds = new Set(this.actions.map(a => a.id))
      let hasNew = false

      for (const item of incoming) {
        if (item && item.id && !currentIds.has(item.id)) {
          this.actions.push(toPlainAction(item))
          currentIds.add(item.id)
          hasNew = true
        }
      }

      if (hasNew) {
        this.actions.sort((a, b) => a.timestamp - b.timestamp)
        if (this.actions.length > 200) {
          this.actions = this.actions.slice(-200)
        }
        void this.persistLocal()
      }
    },

    async postAction(actionData: Omit<TableActionItem, 'id' | 'timestamp'>): Promise<TableActionItem> {
      const newAction: TableActionItem = toPlainAction({
        ...actionData,
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      })

      this.actions.push(newAction)
      if (this.actions.length > 200) {
        this.actions.shift()
      }

      await this.persistLocal()

      // 1. Envia instantaneamente via broadcast
      await obrBridge.broadcastTableAction(newAction)

      // 2. Agenda a persistência do buffer na sala Owlbear com debounce
      this.scheduleRoomSave()

      return newAction
    },

    /**
     * Envia uma mensagem livre de chat
     */
    async postChat(text: string, senderName?: string, actorType?: 'pilot' | 'npc' | 'gm'): Promise<void> {
      const name = senderName || this.activeActorName || 'Piloto'
      const type = actorType || this.activeActorType || 'pilot'
      await this.postAction({
        senderName: name,
        actorType: type,
        category: 'chat',
        title: text,
      })
    },

    /**
     * Envia um indicativo de ação do Modo Ativo (ex: Barragem, Alvejar, Estabilizar, etc.)
     */
    async broadcastCombatAction(params: {
      actorName: string
      actionName: string
      actionType?: ActionCategory
      detail?: string
      targetName?: string
      roll?: DiceRollDetail
      tags?: ITagData[]
    }): Promise<void> {
      const category: ActionCategory = params.actionType || 'full_action'
      const title = `${params.actionName}`

      await this.postAction({
        senderName: params.actorName,
        category,
        title,
        detail: params.detail,
        targetName: params.targetName,
        roll: params.roll,
        tags: params.tags?.map(tagLabel),
      })
    },

    async persistLocal() {
      try {
        await savePersistedActions(this.actions)
      } catch (e) {
        console.warn('[TableActionStore] Falha ao persistir ações:', e)
      }
    },

    scheduleRoomSave() {
      if (saveRoomDebounceTimer) {
        clearTimeout(saveRoomDebounceTimer)
      }
      saveRoomDebounceTimer = setTimeout(() => {
        void obrBridge.saveRoomTableActions(this.actions.map(toPlainAction))
      }, 1500)
    },

    async clearHistory() {
      this.actions = []
      this.unreadCount = 0
      await removePersistedActions()
      await obrBridge.saveRoomTableActions([])
    },
  },
})
