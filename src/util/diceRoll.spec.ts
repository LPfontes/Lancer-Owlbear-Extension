import { describe, it, expect } from 'vitest'
import {
  D3_REDUCTION_TABLE,
  applyDddiceValues,
  buildDiceFromFormulas,
  reducePhysicalDie,
  takeDddiceValue,
} from './diceRoll'
import type { DddiceRollValue } from '@/services/dddiceService'

function pool(...values: Array<[string, number]>): DddiceRollValue[] {
  return values.map(([type, value]) => ({ type, value }))
}

describe('reducePhysicalDie', () => {
  it('reduz o d4 físico para d3 pela tabela 1-1, 2-2, 3-2, 4-3', () => {
    expect(D3_REDUCTION_TABLE).toEqual({ 1: 1, 2: 2, 3: 2, 4: 3 })
    expect([1, 2, 3, 4].map(v => reducePhysicalDie(3, v))).toEqual([1, 2, 2, 3])
  })

  it('não mexe em dados que não são d3', () => {
    expect(reducePhysicalDie(6, 6)).toBe(6)
    expect(reducePhysicalDie(2, 4)).toBe(2)
  })
})

describe('buildDiceFromFormulas', () => {
  it('pede um d4 para o d3 sem subtrair modificador', () => {
    const { dice, flatBonus } = buildDiceFromFormulas([{ formula: '1d3' }])
    expect(dice).toEqual([{ type: 'd4' }])
    expect(flatBonus).toBe(0)
  })

  it('mantém os modificadores declarados na fórmula', () => {
    const { flatBonus } = buildDiceFromFormulas([{ formula: '2d3+3' }])
    expect(flatBonus).toBe(3)
  })
})

describe('takeDddiceValue', () => {
  it('consome o d4 físico no lugar do d3 lógico', () => {
    const dice = pool(['d4', 4], ['d6', 5])
    expect(takeDddiceValue(dice, 3)).toBe(4)
    expect(dice).toHaveLength(1)
  })

  it('devolve undefined quando o pool acabou', () => {
    expect(takeDddiceValue(pool(), 6)).toBeUndefined()
  })
})

describe('applyDddiceValues', () => {
  it('usa os valores do serviço com a redução de d3', () => {
    const [row] = applyDddiceValues([{ formula: '1d3' }], pool(['d4', 4]))
    expect(row.total).toBe(3)
  })

  it('soma o modificador fixo e as faces reduzidas', () => {
    const [row] = applyDddiceValues([{ formula: '2d3+1' }], pool(['d4', 2], ['d4', 3]))
    expect(row.total).toBe(5)
  })

  it('mantém as faces cruas quando não é d3', () => {
    const [row] = applyDddiceValues([{ formula: '2d6' }], pool(['d6', 6], ['d6', 4]))
    expect(row.total).toBe(10)
  })

  it('no crítico exibe mantidos (k) e descartados (d) já reduzidos', () => {
    const [row] = applyDddiceValues(
      [{ formula: '1d3' }],
      pool(['d4', 4], ['d4', 1]),
      { isCrit: true }
    )
    expect(row.total).toBe(3)
    expect(row.breakdown).toContain('3</b><sub>k</sub>')
    expect(row.breakdown).toContain('1</i><sub>d</sub>')
  })
})
