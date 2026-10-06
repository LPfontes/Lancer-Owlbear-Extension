import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dumpRawStats,
  getTokenTrackerLogLevel,
  installTokenTrackerDebugConsole,
  setTokenTrackerLogLevel,
  summarizeBinding,
  summarizeValues,
  tokenTrackerLog,
  tokenTrackerTrace,
  tokenTrackerWarn,
} from '@/services/tokenTrackerDebug'
import type { TokenTrackerStatReader } from '@/services/tokenTrackerModel'

/**
 * O nível é o contrato do diagnóstico: `summary` responde "por que não debitou?",
 * `verbose` responde "por que não aparece?". Se a separação quebrar, o console do
 * usuário vira parede de novo — que foi exatamente o motivo de removerem os logs.
 */

beforeEach(() => {
  setTokenTrackerLogLevel('summary')
  vi.restoreAllMocks()
})

describe('níveis de log', () => {
  it('nasce em summary', () => {
    expect(getTokenTrackerLogLevel()).toBe('summary')
  })

  it('em summary, log sai e trace NÃO sai', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    tokenTrackerLog('teste', 'decisão')
    tokenTrackerTrace('teste', 'rodada de refresh')
    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0][0]).toContain('decisão')
  })

  it('em verbose, os dois saem', () => {
    setTokenTrackerLogLevel('verbose')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    tokenTrackerLog('teste', 'decisão')
    tokenTrackerTrace('teste', 'rodada')
    expect(info).toHaveBeenCalledTimes(2)
  })

  it('em off, nem log nem aviso saem', () => {
    setTokenTrackerLogLevel('off')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tokenTrackerLog('teste', 'decisão')
    tokenTrackerTrace('teste', 'rodada')
    tokenTrackerWarn('teste', 'problema')
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('aviso sai já em summary (problema não espera modo verboso)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tokenTrackerWarn('movimento', 'acima do cap')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('o escopo aparece na mensagem, para dar para filtrar no console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    tokenTrackerLog('movimento', 'gesto de 2 espaço(s)')
    expect(info.mock.calls[0][0]).toBe('[TokenTracker][movimento] gesto de 2 espaço(s)')
  })

  it('o nível persiste no localStorage (e summary limpa a chave)', () => {
    setTokenTrackerLogLevel('verbose')
    expect(globalThis.localStorage.getItem('cc_token_tracker_debug')).toBe('verbose')
    setTokenTrackerLogLevel('summary')
    expect(globalThis.localStorage.getItem('cc_token_tracker_debug')).toBeNull()
    setTokenTrackerLogLevel('off')
    expect(globalThis.localStorage.getItem('cc_token_tracker_debug')).toBe('off')
  })
})

describe('summarizeBinding', () => {
  it('resume o vínculo inteiro', () => {
    expect(
      summarizeBinding({
        sheetType: 'pilot',
        sheetId: 'p1',
        mechId: 'm1',
        combatantId: 'c1',
      })
    ).toBe('sheetType=pilot sheetId=p1 mechId=m1 combatantId=c1')
  })

  it('omite o que não existe e trata ausência', () => {
    expect(summarizeBinding({ sheetId: 'p1' })).toBe('sheetType=? sheetId=p1')
    expect(summarizeBinding(null)).toBe('sem vínculo')
    expect(summarizeBinding(undefined)).toBe('sem vínculo')
  })
})

describe('summarizeValues', () => {
  it('escreve os valores na ordem do painel', () => {
    expect(
      summarizeValues({
        stress: { current: 1, max: 4 },
        pv: { current: 12, max: 20 },
        heat: { current: 3, max: 5 },
      })
    ).toBe('pv 12/20, heat 3/5, stress 1/4')
  })

  it('marca a ausência de valores', () => {
    expect(summarizeValues({})).toBe('(sem valores)')
    expect(summarizeValues(null)).toBe('(sem valores)')
  })
})

describe('installTokenTrackerDebugConsole', () => {
  it('publica a API no window, incluindo o retrato do armazenamento', () => {
    installTokenTrackerDebugConsole()
    const api = (window as unknown as Record<string, any>).__ccTokenTracker
    expect(typeof api.level).toBe('function')
    expect(typeof api.summary).toBe('function')
    expect(typeof api.verbose).toBe('function')
    expect(typeof api.off).toBe('function')
    expect(typeof api.dump).toBe('function')
    // `storage()` é o que separa "a ficha não está aqui" de "esta janela não tem
    // armazenamento" — o sintoma de origens diferentes (http vs https).
    expect(typeof api.storage).toBe('function')
  })

  it('os atalhos mudam o nível de verdade', () => {
    installTokenTrackerDebugConsole()
    const api = (window as unknown as Record<string, any>).__ccTokenTracker
    api.verbose()
    expect(getTokenTrackerLogLevel()).toBe('verbose')
    api.off()
    expect(getTokenTrackerLogLevel()).toBe('off')
    api.summary()
    expect(getTokenTrackerLogLevel()).toBe('summary')
  })
})

describe('dumpRawStats', () => {  it('lê as MESMAS chaves que o serviço usa (é o que separa valor de chave errada)', () => {
    const reader: TokenTrackerStatReader = {
      getCurrent: key => ({ hp: 12, heatcap: 3, speed: 4 })[key],
      getMax: key => ({ hp: 20, heatcap: 5, speed: 5 })[key],
      getBoostedSpeed: () => 10,
    }
    const dump = dumpRawStats(reader) as Record<string, unknown>

    expect(dump['pv.current (hp)']).toBe(12)
    expect(dump['heat.current (heatcap)']).toBe(3)
    expect(dump['heat.max (heatcap)']).toBe(5)
    // O cap do turno vem do CombatController, não do StatController.
    expect(dump['speed.cap (BoostedSpeed)']).toBe(10)
    // Chave ausente é explícita, não `undefined` solto.
    expect(dump['structure.current (structure)']).toBe('(undefined)')
  })

  it('devolve null sem leitor e não estoura com leitor quebrado', () => {
    expect(dumpRawStats(null)).toBeNull()
    expect(dumpRawStats(undefined)).toBeNull()

    const quebrado: TokenTrackerStatReader = {
      getCurrent: () => {
        throw new Error('ficha explodiu')
      },
      getMax: () => 1,
    }
    const dump = dumpRawStats(quebrado) as Record<string, unknown>
    expect(String(dump['pv.current (hp)'])).toContain('ficha explodiu')
  })
})
