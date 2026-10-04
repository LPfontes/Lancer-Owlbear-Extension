import { afterEach, describe, expect, it } from 'vitest'
import {
  dumpRawStats,
  isTokenTrackerDebugEnabled,
  resetTokenTrackerDebug,
  setTokenTrackerDebug,
  summarizeBinding,
  summarizeValues,
} from '@/services/tokenTrackerDebug'
import type { TokenTrackerStatReader } from '@/services/tokenTrackerModel'

afterEach(() => {
  setTokenTrackerDebug(true)
  resetTokenTrackerDebug()
})

describe('isTokenTrackerDebugEnabled / setTokenTrackerDebug', () => {
  it('vem LIGADO por padrão (pedido: "deixa ativo")', () => {
    expect(isTokenTrackerDebugEnabled()).toBe(true)
  })

  it('desliga e religa na hora', () => {
    setTokenTrackerDebug(false)
    expect(isTokenTrackerDebugEnabled()).toBe(false)
    setTokenTrackerDebug(true)
    expect(isTokenTrackerDebugEnabled()).toBe(true)
  })

  it('desligar persiste; religar remove a marca', () => {
    setTokenTrackerDebug(false)
    expect(window.localStorage.getItem('cc_token_tracker_debug')).toBe('0')
    setTokenTrackerDebug(true)
    expect(window.localStorage.getItem('cc_token_tracker_debug')).toBeNull()
  })

  it('a marca de desligado no storage vence o default', () => {
    setTokenTrackerDebug(false)
    resetTokenTrackerDebug()
    expect(isTokenTrackerDebugEnabled()).toBe(false)
  })
})

describe('summarizeBinding', () => {
  it('mostra os ids que importam para casar com a ficha', () => {
    expect(summarizeBinding({ sheetType: 'pilot', sheetId: 'p1', mechId: 'm1', combatantId: 'c1' })).toBe(
      'sheetType=pilot sheetId=p1 mechId=m1 combatantId=c1'
    )
    expect(summarizeBinding({ sheetId: 'p1' })).toBe('sheetType=? sheetId=p1')
  })

  it('sem vínculo é explícito', () => {
    expect(summarizeBinding(null)).toBe('sem vínculo')
  })
})

describe('summarizeValues', () => {
  it('formata os seis slots em uma linha', () => {
    expect(
      summarizeValues({
        pv: { current: 12, max: 20 },
        overshield: { current: 4, max: 0 },
        heat: { current: 3, max: 8 },
        speed: { current: 4, max: 6 },
        structure: { current: 2, max: 4 },
        stress: { current: 1, max: 4 },
      })
    ).toBe('pv 12/20, ov 4, heat 3/8, speed 4/6, structure 2/4, stress 1/4')
  })

  it('avisa quando não há valor nenhum', () => {
    expect(summarizeValues({})).toBe('(sem valores)')
    expect(summarizeValues(null)).toBe('(sem valores)')
  })
})

describe('dumpRawStats', () => {
  const reader = (stats: Record<string, number>): TokenTrackerStatReader => ({
    getCurrent: key => stats[key],
    getMax: key => stats[`${key}Max`] ?? stats[key],
  })

  it('lê cru as chaves que o serviço usa, com o mapeamento do modelo', () => {
    const dump = dumpRawStats(
      reader({ hp: 12, hpMax: 20, overshield: 4, heatcap: 3, speed: 4, structure: 2, stress: 1 })
    )
    expect(dump).toMatchObject({
      'pv.current (hp)': 12,
      'pv.max (hp)': 20,
      'overshield.current (overshield)': 4,
      // Calor usa `heatcap` nas DUAS pontas: `heat` é legado neste fork.
      'heat.current (heatcap)': 3,
      'heat.max (heatcap)': 3,
      'speed.current (speed)': 4,
      'stress.current (stress)': 1,
    })
  })

  it('sem leitor não há o que despejar', () => {
    expect(dumpRawStats(null)).toBeNull()
    expect(dumpRawStats(undefined)).toBeNull()
    expect(dumpRawStats({} as TokenTrackerStatReader)).toBeNull()
  })

  it('registra erro de leitura em vez de estourar', () => {
    const dump = dumpRawStats({
      getCurrent: () => {
        throw new Error('boom')
      },
      getMax: () => 0,
    })
    expect(String(dump?.pv)).toContain('erro: Error: boom')
  })
})
