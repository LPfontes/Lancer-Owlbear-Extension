import { DamageRollResult, DiceRoller, DieSet } from '@/classes/dice/DiceRoller'
import { dddiceService, type DddiceDie, type DddiceRollValue } from '@/services/dddiceService'

export interface DamageRollRow {
  formula: string
}

export interface DamageRollOptions {
  label?: string
  isCrit?: boolean
  overkill?: boolean
  reliable?: number
}

export interface DamageRollOutcome {
  formula: string
  total: number
  breakdown: string
  overkillRerolls: number
}

const VALID_DIE_TYPES = [4, 6, 8, 10, 12, 20, 100]

/**
 * Redução do dado físico para d3: o serviço de dados 3D não tem d3, então rolamos
 * um d4 e reduzimos pela tabela `1→1, 2→2, 3→2, 4→3`.
 */
export const D3_REDUCTION_TABLE: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 3 }

/** Aplica a redução de um d3 (ou d2) lido de um dado físico maior. */
export function reducePhysicalDie(dieType: number, value: number): number {
  if (dieType === 3) return D3_REDUCTION_TABLE[value] ?? Math.min(value, 3)
  if (dieType === 2) return Math.ceil(value / 2)
  return value
}

/**
 * Retira do pool do serviço de dados 3D o dado correspondente ao tipo lógico
 * (d3/d2 são pedidos como d4). Devolve `undefined` quando o pool acabou — aí o
 * chamador rola o dado nativo localmente.
 */
export function takeDddiceValue(
  pool: DddiceRollValue[],
  dieType: number
): number | undefined {
  const targetType = `d${dieType <= 3 ? 4 : dieType}`
  const dieIdx = pool.findIndex(d => String(d.type || '').toLowerCase() === targetType)

  if (dieIdx !== -1 && typeof pool[dieIdx].value !== 'undefined') {
    return Number(pool.splice(dieIdx, 1)[0].value)
  }
  if (pool.length > 0 && typeof pool[0].value !== 'undefined') {
    return Number((pool.shift() as DddiceRollValue).value)
  }
  return undefined
}

/**
 * Monta a lista de dados 3D a partir das fórmulas.
 * d3/d2 são pedidos como d4 (o serviço aplica o ajuste); crítico dobra a quantidade.
 */
export function buildDiceFromFormulas(
  rows: DamageRollRow[],
  isCrit = false
): { dice: DddiceDie[]; flatBonus: number } {
  const dice: DddiceDie[] = []
  let flatBonus = 0

  rows.forEach(row => {
    const parsed = DiceRoller.parseDiceString(row.formula)
    if (!parsed) return
    if (parsed.modifier) flatBonus += parsed.modifier
    parsed.dice.forEach(dieSet => {
      let sides = dieSet.type
      if (sides <= 3) sides = 4
      if (!VALID_DIE_TYPES.includes(sides)) sides = 6

      const quantity = isCrit ? dieSet.quantity * 2 : dieSet.quantity
      for (let i = 0; i < quantity; i++) dice.push({ type: `d${sides}` })
    })
  })

  return { dice, flatBonus }
}

/** Consome os valores devolvidos pelo serviço de dados 3D e fecha a conta de cada linha. */
export function applyDddiceValues(
  rows: DamageRollRow[],
  values: DddiceRollValue[],
  options: DamageRollOptions = {}
): DamageRollOutcome[] {
  const pool = values.filter(v => String(v.type || '').toLowerCase().startsWith('d'))

  return rows.map(row => {
    const parsed = DiceRoller.parseDiceString(row.formula)

    if (!parsed || !parsed.dice.length) {
      const total = Number(row.formula) || 0
      return { formula: row.formula, total, breakdown: String(total), overkillRerolls: 0 }
    }

    const rawRolls: number[] = []
    const rollClass: string[] = []
    let overkillRerolls = 0
    let total = parsed.modifier

    parsed.dice.forEach(dieSet => {
      const neededCount = options.isCrit ? dieSet.quantity * 2 : dieSet.quantity
      const rolls: number[] = []

      for (let i = 0; i < neededCount; i++) {
        const physical = takeDddiceValue(pool, dieSet.type)
        const rollVal =
          physical === undefined
            ? DiceRoller.rollDie(dieSet.type)
            : reducePhysicalDie(dieSet.type, physical)
        rolls.push(rollVal)
      }

      if (options.overkill) rolls.forEach(r => (r === 1 ? overkillRerolls++ : null))

      rawRolls.push(...rolls)
      const keptSet = options.isCrit ? new DieSet(dieSet.quantity, dieSet.type) : dieSet
      const cls = DiceRoller.classifyDamageRolls(keptSet, rolls, options.overkill)
      rollClass.push(...cls)

      rolls.forEach((r, idx) => {
        if (cls[idx] !== 'low') total += r
      })
    })

    if (options.reliable && total < options.reliable) total = options.reliable

    const result = new DamageRollResult(
      row.formula,
      total,
      rawRolls,
      rollClass,
      parsed.modifier,
      overkillRerolls,
      !!options.isCrit,
      false
    )

    return { formula: row.formula, total, breakdown: result.toString(), overkillRerolls }
  })
}

/** Rolagem local — usada apenas quando não há serviço de dados 3D disponível. */
export function rollRowsLocally(
  rows: DamageRollRow[],
  options: DamageRollOptions = {}
): DamageRollOutcome[] {
  return rows.map(row => {
    if (!row.formula.includes('d')) {
      const total = Number(row.formula) || 0
      return { formula: row.formula, total, breakdown: String(total), overkillRerolls: 0 }
    }

    const rolled: any = DiceRoller.rollDamage(
      row.formula,
      options.isCrit,
      options.overkill,
      options.reliable
    )
    const total = Number(rolled?.total) || 0
    return {
      formula: row.formula,
      total,
      breakdown: typeof rolled?.toString === 'function' ? rolled.toString() : String(total),
      overkillRerolls: Number(rolled?.overkillRerolls || rolled?.overkillHeat || 0),
    }
  })
}

/**
 * Regra padrão de rolagem de dano do app: **espera o serviço de dados 3D e usa os
 * valores dele**; a rolagem local (`DiceRoller`) só acontece quando o serviço está
 * desabilitado/indisponível ou não devolve valores.
 */
export async function rollDamageRows(
  rows: DamageRollRow[],
  options: DamageRollOptions = {}
): Promise<DamageRollOutcome[]> {
  if (!rows.length) return []

  const { dice, flatBonus } = buildDiceFromFormulas(rows, options.isCrit)

  if (dice.length) {
    const rollData = await dddiceService.rollDice({
      dice,
      flatBonus,
      label: options.label,
    })

    if (rollData && rollData.values && rollData.values.length > 0) {
      return applyDddiceValues(rows, rollData.values, options)
    }
  }

  return rollRowsLocally(rows, options)
}
