import type {
  MovementDecision,
  MovementInput,
  MovementKind,
  MovementMode,
} from '@/types/token-movement'

/**
 * Decisão de gasto do movimento (plano §13.4).
 *
 * Puro: nada de OBR, store ou Vue. Recebe o que a captura do arrasto apurou
 * (`tokenMovementCapture.ts`) e diz o que fazer com o motor de regras — que já
 * existe e resolve o resto (§13.1).
 *
 * **Ordem obrigatória: decidir ANTES de gastar.**
 * `CombatController.SpendMovement` faz `Math.max(0, from - spent)`: ele clampa em
 * zero e joga o excedente fora. Gastar 9 com 5 restantes viraria "5" em silêncio e
 * não haveria mais como oferecer Boost.
 */

/** Espaços de um gesto, arredondados para cima e nunca negativos. */
export function normalizeSpaces(spaces: unknown): number {
  const n = Number(spaces)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.ceil(n)
}

/**
 * Inteiro não negativo de verdade.
 *
 * `Math.max(0, NaN)` devolve `NaN` — e um `NaN` aqui contaminaria a comparação
 * `spaces <= remaining` (que vira `false`), mandando um gesto comum para o caminho
 * de Boost. Ler ficha corrompida não pode virar oferta de Boost.
 */
function toNonNegativeInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.trunc(n))
}

/**
 * Classificação de leg (§13.4, regra 4): mesma conta que o cartão de combate usa.
 *
 * O gasto é `boost` quando já houve Boost **e** o total do turno passa do movimento
 * padrão — antes disso os dois coincidem e chamar de `boost` seria mentira.
 */
export function classifyMode(input: {
  remaining: number
  boostBonus: number
  maxSpeed: number
  spaces: number
}): MovementMode {
  if (input.boostBonus <= 0) return 'move'
  const alreadySpent = Math.max(0, input.maxSpeed + input.boostBonus - input.remaining)
  return alreadySpent + input.spaces > input.maxSpeed ? 'boost' : 'move'
}

/**
 * Quem debita o gesto (§13.3)? Arrasto de outra janela é involuntário (empurrão do
 * GM) e nada é debitado; "livre" armado nesta janela também não.
 */
export function classifyMovementKind(input: {
  sameWindow: boolean
  freeArmed: boolean
}): MovementKind {
  if (input.freeArmed) return 'free'
  return input.sameWindow ? 'voluntary' : 'involuntary'
}

/**
 * Decide o que fazer com um gesto de movimento que acabou de assentar.
 *
 * Regras, em ordem (§13.4):
 * 1. `involuntary` → rejeita (não debita);
 * 2. `free` → rejeita (não debita);
 * 3. `immobilized` → rejeita;
 * 4. cabe no restante → `spend`, com o `mode` classificado;
 * 5. passa do restante e o Boost é legal → `offer-boost`;
 * 6. passa do restante sem Boost legal → rejeita (`over-cap-no-boost`).
 */
export function decideMovement(input: MovementInput): MovementDecision {
  if (input.kind === 'involuntary') return { action: 'reject', spend: 0, reason: 'involuntary' }
  if (input.kind === 'free') return { action: 'reject', spend: 0, reason: 'free' }
  if (input.immobilized) return { action: 'reject', spend: 0, reason: 'immobilized' }

  const spaces = normalizeSpaces(input.spaces)
  const remaining = toNonNegativeInt(input.remaining)
  if (spaces <= remaining) {
    return {
      action: 'spend',
      spend: spaces,
      mode: classifyMode({
        remaining,
        boostBonus: input.boostBonus,
        maxSpeed: input.maxSpeed,
        spaces,
      }),
    }
  }

  if (input.canBoost) {
    return { action: 'offer-boost', spend: spaces, overBy: spaces - remaining }
  }

  return { action: 'reject', spend: 0, reason: 'over-cap-no-boost' }
}

/**
 * Depois do Boost, o gasto é sempre possível por construção: `Boost()` soma
 * `speed` ao `BoostBonus` **e** ao restante (§13.5). Aqui só confirmamos o número
 * final que o motor terá, para o log e para o teste.
 */
export function remainingAfterBoost(input: {
  remaining: number
  maxSpeed: number
}): number {
  return toNonNegativeInt(input.remaining) + toNonNegativeInt(input.maxSpeed)
}

/** O gasto que sobra para depois do Boost, dado o gesto (nunca negativo). */
export function remainingAfterSpend(input: { remaining: number; spend: number }): number {
  return Math.max(0, toNonNegativeInt(input.remaining) - normalizeSpaces(input.spend))
}
