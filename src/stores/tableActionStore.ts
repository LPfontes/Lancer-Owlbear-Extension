import { defineStore } from 'pinia'
import type { TableActionItem, ActionCategory, DiceRollDetail } from '@/types/table-actions'
import { obrBridge } from '@/services/obrBridge'
import localforage from 'localforage'
import { openTableChatWindow, closeTableChatWindow, toggleTableChatWindow, isChatWindowOpen } from '@/services/tableChatWindow'
import OBR from '@owlbear-rodeo/sdk'
import Tag, { type ITagData } from '@/classes/Tag'
import { CompendiumStore } from '@/features/compendium/store'

const LOCAL_STORAGE_KEY = 'compcon_table_actions_history'
const tableActionsStorage = localforage.createInstance({
  name: 'COMPCON Persistent',
  storeName: 'table_actions',
})

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

      // 1. Carrega histórico persistente do armazenamento local
      try {
        const local = (await tableActionsStorage.getItem(LOCAL_STORAGE_KEY)) as TableActionItem[]
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
      void openTableChatWindow()
    },

    closeDrawer() {
      this.isDrawerOpen = false
      void closeTableChatWindow()
    },

    toggleDrawer() {
      this.isDrawerOpen = !this.isDrawerOpen
      if (this.isDrawerOpen) {
        this.unreadCount = 0
      }
      void toggleTableChatWindow()
    },

    receiveIncomingAction(action: TableActionItem) {
      if (!action || !action.id) return
      const exists = this.actions.some(a => a.id === action.id)
      if (exists) return

      this.actions.push(action)
      if (this.actions.length > 200) {
        this.actions.shift()
      }

      if (!isChatWindowOpen.value && !this.isDrawerOpen) {
        this.unreadCount++
      }

      this.persistLocal()
    },

    mergeActions(incoming: TableActionItem[]) {
      if (!Array.isArray(incoming)) return

      if (incoming.length === 0 && this.actions.length > 0) {
        this.actions = []
        this.persistLocal()
        return
      }

      const currentIds = new Set(this.actions.map(a => a.id))
      let hasNew = false

      for (const item of incoming) {
        if (item && item.id && !currentIds.has(item.id)) {
          this.actions.push(item)
          currentIds.add(item.id)
          hasNew = true
        }
      }

      if (hasNew) {
        this.actions.sort((a, b) => a.timestamp - b.timestamp)
        if (this.actions.length > 200) {
          this.actions = this.actions.slice(-200)
        }
        this.persistLocal()
      }
    },

    async postAction(actionData: Omit<TableActionItem, 'id' | 'timestamp'>): Promise<TableActionItem> {
      const newAction: TableActionItem = {
        ...actionData,
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      }

      this.actions.push(newAction)
      if (this.actions.length > 200) {
        this.actions.shift()
      }

      this.persistLocal()

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
        await tableActionsStorage.setItem(LOCAL_STORAGE_KEY, this.actions.slice(-150))
      } catch (e) {
        console.warn('[TableActionStore] Falha ao salvar no localforage:', e)
      }
    },

    scheduleRoomSave() {
      if (saveRoomDebounceTimer) {
        clearTimeout(saveRoomDebounceTimer)
      }
      saveRoomDebounceTimer = setTimeout(() => {
        void obrBridge.saveRoomTableActions(this.actions)
      }, 1500)
    },

    async clearHistory() {
      this.actions = []
      this.unreadCount = 0
      await tableActionsStorage.removeItem(LOCAL_STORAGE_KEY)
      await obrBridge.saveRoomTableActions([])
    },
  },
})
