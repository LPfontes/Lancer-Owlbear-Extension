import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { useTableActionStore, tableActionsStorage } from './tableActionStore'

describe('useTableActionStore - Persistência Segura e Anti-DataCloneError', () => {
  beforeEach(async () => {
    const store = useTableActionStore()
    await store.clearHistory()
  })

  it('salva e sanitiza ações contendo proxies reativos do Vue sem lançar DataCloneError', async () => {
    const store = useTableActionStore()

    const reactivePayload = reactive({
      actorName: 'Piloto Teste',
      actionName: 'Disparo de Canhão',
      detail: 'Ataque normal',
      roll: {
        total: 18,
        notation: '1d20+2',
        nestedState: ref('interno'),
      } as any,
    })

    const warnSpy = vi.spyOn(console, 'warn')

    const action = await store.postAction({
      senderName: reactivePayload.actorName,
      category: 'roll',
      title: reactivePayload.actionName,
      detail: reactivePayload.detail,
      roll: reactivePayload.roll,
    })

    expect(action).toBeDefined()
    expect(action.id).toBeDefined()
    expect(action.title).toBe('Disparo de Canhão')
    expect(store.actions).toHaveLength(1)

    const dataCloneWarns = warnSpy.mock.calls.filter(call =>
      call.some(arg => typeof arg === 'string' && arg.includes('[TableActionStore] Falha ao persistir ações'))
    )
    expect(dataCloneWarns).toHaveLength(0)

    warnSpy.mockRestore()
  })

  it('recebe ações externas e sanitiza antes de armazenar', async () => {
    const store = useTableActionStore()
    const warnSpy = vi.spyOn(console, 'warn')

    const incoming = reactive({
      id: 'act_test_123',
      timestamp: Date.now(),
      senderName: 'Outro Jogador',
      category: 'chat' as const,
      title: 'Mensagem de chat',
    })

    store.receiveIncomingAction(incoming)
    expect(store.actions).toHaveLength(1)
    expect(store.actions[0].id).toBe('act_test_123')

    const dataCloneWarns = warnSpy.mock.calls.filter(call =>
      call.some(arg => typeof arg === 'string' && arg.includes('[TableActionStore] Falha ao persistir ações'))
    )
    expect(dataCloneWarns).toHaveLength(0)

    warnSpy.mockRestore()
  })

  it('aciona salvaguarda para LocalStorage/memória caso o IndexedDB esteja indisponível ou falhe', async () => {
    const store = useTableActionStore()

    // Simula falha catastrófica no localforage / IndexedDB
    const storageSpy = vi.spyOn(tableActionsStorage, 'setItem').mockRejectedValue(new Error('IndexedDB permission denied'))

    const action = await store.postAction({
      senderName: 'Piloto Offline',
      category: 'chat',
      title: 'Mensagem enviada com IndexedDB offline',
    })

    expect(action).toBeDefined()
    expect(action.title).toBe('Mensagem enviada com IndexedDB offline')
    expect(store.actions).toHaveLength(1)

    // Verifica se salvou no fallback do LocalStorage
    const rawLocal = window.localStorage.getItem('compcon_table_actions_history')
    expect(rawLocal).toBeTruthy()
    const parsed = JSON.parse(rawLocal!)
    expect(parsed.some((a: any) => a.title === 'Mensagem enviada com IndexedDB offline')).toBe(true)

    storageSpy.mockRestore()
  })
})
