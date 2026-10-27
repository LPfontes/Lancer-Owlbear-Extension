import { describe, it, expect, vi, beforeEach } from 'vitest'
import { obrBridge } from './obrBridge'
import { tableSyncSocket } from './tableSyncSocket'

const HANDLER = 'handleBroadcastMessage'

const envelope = (payload: any) => ({ obrBridgeBroadcast: true, payload })

// happy-dom does not always honour MessageEventInit.origin, so pin it explicitly.
function postFrom(origin: string, data: any): void {
  const event = new MessageEvent('message', { data, origin })
  if (event.origin !== origin) Object.defineProperty(event, 'origin', { value: origin })
  window.dispatchEvent(event)
}

describe('obrBridge cross-window message handling', () => {
  let handler: any

  beforeEach(async () => {
    vi.restoreAllMocks()
    handler = vi.spyOn(obrBridge as any, HANDLER).mockResolvedValue(undefined)
    await obrBridge.init()
  })

  it('ignores an enveloped message from another origin', () => {
    postFrom('https://evil.example', envelope({ type: 'TABLE_ACTION', action: {} }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores a bare payload from its own origin', () => {
    postFrom(window.location.origin, { type: 'TABLE_ACTION', action: {} })

    expect(handler).not.toHaveBeenCalled()
  })

  it('accepts an enveloped message from its own origin', () => {
    const payload = { type: 'TABLE_ACTION', action: {} }

    postFrom(window.location.origin, envelope(payload))

    expect(handler).toHaveBeenCalledWith(payload)
  })
})

/**
 * O encontro NÃO é mais salvo no metadata da sala do Owlbear: quem guarda o "encontro
 * salvo" da mesa é o servidor de sincronização. Publicar e limpar o tracker precisam
 * chegar nele, senão quem abrir a janela depois não recebe nada no `INIT_SYNC`.
 */
describe('obrBridge tracker publication', () => {
  it('manda o snapshot do tracker para o servidor de sincronização', async () => {
    const send = vi.spyOn(tableSyncSocket, 'sendTrackerSync').mockImplementation(() => {})
    const snapshot = {
      encounterId: 'enc-1',
      name: 'Combate da Sessão',
      round: 1,
      inTurnId: null,
      cards: [],
      updatedAt: 1,
    } as any

    try {
      await obrBridge.sendTrackerSync(snapshot)
      expect(send).toHaveBeenCalledTimes(1)
      expect(send.mock.calls[0][0]).toEqual(snapshot)
    } finally {
      send.mockRestore()
    }
  })

  it('limpa o tracker também no servidor quando o combate termina', async () => {
    const clear = vi.spyOn(tableSyncSocket, 'sendTrackerClear').mockImplementation(() => {})

    try {
      await obrBridge.sendTrackerSyncClear()
      expect(clear).toHaveBeenCalledTimes(1)
    } finally {
      clear.mockRestore()
    }
  })
})

describe('obrBridge compatibility & read-only hardening', () => {
  it('syncFromRoom delega para requestSyncFromRoom para compatibilidade', async () => {
    const requestSync = vi.spyOn(obrBridge, 'requestSyncFromRoom').mockResolvedValue(undefined)
    try {
      const result = await obrBridge.syncFromRoom()
      expect(requestSync).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ pilotsCount: 0, npcsCount: 0 })
    } finally {
      requestSync.mockRestore()
    }
  })

  it('protege mutações em modo leitura', async () => {
    const { setSheetReadOnlySession } = await import('./sheetReadOnlySession')
    setSheetReadOnlySession(true)

    try {
      const tokenId = 'test-token'
      // createTokenForSheet retorna null em modo leitura
      const token = await obrBridge.createTokenForSheet({ ID: 'p-1' }, 'pilot')
      expect(token).toBeNull()

      // bindTokenToSheet não emite nem altera token em modo leitura
      await obrBridge.bindTokenToSheet(tokenId, { sheetType: 'pilot', sheetId: 'p-1' })
      // unbindToken também é no-op
      await obrBridge.unbindToken(tokenId)
    } finally {
      setSheetReadOnlySession(false)
    }
  })

  describe('calculateTokenGridSpaces e getSheetSize', () => {
    it('calcula espaços em grid hexagonal conforme regra oficial do Lancer', () => {
      // Tamanho 1/2 e Tamanho 1 ocupam 1 hex
      expect(obrBridge.calculateTokenGridSpaces(0.5, 'HEX_VERTICAL')).toBe(1)
      expect(obrBridge.calculateTokenGridSpaces(1, 'HEX_VERTICAL')).toBe(1)
      expect(obrBridge.calculateTokenGridSpaces(1, 'HEX_HORIZONTAL')).toBe(1)

      // Tamanho 2 ocupa 3 hex de espaços
      expect(obrBridge.calculateTokenGridSpaces(2, 'HEX_VERTICAL')).toBe(3)
      expect(obrBridge.calculateTokenGridSpaces(2, 'HEX_HORIZONTAL')).toBe(3)

      // Tamanho 3 ocupa 7 hexes de espaço
      expect(obrBridge.calculateTokenGridSpaces(3, 'HEX_VERTICAL')).toBe(7)
      expect(obrBridge.calculateTokenGridSpaces(3, 'HEX_HORIZONTAL')).toBe(7)

      // Tamanho 4+ ocupa 12 hexes de espaço
      expect(obrBridge.calculateTokenGridSpaces(4, 'HEX_VERTICAL')).toBe(12)
    })

    it('calcula espaços em grid quadrado (SQUARE)', () => {
      expect(obrBridge.calculateTokenGridSpaces(0.5, 'SQUARE')).toBe(1)
      expect(obrBridge.calculateTokenGridSpaces(1, 'SQUARE')).toBe(1)
      expect(obrBridge.calculateTokenGridSpaces(2, 'SQUARE')).toBe(2)
      expect(obrBridge.calculateTokenGridSpaces(3, 'SQUARE')).toBe(3)
      expect(obrBridge.calculateTokenGridSpaces(4, 'SQUARE')).toBe(4)
    })

    it('extrai corretamente o tamanho nominal da ficha (pilot e npc)', () => {
      // Piloto com mecha tamanho 2
      const pilotSize2 = {
        ActiveMech: { Frame: { Size: 2 } },
      }
      expect(obrBridge.getSheetSize(pilotSize2, 'pilot')).toBe(2)

      // Piloto tamanho 1/2
      const pilotSizeHalf = {
        ActiveMech: { Frame: { Size: '1/2' } },
      }
      expect(obrBridge.getSheetSize(pilotSizeHalf, 'pilot')).toBe(0.5)

      // NPC tamanho 3
      const npcSize3 = {
        StatController: { getMax: (stat: string) => (stat === 'size' ? 3 : null) },
      }
      expect(obrBridge.getSheetSize(npcSize3, 'npc')).toBe(3)

      // Fallback seguro
      expect(obrBridge.getSheetSize({}, 'pilot')).toBe(1)
    })
  })
})

