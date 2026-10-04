import { describe, expect, it } from 'vitest'
import {
  sanitizeTokenTrackerSummary,
  shouldPublishSummary,
  shouldWriteSummary,
  summaryToValues,
  summaryValueSignature,
  summaryWriterId,
  valuesToSummary,
  writerRank,
  SUMMARY_OTHER_WRITER_GRACE_MS,
  SUMMARY_WRITE_THROTTLE_MS,
} from '@/services/tokenTrackerSummary'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  TOKEN_TRACKER_SUMMARY_VERSION,
  type TokenTrackerConfig,
  type TokenTrackerSummary,
  type TokenTrackerValues,
} from '@/types/token-tracker'

const VALUES: TokenTrackerValues = {
  pv: { current: 12, max: 20 },
  overshield: { current: 4, max: 0 },
  heat: { current: 9, max: 8 },
  speed: { current: 4, max: 6 },
  structure: { current: 2, max: 4 },
  stress: { current: 4, max: 4 },
}

function config(patch: Partial<TokenTrackerConfig> = {}): TokenTrackerConfig {
  return { ...DEFAULT_TOKEN_TRACKER_CONFIG, ...patch }
}

describe('valuesToSummary', () => {
  it('monta o resumo com as seis chaves e o autor', () => {
    const summary = valuesToSummary(VALUES, 'gm', 1000)
    expect(summary).toEqual({
      v: TOKEN_TRACKER_SUMMARY_VERSION,
      pv: [12, 20],
      ov: 4,
      heat: [9, 8],
      sp: [4, 6],
      st: [2, 4],
      ss: [4, 4],
      w: 'gm',
      t: 1000,
    })
  })

  it('preenche slots ausentes com zero para o formato ser fixo', () => {
    const summary = valuesToSummary({ pv: { current: 3, max: 0 } }, 'p1', 1)
    expect(summary.heat).toEqual([0, 0])
    expect(summary.ov).toBe(0)
    expect(summary.ss).toEqual([0, 0])
  })

  it('não deixa passar valor negativo nem autor vazio', () => {
    const summary = valuesToSummary({ pv: { current: -5, max: -1 } }, '   ', 0)
    expect(summary.pv).toEqual([0, 0])
    expect(summary.w).toBe('unknown')
  })

  it('preserva calor acima da capacidade (o resumo é espelho, não regra)', () => {
    expect(valuesToSummary(VALUES, 'gm', 0).heat).toEqual([9, 8])
  })
})

describe('summaryToValues', () => {
  it('faz round-trip com valuesToSummary, menos o máximo da Blindagem', () => {
    const values = summaryToValues(valuesToSummary(VALUES, 'gm', 10))

    expect(values.pv).toEqual(VALUES.pv)
    expect(values.heat).toEqual(VALUES.heat)
    expect(values.speed).toEqual(VALUES.speed)
    expect(values.structure).toEqual(VALUES.structure)
    expect(values.stress).toEqual(VALUES.stress)
    // O resumo carrega só o valor ATUAL da Blindagem (o mecha normalmente tem
    // overshield 0/0), então o máximo volta igual ao atual — perda proposital.
    expect(values.overshield).toEqual({ current: 4, max: 4 })
  })

  it('expõe a Blindagem como valor só-corrente', () => {
    const values = summaryToValues(valuesToSummary({ overshield: { current: 6, max: 0 } }, 'gm', 0))
    expect(values.overshield).toEqual({ current: 6, max: 6 })
  })
})

describe('sanitizeTokenTrackerSummary', () => {
  const valid = valuesToSummary(VALUES, 'gm', 10)

  it('aceita um resumo válido', () => {
    expect(sanitizeTokenTrackerSummary(valid)).toEqual(valid)
  })

  it('rejeita entrada que não é objeto', () => {
    for (const value of [undefined, null, 'nope', 3, []]) {
      expect(sanitizeTokenTrackerSummary(value)).toBeNull()
    }
  })

  it('rejeita versão desconhecida', () => {
    expect(sanitizeTokenTrackerSummary({ ...valid, v: 2 })).toBeNull()
    expect(sanitizeTokenTrackerSummary({ ...valid, v: undefined })).toBeNull()
  })

  it('rejeita quando falta qualquer uma das seis chaves', () => {
    for (const key of ['pv', 'heat', 'sp', 'st', 'ss', 'ov'] as const) {
      const broken: Record<string, unknown> = { ...valid }
      delete broken[key]
      expect(sanitizeTokenTrackerSummary(broken)).toBeNull()
    }
  })

  it('rejeita número não finito', () => {
    expect(sanitizeTokenTrackerSummary({ ...valid, ov: Number.NaN })).toBeNull()
    expect(sanitizeTokenTrackerSummary({ ...valid, pv: [1, Number.POSITIVE_INFINITY] })).toBeNull()
    expect(sanitizeTokenTrackerSummary({ ...valid, pv: [1] })).toBeNull()
  })

  it('coage para inteiro não negativo e normaliza autor/timestamp', () => {
    const summary = sanitizeTokenTrackerSummary({
      ...valid,
      pv: [7.8, '20.9'],
      ov: -1,
      w: '  p2  ',
      t: 'abc',
    })
    expect(summary?.pv).toEqual([7, 20])
    expect(summary?.ov).toBe(0)
    expect(summary?.w).toBe('p2')
    expect(summary?.t).toBe(0)
  })

  it('não confia em autor gigante', () => {
    const summary = sanitizeTokenTrackerSummary({ ...valid, w: 'x'.repeat(500) })
    expect(summary?.w.length).toBeLessThanOrEqual(64)
  })
})

describe('summaryValueSignature', () => {
  it('ignora autor e timestamp (só valores importam para o diff)', () => {
    const a = valuesToSummary(VALUES, 'gm', 100)
    const b: TokenTrackerSummary = { ...valuesToSummary(VALUES, 'p1', 999) }
    expect(summaryValueSignature(a)).toBe(summaryValueSignature(b))
  })

  it('muda quando um valor muda', () => {
    const a = valuesToSummary(VALUES, 'gm', 100)
    const b = valuesToSummary({ ...VALUES, pv: { current: 11, max: 20 } }, 'gm', 100)
    expect(summaryValueSignature(a)).not.toBe(summaryValueSignature(b))
  })

  it('resumo ausente tem assinatura vazia', () => {
    expect(summaryValueSignature(null)).toBe('')
  })
})

describe('shouldWriteSummary — eleição de escritor', () => {
  const binding = { sheetType: 'pilot', sheetId: 'p1', mechId: 'm1' }

  it('o GM escreve todos os tokens vinculados', () => {
    expect(
      shouldWriteSummary({ role: 'GM', ownSheetIds: [], binding, config: config() })
    ).toBe(true)
  })

  it('o jogador escreve só a própria ficha', () => {
    expect(
      shouldWriteSummary({ role: 'PLAYER', ownSheetIds: ['p1'], binding, config: config() })
    ).toBe(true)
    expect(
      shouldWriteSummary({ role: 'PLAYER', ownSheetIds: ['m1'], binding, config: config() })
    ).toBe(true)
    expect(
      shouldWriteSummary({ role: 'PLAYER', ownSheetIds: ['outro'], binding, config: config() })
    ).toBe(false)
  })

  it('ninguém escreve com os trackers desligados', () => {
    expect(
      shouldWriteSummary({
        role: 'GM',
        ownSheetIds: ['p1'],
        binding,
        config: config({ enabled: false }),
      })
    ).toBe(false)
  })

  it('token sem vínculo não tem o que resumir', () => {
    for (const empty of [null, undefined, {}, { sheetType: 'pilot' }]) {
      expect(
        shouldWriteSummary({ role: 'GM', ownSheetIds: [], binding: empty, config: config() })
      ).toBe(false)
    }
  })
})

describe('writerRank / summaryWriterId — força da fonte', () => {
  it('encontro ativo é mais forte que a ficha', () => {
    expect(writerRank('gm/encounter')).toBe(2)
    expect(writerRank('gm/sheet')).toBe(1)
    expect(writerRank('p-abc12345/sheet')).toBe(1)
    expect(writerRank('p-abc12345/encounter')).toBe(2)
    expect(writerRank('qualquer coisa')).toBe(0)
    expect(writerRank(undefined)).toBe(0)
  })

  it('monta o id do escritor com papel e fonte', () => {
    expect(summaryWriterId('GM', 'encounter')).toBe('gm/encounter')
    expect(summaryWriterId('GM', 'sheet')).toBe('gm/sheet')
    expect(summaryWriterId('PLAYER', 'sheet', 'abcdef123456')).toBe('p-abcdef12/sheet')
    expect(summaryWriterId('PLAYER', 'sheet')).toBe('p/sheet')
  })
})

describe('shouldPublishSummary — throttle e briga entre escritores', () => {
  const base = valuesToSummary(VALUES, 'gm/encounter', 10_000)
  const changedSame = valuesToSummary({ ...VALUES, pv: { current: 3, max: 20 } }, 'gm/encounter', 10_000)
  const changed = changedSame

  it('primeira gravação sempre passa', () => {
    expect(shouldPublishSummary(null, base, 10_000)).toBe(true)
  })

  it('valores idênticos não regravam', () => {
    const same: TokenTrackerSummary = { ...base, t: 10_500 }
    expect(shouldPublishSummary(base, same, 10_500)).toBe(false)
  })

  it('o mesmo escritor respeita o throttle', () => {
    expect(shouldPublishSummary(base, changed, 10_000 + SUMMARY_WRITE_THROTTLE_MS - 1)).toBe(false)
    expect(shouldPublishSummary(base, changed, 10_000 + SUMMARY_WRITE_THROTTLE_MS)).toBe(true)
  })

  it('espera a janela de cortesia antes de passar por cima de outro escritor de MESMA força', () => {
    // Mesma força (dois jogadores com a ficha): aí vale a cortesia de 3s.
    const mine = valuesToSummary(VALUES, 'p-abc/sheet', 10_000)
    const other = valuesToSummary({ ...VALUES, pv: { current: 3, max: 20 } }, 'p-def/sheet', 10_000)
    expect(shouldPublishSummary(mine, other, 10_000 + SUMMARY_OTHER_WRITER_GRACE_MS - 1)).toBe(false)
    expect(shouldPublishSummary(mine, other, 10_000 + SUMMARY_OTHER_WRITER_GRACE_MS)).toBe(true)
  })

  it('fonte mais FORTE (encontro) grava na hora, sem throttle nem cortesia', () => {
    const fromSheet = valuesToSummary(VALUES, 'gm/sheet', 10_000)
    const fromEncounter = valuesToSummary({ ...VALUES, heat: { current: 3, max: 5 } }, 'gm/encounter', 10_001)
    expect(shouldPublishSummary(fromSheet, fromEncounter, 10_001)).toBe(true)
  })

  it('fonte mais FRACA (só ficha) NUNCA sobrescreve o encontro', () => {
    // O caso real: a janela de chat tem a ficha com calor 0 e tentaria zerar o
    // calor 3 que o GM aplicou no encontro.
    const fromEncounter = valuesToSummary({ ...VALUES, heat: { current: 3, max: 5 } }, 'gm/encounter', 10_000)
    const staleSheet = valuesToSummary(VALUES, 'gm/sheet', 60_000)
    expect(shouldPublishSummary(fromEncounter, staleSheet, 60_000)).toBe(false)
  })

  it('tolera opções explícitas', () => {
    expect(shouldPublishSummary(base, changed, 10_050, { throttleMs: 10 })).toBe(true)
  })
})
