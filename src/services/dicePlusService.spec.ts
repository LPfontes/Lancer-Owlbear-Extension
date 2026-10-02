import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dicePlusService, COMPCON_SOURCE_ID } from './dicePlusService'
import OBR from '@owlbear-rodeo/sdk'

describe('dicePlusService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    Object.defineProperty(OBR, 'isAvailable', { value: true, configurable: true, writable: true })
    if (OBR.player) {
      vi.spyOn(OBR.player, 'getId').mockResolvedValue('test-player-id')
      vi.spyOn(OBR.player, 'getName').mockResolvedValue('Test Pilot')
    }
    dicePlusService.init()
  })

  describe('formatDiceNotation', () => {
    it('formats a simple d20 roll with bonus', () => {
      const notation = dicePlusService.formatDiceNotation({
        diceString: '1d20',
        flatBonus: 3,
      })
      expect(notation).toBe('1d20 + 3')
    })

    it('formats an attack roll with positive accuracy using d6kh1', () => {
      const notation = dicePlusService.formatDiceNotation({
        diceString: '1d20',
        flatBonus: 2,
        accuracy: 2,
        label: 'Ataque vs Evasão',
      })
      expect(notation).toBe('1d20 + 2d6kh1 + 2 #Ataque vs Evasão')
    })

    it('formats an attack roll with 1 accuracy as 1d6', () => {
      const notation = dicePlusService.formatDiceNotation({
        diceString: '1d20',
        accuracy: 1,
      })
      expect(notation).toBe('1d20 + 1d6')
    })

    it('formats an attack roll with negative accuracy (difficulty)', () => {
      const notation = dicePlusService.formatDiceNotation({
        diceString: '1d20',
        flatBonus: -1,
        accuracy: -2,
      })
      expect(notation).toBe('1d20 - 2d6kh1 - 1')
    })

    it('formats dice array with grouped counts', () => {
      const notation = dicePlusService.formatDiceNotation({
        dice: [
          { type: 'd6' },
          { type: 'd6' },
          { type: 'd8' },
        ],
        flatBonus: 4,
        label: 'Dano [Cinético]',
      })
      expect(notation).toBe('2d6 + 1d8 + 4 #Dano Cinético')
    })

    it('sanitizes label containing special characters', () => {
      const notation = dicePlusService.formatDiceNotation({
        diceString: '1d20',
        label: '[Pilot] Attack / Slash (Crit+2)!',
      })
      expect(notation).toBe('1d20 #Pilot Attack Slash Crit 2 !')
    })
  })

  describe('checkReady', () => {
    it('returns true when Dice+ answers on isReady channel', async () => {
      let messageHandler: ((event: any) => void) | null = null

      vi.spyOn(OBR.broadcast, 'onMessage').mockImplementation((channel: string, handler: any) => {
        if (channel === 'dice-plus/isReady') {
          messageHandler = handler
        }
        return () => {}
      })

      vi.spyOn(OBR.broadcast, 'sendMessage').mockImplementation(async (channel: string, data: any) => {
        if (channel === 'dice-plus/isReady' && messageHandler) {
          messageHandler({
            data: {
              requestId: (data as any).requestId,
              ready: true,
              timestamp: Date.now(),
            },
          })
        }
      })

      const isReady = await dicePlusService.checkReady(500)
      expect(isReady).toBe(true)
      expect(dicePlusService.isReady.value).toBe(true)
    })
  })

  describe('rollDice', () => {
    it('sends roll request to dice-plus and maps result groups to DddiceRollValue array', async () => {
      let rollHandler: ((event: any) => void) | null = null

      vi.spyOn(OBR.broadcast, 'onMessage').mockImplementation((channel: string, handler: any) => {
        if (channel === `${COMPCON_SOURCE_ID}/roll-result`) {
          rollHandler = handler
        }
        return () => {}
      })

      vi.spyOn(OBR.broadcast, 'sendMessage').mockImplementation(async (channel: string, data: any) => {
        if (channel === 'dice-plus/roll-request' && rollHandler) {
          rollHandler({
            data: {
              rollId: (data as any).rollId,
              result: {
                totalValue: 19,
                rollSummary: '[15] 15 + [4] 4 = 19',
                groups: [
                  {
                    diceType: 'd20',
                    dice: [{ diceId: '1', diceType: 'd20', value: 15, kept: true }],
                    total: 15,
                  },
                  {
                    diceType: 'd6',
                    dice: [
                      { diceId: '2', diceType: 'd6', value: 4, kept: true },
                      { diceId: '3', diceType: 'd6', value: 1, kept: false },
                    ],
                    total: 4,
                  },
                ],
              },
            },
          })
        }
      })

      const res = await dicePlusService.rollDice({
        diceString: '1d20',
        accuracy: 2,
        label: 'Ataque',
      })

      expect(res).toBeTruthy()
      if (res) {
        expect(res.values).toHaveLength(3)
        const d20 = res.values.find((v) => v.type === 'd20')
        expect(d20?.value).toBe(15)
        expect(d20?.is_dropped).toBe(false)

        const droppedD6 = res.values.find((v) => v.type === 'd6' && v.is_dropped)
        expect(droppedD6?.value).toBe(1)

        const keptD6 = res.values.find((v) => v.type === 'd6' && !v.is_dropped)
        expect(keptD6?.value).toBe(4)
      }
    })
  })

  describe('dddiceService integration', () => {
    it('delegates rollDice to dicePlusService when provider is dice-plus', async () => {
      const { dddiceService } = await import('./dddiceService')
      dddiceService.config.enabled = true
      dddiceService.config.provider = 'dice-plus'

      const rollSpy = vi.spyOn(dicePlusService, 'rollDice').mockResolvedValue({
        uuid: 'test-uuid',
        values: [{ type: 'd20', value: 20, is_dropped: false }],
        totalValue: 20,
      } as any)

      const result = await dddiceService.rollDice({ diceString: '1d20' })
      expect(rollSpy).toHaveBeenCalled()
      expect(result).toBeTruthy()
      if (result) {
        expect(result.totalValue).toBe(20)
      }
    })

    it('returns false without calling dicePlusService when provider is none', async () => {
      const { dddiceService } = await import('./dddiceService')
      dddiceService.config.enabled = true
      dddiceService.config.provider = 'none'

      const rollSpy = vi.spyOn(dicePlusService, 'rollDice')
      const result = await dddiceService.rollDice({ diceString: '1d20' })
      expect(rollSpy).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('returns false and does not roll when parameters have only fixed damage / no dice', async () => {
      const { dddiceService } = await import('./dddiceService')
      dddiceService.config.enabled = true
      dddiceService.config.provider = 'dice-plus'

      const rollSpy = vi.spyOn(dicePlusService, 'rollDice')

      // Flat bonus only (e.g. fixed damage 2)
      expect(dddiceService.hasDiceToRoll({ dice: [], flatBonus: 2 })).toBe(false)
      expect(dicePlusService.hasDiceToRoll({ dice: [], flatBonus: 2 })).toBe(false)

      const result1 = await dddiceService.rollDice({ dice: [], flatBonus: 2 })
      expect(result1).toBe(false)

      // Fixed damage string "3"
      expect(dddiceService.hasDiceToRoll({ diceString: '3' })).toBe(false)
      const result2 = await dddiceService.rollDice({ diceString: '3' })
      expect(result2).toBe(false)

      expect(rollSpy).not.toHaveBeenCalled()
    })
  })
})
