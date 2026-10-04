import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAYER_VISIBILITY,
  isCombatantHidden,
  isSideAllowed,
  MAX_HIDDEN_COMBATANTS,
  normalizeSide,
  sanitizePlayerVisibility,
  sanitizeTokenTrackerConfig,
} from '@/services/tokenTrackerPolicy'
import { DEFAULT_TOKEN_TRACKER_CONFIG } from '@/types/token-tracker'

describe('sanitizePlayerVisibility — default seguro', () => {
  it('cai no default quando o payload da sala não existe ou não é objeto', () => {
    for (const value of [undefined, null, 'nope', 42, true, []]) {
      expect(sanitizePlayerVisibility(value)).toEqual(DEFAULT_PLAYER_VISIBILITY)
    }
  })

  it('mantém o default de inimigos liberado? não: inimigo continua bloqueado', () => {
    const visibility = sanitizePlayerVisibility({ allies: false })
    expect(visibility.enemies).toBe(false)
    expect(visibility.neutral).toBe(true)
    expect(visibility.allies).toBe(false)
  })

  it('ignora booleanos de tipo errado em vez de confiar neles', () => {
    const visibility = sanitizePlayerVisibility({
      allies: 'true' as unknown as boolean,
      enemies: 1 as unknown as boolean,
      neutral: null as unknown as boolean,
    })
    expect(visibility).toEqual(DEFAULT_PLAYER_VISIBILITY)
  })

  it('aceita booleanos válidos', () => {
    const visibility = sanitizePlayerVisibility({ allies: true, enemies: true, neutral: false })
    expect(visibility).toMatchObject({ allies: true, enemies: true, neutral: false })
  })
})

describe('sanitizePlayerVisibility — lista de ocultos', () => {
  it('limpa, deduplica e descarta entradas inválidas', () => {
    const visibility = sanitizePlayerVisibility({
      hiddenCombatantIds: [' a ', 'a', '', '  ', 7, null, 'b'],
    })
    expect(visibility.hiddenCombatantIds).toEqual(['a', 'b'])
  })

  it('trunca no teto para o payload não crescer', () => {
    const ids = Array.from({ length: MAX_HIDDEN_COMBATANTS + 50 }, (_, i) => `c${i}`)
    const visibility = sanitizePlayerVisibility({ hiddenCombatantIds: ids })
    expect(visibility.hiddenCombatantIds).toHaveLength(MAX_HIDDEN_COMBATANTS)
  })

  it('tolera lista ausente ou de tipo errado', () => {
    expect(sanitizePlayerVisibility({}).hiddenCombatantIds).toEqual([])
    expect(sanitizePlayerVisibility({ hiddenCombatantIds: 'nope' }).hiddenCombatantIds).toEqual([])
  })
})

describe('normalizeSide', () => {
  it('aceita só a taxonomia conhecida e trata o resto como unknown', () => {
    expect(normalizeSide('ally')).toBe('ally')
    expect(normalizeSide('enemy')).toBe('enemy')
    expect(normalizeSide('neutral')).toBe('neutral')
    expect(normalizeSide('ENEMY')).toBe('unknown')
    expect(normalizeSide(undefined)).toBe('unknown')
    expect(normalizeSide(3)).toBe('unknown')
  })
})

describe('isSideAllowed', () => {
  it('segue a política por balde, com unknown caindo em neutro', () => {
    const visibility = { allies: true, enemies: false, neutral: false, hiddenCombatantIds: [] }
    expect(isSideAllowed('ally', visibility)).toBe(true)
    expect(isSideAllowed('enemy', visibility)).toBe(false)
    expect(isSideAllowed('neutral', visibility)).toBe(false)
    expect(isSideAllowed('unknown', visibility)).toBe(false)
  })
})

describe('isCombatantHidden', () => {
  const visibility = { allies: true, enemies: true, neutral: true, hiddenCombatantIds: ['x'] }

  it('respeita o hiddenFromPlayers do encontro', () => {
    expect(isCombatantHidden(null, true, visibility)).toBe(true)
  })

  it('respeita a lista publicada pela sala', () => {
    expect(isCombatantHidden('x', false, visibility)).toBe(true)
    expect(isCombatantHidden('y', false, visibility)).toBe(false)
  })

  it('sem combatantId não esconde nada por engano', () => {
    expect(isCombatantHidden(undefined, false, visibility)).toBe(false)
    expect(isCombatantHidden(null, undefined, visibility)).toBe(false)
  })
})

describe('sanitizeTokenTrackerConfig', () => {
  it('cai no default com entrada ausente ou corrompida', () => {
    for (const value of [undefined, null, 'nope', 1, []]) {
      const config = sanitizeTokenTrackerConfig(value)
      expect(config).toEqual(DEFAULT_TOKEN_TRACKER_CONFIG)
    }
  })

  it('lê os campos válidos e ignora os de tipo errado', () => {
    const config = sanitizeTokenTrackerConfig({
      enabled: false,
      invertSquares: true,
      showBlindagemWhenZero: true,
    })
    expect(config.enabled).toBe(false)
    expect(config.invertSquares).toBe(true)
    expect(config.showBlindagemWhenZero).toBe(true)
  })

  it('trava o teto de quadrados em faixa segura', () => {
    expect(sanitizeTokenTrackerConfig({ maxSquares: 0 }).maxSquares).toBe(1)
    expect(sanitizeTokenTrackerConfig({ maxSquares: 999 }).maxSquares).toBe(40)
    expect(sanitizeTokenTrackerConfig({ maxSquares: 12.9 }).maxSquares).toBe(12)
    expect(sanitizeTokenTrackerConfig({ maxSquares: 'nope' }).maxSquares).toBe(
      DEFAULT_TOKEN_TRACKER_CONFIG.maxSquares
    )
  })

  it('aceita distância negativa do token (aproximar) e trava a faixa', () => {
    expect(sanitizeTokenTrackerConfig({ panelGap: -12 }).panelGap).toBe(-12)
    expect(sanitizeTokenTrackerConfig({ panelGap: 8 }).panelGap).toBe(8)
    expect(sanitizeTokenTrackerConfig({ panelGap: -999 }).panelGap).toBe(-30)
    expect(sanitizeTokenTrackerConfig({ panelGap: 999 }).panelGap).toBe(30)
    expect(sanitizeTokenTrackerConfig({ panelGap: 'nope' }).panelGap).toBe(
      DEFAULT_TOKEN_TRACKER_CONFIG.panelGap
    )
    expect(sanitizeTokenTrackerConfig(undefined).panelGap).toBe(DEFAULT_TOKEN_TRACKER_CONFIG.panelGap)
  })

  it('só aceita flags booleanas nos slots conhecidos', () => {
    const config = sanitizeTokenTrackerConfig({
      slots: { pv: false, structure: 'nope', inventado: true },
    })
    expect(config.slots.pv).toBe(false)
    expect(config.slots.structure).toBeUndefined()
    expect((config.slots as Record<string, unknown>).inventado).toBeUndefined()
  })

  it('reaproveita a sanitização da política', () => {
    const config = sanitizeTokenTrackerConfig({
      playerVisibility: { allies: true, enemies: true, neutral: 'nope', hiddenCombatantIds: ['a', 'a'] },
    })
    expect(config.playerVisibility).toEqual({
      allies: true,
      enemies: true,
      neutral: DEFAULT_PLAYER_VISIBILITY.neutral,
      hiddenCombatantIds: ['a'],
    })
  })
})
