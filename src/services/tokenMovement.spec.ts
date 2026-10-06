import { describe, expect, it } from 'vitest'
import {
  classifyMode,
  classifyMovementKind,
  decideMovement,
  normalizeSpaces,
  remainingAfterBoost,
  remainingAfterSpend,
} from '@/services/tokenMovement'
import type { MovementInput } from '@/types/token-movement'

/**
 * Matriz do §13.4 do plano. Nenhuma linha de OBR aqui de propósito: a decisão de
 * gasto é pura e é ela que protege o motor (que clampa em zero e perde o excedente).
 */

function input(patch: Partial<MovementInput> = {}): MovementInput {
  return {
    spaces: 2,
    remaining: 5,
    boostBonus: 0,
    maxSpeed: 5,
    canBoost: true,
    kind: 'voluntary',
    immobilized: false,
    ...patch,
  }
}

describe('normalizeSpaces', () => {
  it('arredonda para cima e nunca devolve negativo', () => {
    expect(normalizeSpaces(2)).toBe(2)
    expect(normalizeSpaces(2.1)).toBe(3)
    expect(normalizeSpaces(-3)).toBe(0)
    expect(normalizeSpaces(0)).toBe(0)
    expect(normalizeSpaces('nope')).toBe(0)
    expect(normalizeSpaces(undefined)).toBe(0)
  })
})

describe('classifyMovementKind — quem debita (§13.3)', () => {
  it('arrasto desta janela é voluntário', () => {
    expect(classifyMovementKind({ sameWindow: true, freeArmed: false })).toBe('voluntary')
  })

  it('arrasto de outra janela é involuntário', () => {
    expect(classifyMovementKind({ sameWindow: false, freeArmed: false })).toBe('involuntary')
  })

  it('"livre" armado ganha de tudo (não debita nem classifica como involuntário)', () => {
    expect(classifyMovementKind({ sameWindow: true, freeArmed: true })).toBe('free')
    expect(classifyMovementKind({ sameWindow: false, freeArmed: true })).toBe('free')
  })
})

describe('classifyMode — leg do gasto (§13.4 regra 4)', () => {
  it('sem Boost, todo gasto é move', () => {
    expect(classifyMode({ remaining: 5, boostBonus: 0, maxSpeed: 5, spaces: 5 })).toBe('move')
  })

  it('com Boost, gasto dentro do padrão ainda é move', () => {
    // Boost de 5 → restante 10, já gasto 0: andar 3 é movimento padrão.
    expect(classifyMode({ remaining: 10, boostBonus: 5, maxSpeed: 5, spaces: 3 })).toBe('move')
  })

  it('com Boost, o gasto que passa do padrão é boost', () => {
    // Já gastou 5 (restante 5 de 10), andar 3 passa dos 5 do padrão.
    expect(classifyMode({ remaining: 5, boostBonus: 5, maxSpeed: 5, spaces: 3 })).toBe('boost')
  })

  it('gastar exatamente o padrão com Boost ainda é move', () => {
    expect(classifyMode({ remaining: 10, boostBonus: 5, maxSpeed: 5, spaces: 5 })).toBe('move')
  })
})

describe('decideMovement — matriz do plano', () => {
  it('gasto que cabe no restante: debita', () => {
    expect(decideMovement(input({ spaces: 2, remaining: 5 }))).toEqual({
      action: 'spend',
      spend: 2,
      mode: 'move',
    })
  })

  it('gastar tudo o que resta: debita', () => {
    expect(decideMovement(input({ spaces: 5, remaining: 5 }))).toEqual({
      action: 'spend',
      spend: 5,
      mode: 'move',
    })
  })

  it('movimento involuntário (empurrão do GM) não debita', () => {
    expect(decideMovement(input({ kind: 'involuntary', spaces: 4, remaining: 5 }))).toEqual({
      action: 'reject',
      spend: 0,
      reason: 'involuntary',
    })
  })

  it('movimento livre armado não debita', () => {
    expect(decideMovement(input({ kind: 'free', spaces: 4, remaining: 5 }))).toEqual({
      action: 'reject',
      spend: 0,
      reason: 'free',
    })
  })

  it('imobilizado bloqueia, mesmo cabendo no restante', () => {
    expect(decideMovement(input({ immobilized: true, spaces: 1, remaining: 5 }))).toEqual({
      action: 'reject',
      spend: 0,
      reason: 'immobilized',
    })
  })

  it('involuntário ganha de imobilizado (nada é debitado de qualquer forma)', () => {
    const decision = decideMovement(input({ kind: 'involuntary', immobilized: true, spaces: 3 }))
    expect(decision.action).toBe('reject')
    if (decision.action !== 'reject') return
    expect(decision.reason).toBe('involuntary')
  })

  it('estouro com Boost legal: oferece Boost em vez de debitar', () => {
    expect(decideMovement(input({ spaces: 9, remaining: 5, canBoost: true }))).toEqual({
      action: 'offer-boost',
      spend: 9,
      overBy: 4,
    })
  })

  it('estouro sem Boost legal: rejeita com o motivo', () => {
    expect(decideMovement(input({ spaces: 9, remaining: 5, canBoost: false }))).toEqual({
      action: 'reject',
      spend: 0,
      reason: 'over-cap-no-boost',
    })
  })

  it('estouro de zero restante também cai no caminho do Boost', () => {
    expect(decideMovement(input({ spaces: 3, remaining: 0, canBoost: true }))).toEqual({
      action: 'offer-boost',
      spend: 3,
      overBy: 3,
    })
  })

  it('nunca devolve gasto acima do restante num spend (protege o clamp do motor)', () => {
    const decision = decideMovement(input({ spaces: 4, remaining: 5 }))
    expect(decision.action).toBe('spend')
    if (decision.action !== 'spend') return
    expect(decision.spend).toBeLessThanOrEqual(5)
  })

  it('lixo nos números não vira gasto negativo nem oferta de Boost à toa', () => {
    expect(decideMovement(input({ spaces: -4, remaining: 5 }))).toEqual({
      action: 'spend',
      spend: 0,
      mode: 'move',
    })
    // `remaining` corrompido vira 0: qualquer gesto positivo cai no caminho do Boost
    // (e nunca em um `spend` com NaN no meio).
    expect(decideMovement(input({ spaces: 2, remaining: Number.NaN }))).toEqual({
      action: 'offer-boost',
      spend: 2,
      overBy: 2,
    })
    expect(decideMovement(input({ spaces: Number.NaN, remaining: 5 }))).toEqual({
      action: 'spend',
      spend: 0,
      mode: 'move',
    })
  })
})

describe('remainingAfterBoost / remainingAfterSpend', () => {
  it('o Boost soma o movimento padrão ao restante (§13.5)', () => {
    expect(remainingAfterBoost({ remaining: 5, maxSpeed: 5 })).toBe(10)
    expect(remainingAfterBoost({ remaining: 0, maxSpeed: 4 })).toBe(4)
  })

  it('depois do gesto, o restante cai sem ficar negativo', () => {
    expect(remainingAfterSpend({ remaining: 10, spend: 3 })).toBe(7)
    expect(remainingAfterSpend({ remaining: 2, spend: 9 })).toBe(0)
  })
})
