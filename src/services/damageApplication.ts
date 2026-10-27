/**
 * Aplicação de dano a um integrante do encontro (regras de LANCER) e o delta para a mesa.
 *
 * As REGRAS vivem no domínio (`CombatController.CalculateDamage`/`TakeDamage`, com
 * `DamageCalculationFlow`, `HeatFlow` e `ResolveBurn`): ARMOR, resistência/imunidade,
 * perfurante (AP), irredutível, overshield, estrutura/estresse e meltdown. Aqui só
 * resolvemos o alvo, montamos a entrada, aplicamos e traduzimos o que mudou em
 * `PATCH_FIELD` — é essa tradução que faz o dano chegar na ficha que o jogador vê.
 *
 * Decisões deste fork:
 * - **Só o Mestre aplica dano pelo tracker** (`publishDamageReport` recusa outra role).
 * - **Queimadura empilha o status E aplica o dano** (`AppliedBurn` existe para não
 *   incrementar a pilha de novo).
 * - **Piloto desmontado tem ficha própria**: o dano vai no `StatController` do piloto e
 *   não herda ARMOR/overshield do mecha — o alvo é resolvido pelo próprio domínio
 *   (`resolveTarget`) e os deltas saem no caminho do ator, não em `mechs.<i>.…`.
 */
import { DamageType } from '@/classes/enums'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import type { IDamageResult } from '@/classes/components/combat/flows/DamageFlow'
import { isGmClient } from '@/services/obrRuntime'
import { activeMechIndex, mechStatsPath, pilotStatsPath } from '@/services/sheetSyncPaths'

export interface DamageInput {
  type: DamageType
  /** Valor JÁ rolado (o tracker resolve os dados antes de chamar). */
  value: number
  /** Perfurante: ignora ARMOR. */
  ap?: boolean
  /** Irredutível: ignora ARMOR e resistência. */
  irreducible?: boolean
  /** "Metade do dano", aplicado antes das regras. */
  half?: boolean
  /** Dano direto (resolve o alvo sem cobertura/escudo). */
  direct?: boolean
  /** Pilha de BURN a somar — e o dano de queimadura correspondente. */
  burn?: number
  source?: string
  eventId?: string
}

export interface DamageDelta {
  field: string
  value: number
  previous?: number
}

export type DamageCondition = 'nominal' | 'resistance' | 'immunity' | 'vulnerable' | string

export interface DamageReport {
  eventId: string
  characterId: string
  characterType: 'pilot' | 'npc'
  type: DamageType
  /** Valor de entrada (já com `half`). */
  incoming: number
  armorReduced: number
  resisted: number
  condition: DamageCondition
  /** Dano que passou pelas regras. */
  final: number
  taken: number
  destroyed: boolean
  meltdown: boolean
  /** Pilha de BURN que ficou no alvo (`null` quando não se aplica). */
  burn: number | null
  /** Estatísticas alteradas, prontas para `PATCH_FIELD`. */
  deltas: DamageDelta[]
}

/** `half` entra antes de qualquer regra (mesma conta do menu do Mestre). */
function incomingValue(input: DamageInput): number {
  const value = Number(input.value) || 0
  return input.half ? Math.ceil(value / 2) : value
}

function statsSnapshot(controller: any): Record<string, number> {
  const current = controller?.StatController?.CurrentStats
  return current && typeof current === 'object' ? { ...current } : {}
}

function statDeltas(
  before: Record<string, number>,
  after: Record<string, number>,
  pathFor: (stat: string) => string
): DamageDelta[] {
  const out: DamageDelta[] = []
  for (const [stat, value] of Object.entries(after)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (before[stat] === value) continue
    out.push({ field: pathFor(stat), value, previous: before[stat] })
  }
  return out
}

function characterTypeOf(combatant: any): 'pilot' | 'npc' {
  return combatant?.type === 'pilot' ? 'pilot' : 'npc'
}

/**
 * Prévia do dano, sem tocar em nada — é o que a UI mostra antes de aplicar
 * ("12 → 8 · ARMOR 2 · resistência a Kinetic").
 */
export function previewDamage(combatant: any, input: DamageInput): DamageReport | null {
  const actor = combatant?.actor
  const cc = actor?.CombatController
  if (!cc || !input?.type) return null

  const incoming = incomingValue(input)
  const calc: IDamageResult = cc.CalculateDamage(
    input.type,
    incoming,
    !!input.ap,
    !!input.irreducible,
    !!input.direct
  )

  // O resultado público do cálculo não carrega a parcela absorvida pela ARMOR (ela vive no
  // estado do fluxo), então pedimos essa parte explicitamente para a UI mostrar "ARMOR −2".
  let armorReduced = Number((calc as any)?.armorReduction) || 0
  if (!armorReduced) {
    armorReduced =
      Number(
        cc.DamageController?.CalculateArmorReduction?.(
          input.type,
          incoming,
          !!input.ap,
          !!input.irreducible,
          !!input.direct
        )
      ) || 0
  }

  const resistList: string[] = Array.isArray(calc?.resist) ? calc.resist : []
  const conditionList: string[] = Array.isArray(calc?.condition) ? calc.condition : []

  let condition: DamageCondition = 'nominal'
  if (resistList.includes('immunity')) {
    condition = 'immunity'
  } else if (resistList.includes('vulnerable')) {
    condition = 'vulnerable'
  } else if (resistList.includes('resistance')) {
    condition = 'resistance'
  } else if (conditionList.length > 0) {
    condition = conditionList[0]
  }

  const finalDamage = Number(calc?.total) || 0
  const postArmor = Math.max(0, incoming - armorReduced)

  let resisted = 0
  if (condition === 'immunity') {
    resisted = postArmor
  } else if (condition === 'resistance') {
    resisted = Math.max(0, postArmor - finalDamage)
  }

  return {
    eventId: input.eventId || crypto.randomUUID(),
    characterId: actor.ID,
    characterType: characterTypeOf(combatant),
    type: input.type,
    incoming,
    armorReduced,
    resisted,
    condition,
    final: finalDamage,
    taken: calc?.tookDamage ? finalDamage : 0,
    destroyed: !!cc.IsDestroyed,
    meltdown: !!cc.ReactorDestroyed,
    burn: null,
    deltas: [],
  }
}

/**
 * Aplica o dano no alvo (a cópia viva que esta janela tem) e devolve o relatório com os
 * deltas a publicar. Quem chama decide se publica (`publishDamageReport`).
 */
export function applyDamageToCombatant(combatant: any, input: DamageInput): DamageReport | null {
  const actor = combatant?.actor
  const cc = actor?.CombatController
  if (!cc || !input?.type) return null

  const report = previewDamage(combatant, input)
  if (!report) return null

  const mechIndex = activeMechIndex(actor)
  const mech = mechIndex >= 0 ? actor.Mechs[mechIndex] : null
  const mechCc = mech?.CombatController ?? null

  const beforePilot = statsSnapshot(cc)
  const beforeMech = statsSnapshot(mechCc)

  cc.TakeDamage(input.type, report.incoming, !!input.ap, !!input.irreducible, !!input.direct)

  // Quem levou o dano: o mecha montado ou o piloto. O domínio decide internamente
  // (`resolveTarget`); descobrimos pelo que MUDOU e, quando nada muda (imunidade), pela
  // regra de montagem.
  const mechChanged =
    !!mechCc && JSON.stringify(beforeMech) !== JSON.stringify(statsSnapshot(mechCc))
  const target = mechChanged || (mechCc && cc.Mounted) ? mechCc : cc

  // Queimadura: empilha o status e aplica o dano imediato (o tipo `AppliedBurn` não
  // incrementa a pilha de novo).
  let burn: number | null = null
  if (Number(input.burn) > 0) {
    const statController = target.StatController
    const current = Number(statController.getCurrent(StatKey.BURN)) || 0
    statController.setCurrentStat(StatKey.BURN, current + Number(input.burn), { silent: true })
    target.TakeDamage(DamageType.AppliedBurn, Number(input.burn))
    burn = Number(statController.getCurrent(StatKey.BURN)) || 0
  }

  const deltas = [
    // Piloto desmontado: ficha própria, caminho do ator (`stats.current.hp`).
    ...statDeltas(beforePilot, statsSnapshot(cc), pilotStatsPath),
    ...(mechCc
      ? statDeltas(beforeMech, statsSnapshot(mechCc), stat => mechStatsPath(mechIndex, stat))
      : []),
  ]

  return {
    ...report,
    destroyed: !!cc.IsDestroyed,
    meltdown: !!cc.ReactorDestroyed,
    burn,
    deltas,
  }
}

/**
 * Publica o resultado na mesa: um `PATCH_FIELD` por stat alterado, todos na MESMA versão
 * (`versão da sala + 1`), para o servidor aplicar em bloco e descartar patch atrasado.
 *
 * Somente o Mestre: o jogador não aplica dano em outro combatente pelo tracker.
 */
export async function publishDamageReport(report: DamageReport | null): Promise<boolean> {
  if (!report) return false

  if (!isGmClient()) {
    console.warn('[DamageApplication] Somente o Mestre aplica dano pelo tracker.')
    return false
  }

  if (!report.deltas.length) return false

  // Import tardio: este módulo é de REGRA e não precisa arrastar o socket (que puxa
  // meia aplicação) para quem só quer calcular/prever o dano.
  const { roomSyncedSheets, tableSyncSocket } = await import('@/services/tableSyncSocket')

  const version = Number(roomSyncedSheets.value?.[report.characterId]?.version ?? 0) + 1

  for (const delta of report.deltas) {
    tableSyncSocket.sendPatchField(
      report.characterId,
      report.characterType,
      delta.field,
      delta.value,
      version
    )
  }

  return true
}
