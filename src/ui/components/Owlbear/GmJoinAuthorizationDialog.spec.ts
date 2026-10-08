import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import GmJoinAuthorizationDialog from './GmJoinAuthorizationDialog.vue'
import { obrReady, obrRole, resetObrRuntime } from '@/services/obrRuntime'

/**
 * Regressão: o pedido de entrada do jogador não aparecia na tela do Mestre.
 *
 * `main.ts` monta o Vue ANTES de `obrBridge.init()` resolver o handshake do
 * Owlbear (`void obrBridge.init()` seguido de `compcon.mount()`). O dialog
 * lia `obrBridge.getRole()` no `onMounted`, congelava o papel em 'PLAYER' e
 * nunca registrava `OBR.room.onMetadataChange` — os pedidos PENDING na sala
 * passavam voando. A correção observa os refs reativos de `obrRuntime` e
 * registra o listener (com sync inicial) quando o SDK confirma o papel GM.
 */
const room = vi.hoisted(() => ({
  listeners: [] as Array<(metadata: any) => void>,
  metadata: {} as Record<string, any>,
  getMetadata: vi.fn(),
  setMetadata: vi.fn(),
  onMetadataChange: vi.fn(),
}))

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    isReady: true,
    room,
    player: {
      id: 'gm-player-1',
      getRole: vi.fn(async () => 'GM'),
      getName: vi.fn(async () => 'Mestre'),
    },
  },
}))

// happy-dom não implementa visualViewport, que o VOverlay do Vuetify consulta
// assim que o dialog fica visível.
beforeAll(() => {
  ;(globalThis as any).visualViewport ??= {
    addEventListener() {},
    removeEventListener() {},
  }
})

const pendingRequest = (playerId: string) => ({
  requestId: 'req-1',
  playerId,
  playerName: 'Jogador Teste',
  pilotId: 'pilot-1',
  sheetId: 'sheet-1',
  callsign: 'VALENTE',
  name: 'Fulano',
  mechName: 'GMS Everest',
  timestamp: 123,
  status: 'PENDING',
})

describe('GmJoinAuthorizationDialog', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    vi.restoreAllMocks()
    room.onMetadataChange.mockClear()
    room.getMetadata.mockClear()
    room.setMetadata.mockClear()
    room.listeners = []
    room.metadata = {}
    resetObrRuntime()
    room.getMetadata.mockImplementation(async () => room.metadata)
    room.setMetadata.mockImplementation(async () => {})
    room.onMetadataChange.mockImplementation((cb: (metadata: any) => void) => {
      room.listeners.push(cb)
      return () => {
        const i = room.listeners.indexOf(cb)
        if (i >= 0) room.listeners.splice(i, 1)
      }
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('registra o listener de metadados quando o handshake confirma GM', async () => {
    wrapper = mount(GmJoinAuthorizationDialog)
    await nextTick()

    // Ainda no handshake: nada registrado (era o bug original).
    expect(room.onMetadataChange).not.toHaveBeenCalled()

    // O handshake do Owlbear resolve DEPOIS do mount, confirmando o papel GM.
    obrReady.value = true
    obrRole.value = 'GM'
    await nextTick()
    await flushPromises()

    expect(room.onMetadataChange).toHaveBeenCalled()
    expect(typeof room.onMetadataChange.mock.calls[0][0]).toBe('function')
  })

  it('mostra pedidos PENDING da sala ao se tornar GM', async () => {
    room.metadata = {
      'com.compcon.activemode/joinRequest_player-1': pendingRequest('player-1'),
    }
    wrapper = mount(GmJoinAuthorizationDialog)
    await nextTick()

    obrReady.value = true
    obrRole.value = 'GM'
    await nextTick()
    await flushPromises()
    await nextTick()

    expect(room.onMetadataChange).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Jogador Teste')
  })

  it('ignora pedidos já decididos (status diferente de PENDING)', async () => {
    room.metadata = {
      'com.compcon.activemode/joinRequest_player-1': {
        ...pendingRequest('player-1'),
        status: 'APPROVED',
      },
    }
    wrapper = mount(GmJoinAuthorizationDialog)
    await nextTick()

    obrReady.value = true
    obrRole.value = 'GM'
    await nextTick()
    await flushPromises()
    await nextTick()

    expect(document.body.textContent).not.toContain('Jogador Teste')
  })

  it('jogadores não registram o listener', async () => {
    wrapper = mount(GmJoinAuthorizationDialog)
    await nextTick()

    obrReady.value = true
    obrRole.value = 'PLAYER'
    await nextTick()
    await flushPromises()

    expect(room.onMetadataChange).not.toHaveBeenCalled()
  })

  it('enfileira pedidos que chegam via mudança de metadados da sala', async () => {
    wrapper = mount(GmJoinAuthorizationDialog)
    await nextTick()

    obrReady.value = true
    obrRole.value = 'GM'
    await nextTick()
    await flushPromises()

    room.listeners.forEach(cb =>
      cb({ 'com.compcon.activemode/joinRequest_p-2': pendingRequest('p-2') })
    )
    await nextTick()

    expect(document.body.textContent).toContain('Jogador Teste')
  })
})
