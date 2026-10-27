import { describe, expect, it } from 'vitest'
import {
  fullMovementRecord,
  movementRecordFromStats,
  movementValueFromRecord,
  recordCoversSpend,
  sanitizeMovementRecord,
  spendFromMovementRecord,
} from '@/services/tokenMovementRecord'
import type { TokenTrackerMovementRecord } from '@/types/token-tracker'

/**
 * O registro de movimento no token é o que impede duas janelas de debitarem o mesmo
 * arrasto. A lógica é pura de propósito: é ela que decide o número que TODAS as
 * janelas desenham.
 */

const record: TokenTrackerMovementRecord = {
  v: 1,
  current: 5,
  max: 5,
  boost: 0,
  t: 1000,
  w: 'gm/sheet',
}

describe('sanitizeMovementRecord', () => {
  it('aceita um registro válido', () => {
    expect(sanitizeMovementRecord(record)).toEqual(record)
  })

  it('recusa lixo, versão desconhecida e registro sem números', () => {
    expect(sanitizeMovementRecord(null)).toBeNull()
    expect(sanitizeMovementRecord('nada')).toBeNull()
    expect(sanitizeMovementRecord([1, 2])).toBeNull()
    expect(sanitizeMovementRecord({ ...record, v: 99 })).toBeNull()
    // Sem máximo e sem restante não há o que desenhar: melhor reconstruir da ficha.
    expect(sanitizeMovementRecord({ v: 1, current: 0, max: 0, boost: 0, t: 1 })).toBeNull()
  })

  it('coage números sujos e deixa o escritor opcional', () => {
    const sujo = sanitizeMovementRecord({ v: 1, current: -3, max: '6', boost: 2.9, t: undefined })
    expect(sujo).toEqual({ v: 1, current: 0, max: 6, boost: 2, t: 0 })
  })
})

describe('movementRecordFromStats', () => {
  it('monta o registro do estado vivo (restante, padrão e Boost)', () => {
    const built = movementRecordFromStats({ remaining: 5, maxSpeed: 5, boostBonus: 5 })
    expect(built.current).toBe(5)
    expect(built.max).toBe(5)
    expect(built.boost).toBe(5)
    expect(built.t).toBeGreaterThan(0)
  })

  it('aguenta dado ausente', () => {
    const built = movementRecordFromStats({ remaining: undefined, maxSpeed: null, boostBonus: 'x' })
    expect(built).toMatchObject({ current: 0, max: 0, boost: 0 })
  })
})

describe('movementValueFromRecord', () => {
  it('o cap do turno é padrão + Boost (é o que o badge mostra)', () => {
    expect(movementValueFromRecord({ ...record, current: 10, boost: 5 })).toEqual({
      current: 10,
      max: 10,
    })
    expect(movementValueFromRecord(record)).toEqual({ current: 5, max: 5 })
  })
})

describe('spendFromMovementRecord', () => {
  it('debita o que cabe e devolve o excedente para o Boost', () => {
    expect(spendFromMovementRecord(record, 2)).toMatchObject({ spent: 2, over: 0 })
    expect(spendFromMovementRecord(record, 2).record.current).toBe(3)
  })

  it('nunca debita mais do que existe (o excedente é o que vira oferta de Boost)', () => {
    const result = spendFromMovementRecord(record, 9)
    expect(result.spent).toBe(5)
    expect(result.over).toBe(4)
    expect(result.record.current).toBe(0)
  })

  it('lixo não vira gasto', () => {
    expect(spendFromMovementRecord(record, -4)).toMatchObject({ spent: 0, over: 0 })
    expect(spendFromMovementRecord(record, 'abc').record.current).toBe(5)
  })

  it('preserva o registro original (imutável)', () => {
    const before = { ...record }
    spendFromMovementRecord(record, 2)
    expect(record).toEqual(before)
  })
})

describe('recordCoversSpend', () => {
  it('diz se o gesto cabe no restante registrado', () => {
    expect(recordCoversSpend(record, 5)).toBe(true)
    expect(recordCoversSpend(record, 6)).toBe(false)
  })
})

describe('fullMovementRecord', () => {
  it('devolve o movimento do turno e larga o Boost', () => {
    const cheio = fullMovementRecord({ ...record, current: 1, boost: 5 })
    expect(cheio).toMatchObject({ current: 5, boost: 0 })
  })
})
