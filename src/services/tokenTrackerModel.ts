import type {
  TokenTrackerConfig,
  TokenTrackerSide,
  TokenTrackerSlotId,
  TokenTrackerValue,
  TokenTrackerValueOrigins,
  TokenTrackerValues,
} from '@/types/token-tracker'
import { TOKEN_TRACKER_SLOT_ORDER } from '@/types/token-tracker'
import { isCombatantHidden, isSideAllowed } from '@/services/tokenTrackerPolicy'

/**
 * Modelo puro dos token trackers (plano §5).
 *
 * Aqui mora tudo que dá para testar sem OBR: leitura dos stats de um ator,
 * combinação ficha-local × resumo-do-token, assinatura para cortar redesenho e a
 * decisão de exibir ou não (§7.5).
 */

/**
 * Leitor mínimo de stats. O `StatController` do ator satisfaz esta interface —
 * pedimos só isto em vez da classe inteira para o modelo continuar puro.
 */
export interface TokenTrackerStatReader {
  getCurrent(stat: string): unknown
  getMax(stat: string): unknown
}

interface SlotRule {
  currentKey: string
  maxKey: string
  /**
   * `true` quando o atual pode passar do máximo sem ser travado: calor estoura a
   * capacidade e a Blindagem costuma não ter máximo nenhum (nasce 0/0).
   */
  allowOverflow?: boolean
}

const SLOT_RULES: Record<TokenTrackerSlotId, SlotRule> = {
  pv: { currentKey: 'hp', maxKey: 'hp' },
  overshield: { currentKey: 'overshield', maxKey: 'overshield', allowOverflow: true },
  /**
   * Calor usa `heatcap` para ATUAL **e** máximo.
   *
   * `heat` é chave legada neste fork: quem escreve calor é
   * `DamageFlow`/`CombatController.ApplyHeat`/`ActivationFlow`, todos em
   * `StatKey.HEATCAP`, e o próprio HUD da ficha mostra
   * `CurrentStats['heatcap'] / MaxStats['heatcap']`. Ler `getCurrent('heat')`
   * devolvia sempre 0 — era o "calor não sincroniza".
   */
  heat: { currentKey: 'heatcap', maxKey: 'heatcap', allowOverflow: true },
  speed: { currentKey: 'speed', maxKey: 'speed' },
  structure: { currentKey: 'structure', maxKey: 'structure' },
  stress: { currentKey: 'stress', maxKey: 'stress' },
}

/**
 * Mapeamento slot → chaves do `StatController`, exposto para diagnóstico.
 *
 * Existe para os logs lerem EXATAMENTE as mesmas chaves que o desenho: calor, por
 * exemplo, é `heat`/`heatcap` — ler `getMax('heat')` devolveria o valor corrente e
 * faria o diagnóstico mentir.
 */
export const TRACKER_STAT_KEYS: Record<TokenTrackerSlotId, { current: string; max: string }> =
  Object.fromEntries(
    Object.entries(SLOT_RULES).map(([slot, rule]) => [
      slot,
      { current: rule.currentKey, max: rule.maxKey },
    ])
  ) as Record<TokenTrackerSlotId, { current: string; max: string }>

/** Inteiro finito, nunca negativo. Qualquer lixo (null, 'abc', NaN) vira 0. */
export function toTrackerInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.trunc(n))
}

function readSlot(reader: TokenTrackerStatReader, rule: SlotRule): TokenTrackerValue {
  const current = toTrackerInt(reader.getCurrent(rule.currentKey))
  const max = toTrackerInt(reader.getMax(rule.maxKey))
  if (!rule.allowOverflow && max > 0) return { current: Math.min(current, max), max }
  return { current, max }
}

/**
 * Lê os 6 valores de um leitor de stats. Sem leitor (ficha ausente nesta janela)
 * devolve objeto vazio — quem chama cai para o resumo do token.
 */
export function readTrackerValuesFromStats(
  reader: TokenTrackerStatReader | null | undefined
): TokenTrackerValues {
  const values: TokenTrackerValues = {}
  if (!reader || typeof reader.getCurrent !== 'function' || typeof reader.getMax !== 'function') {
    return values
  }

  for (const slot of TOKEN_TRACKER_SLOT_ORDER) {
    values[slot] = readSlot(reader, SLOT_RULES[slot])
  }

  return values
}

export interface MergedTrackerValues {
  values: TokenTrackerValues
  origins: TokenTrackerValueOrigins
  /** Há pelo menos um slot desenhável? */
  hasValues: boolean
}

/**
 * Combina o que a janela sabe: a ficha local ganha slot a slot, o resumo do token
 * preenche o que faltar. Slot ausente nas duas fontes simplesmente não existe.
 */
export function mergeTrackerValues(
  local: TokenTrackerValues | null | undefined,
  fromToken: TokenTrackerValues | null | undefined
): MergedTrackerValues {
  const values: TokenTrackerValues = {}
  const origins: TokenTrackerValueOrigins = {}

  for (const slot of TOKEN_TRACKER_SLOT_ORDER) {
    const localValue = local?.[slot]
    if (localValue) {
      values[slot] = localValue
      origins[slot] = 'sheet'
      continue
    }
    const tokenValue = fromToken?.[slot]
    if (tokenValue) {
      values[slot] = tokenValue
      origins[slot] = 'token'
    }
  }

  return { values, origins, hasValues: Object.keys(values).length > 0 }
}

/**
 * Assinatura do que está desenhado: valores + as opções que mudam o desenho.
 * Igualdade aqui significa "não precisa tocar nos itens".
 */
export function buildTrackerSignature(
  values: TokenTrackerValues,
  config: TokenTrackerConfig
): string {
  const slots = TOKEN_TRACKER_SLOT_ORDER.map(slot => {
    const value = values[slot]
    return value ? `${slot}:${value.current}/${value.max}` : `${slot}:-`
  })

  const slotFlags = TOKEN_TRACKER_SLOT_ORDER.map(slot => (config.slots[slot] === false ? '0' : '1'))
  const options = [
    config.enabled ? 1 : 0,
    config.invertSquares ? 1 : 0,
    config.maxSquares,
    config.panelGap,
    config.showBlindagemWhenZero ? 1 : 0,
  ]

  return [...slots, `|${options.join(',')}`, `|${slotFlags.join('')}`].join(' ')
}

/** Por que (não) o painel deste token é desenhado nesta janela. */
export type TokenTrackerRenderReason =
  | 'ok'
  | 'disabled'
  | 'not-tracked'
  | 'hidden-from-players'
  | 'side-blocked'
  | 'no-data'

export interface TokenRenderInput {
  /** Papel desta janela. */
  role: 'GM' | 'PLAYER'
  /** Lado do combatente; `unknown` quando a janela não conhece o encontro. */
  side: TokenTrackerSide | 'unknown'
  /** `hiddenFromPlayers` do combatente no encontro do GM. */
  hiddenFromPlayers?: boolean
  /** `combatantId` do vínculo do token, usado contra a lista de ocultos. */
  combatantId?: string | null
  /** Está na watchlist efetiva desta janela? (§7.4) */
  isTracked: boolean
  /** Existe valor desenhável (ficha local ou resumo do token)? */
  hasValues: boolean
  config: TokenTrackerConfig
}

export interface TokenRenderDecision {
  render: boolean
  reason: TokenTrackerRenderReason
}

/**
 * Decide se o painel deste token aparece nesta janela (plano §7.5).
 *
 * Ordem importa: desligado → fora da watchlist → (para jogador) oculto → lado
 * bloqueado na política → sem dados. O GM passa por cima da política de lado e do
 * Fog of War, mas continua respeitando o desligamento global e a watchlist — ele
 * também precisa poder mutar um token.
 */
export function evaluateTokenRender(input: TokenRenderInput): TokenRenderDecision {
  if (!input.config.enabled) return { render: false, reason: 'disabled' }
  if (!input.isTracked) return { render: false, reason: 'not-tracked' }

  if (input.role !== 'GM') {
    const hidden = isCombatantHidden(
      input.combatantId,
      input.hiddenFromPlayers,
      input.config.playerVisibility
    )
    if (hidden) return { render: false, reason: 'hidden-from-players' }
    if (!isSideAllowed(input.side, input.config.playerVisibility)) {
      return { render: false, reason: 'side-blocked' }
    }
  }

  if (!input.hasValues) return { render: false, reason: 'no-data' }

  return { render: true, reason: 'ok' }
}

/** Atalho booleano para quem não precisa do motivo. */
export function canRenderToken(input: TokenRenderInput): boolean {
  return evaluateTokenRender(input).render
}

/////////////////////////////////////////////////////////////////////
// Vínculo do token → ficha (puro)
/////////////////////////////////////////////////////////////////////

export interface TokenTrackerBinding {
  sheetType?: string
  sheetId: string
  mechId?: string
  combatantId?: string
}

/**
 * Lê o vínculo do metadata do token. Devolve `null` quando não há `sheetId` — um
 * token sem vínculo não tem tracker nenhum, e o serviço limpa o que sobrou.
 */
export function bindingFromMetadata(metadata: unknown): TokenTrackerBinding | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const raw = metadata as Record<string, unknown>

  const sheetId = typeof raw.sheetId === 'string' ? raw.sheetId.trim() : ''
  if (!sheetId) return null

  const binding: TokenTrackerBinding = { sheetId }
  if (typeof raw.sheetType === 'string' && raw.sheetType) binding.sheetType = raw.sheetType
  if (typeof raw.mechId === 'string' && raw.mechId) binding.mechId = raw.mechId
  if (typeof raw.combatantId === 'string' && raw.combatantId) binding.combatantId = raw.combatantId
  return binding
}

/**
 * Ids pelos quais um combatente pode ser reconhecido.
 *
 * Aceita o objeto VIVO (classes do app, `ID`/`OriginId`) e o registro
 * SERIALIZADO (`id`/`originId`, chaves minúsculas), porque os dois formatos
 * chegam até aqui — mesma tolerância do `npcSheetLookup`.
 */
export function combatantSheetIds(combatant: unknown): string[] {
  if (!combatant || typeof combatant !== 'object') return []
  const entry = combatant as Record<string, any>
  const actor = entry.actor ?? entry.npc ?? {}

  return [
    entry.id,
    entry.ID,
    actor.ID,
    actor.id,
    actor.OriginId,
    actor.originId,
    actor.ActiveMech?.ID,
    actor.ActiveMech?.id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
}

/** O combatente corresponde ao vínculo do token por qualquer um dos seus ids? */
export function combatantMatchesBinding(combatant: unknown, binding: TokenTrackerBinding): boolean {
  const wanted = [binding.combatantId, binding.sheetId, binding.mechId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
  if (!wanted.length) return false
  const candidates = combatantSheetIds(combatant)
  return wanted.some(id => candidates.includes(id))
}

/**
 * Uma ficha do modo ativo (`PilotSheet`) corresponde ao vínculo do token?
 *
 * O vínculo guarda o id do PILOTO, mas a ficha ativa também é indexada por
 * `PilotSheet.ID`/`PilotID` e traz o combatente com o ator dentro: qualquer um
 * deles serve. Fichas do modo ativo vivem em `pilot_sheets`, NÃO em `pilots` — um
 * GM que só abriu a ficha na mesa tem tudo lá e nada no Hangar.
 */
export function sheetMatchesBinding(sheet: unknown, binding: TokenTrackerBinding): boolean {
  if (!sheet || typeof sheet !== 'object') return false
  const entry = sheet as Record<string, any>
  const wanted = [binding.sheetId, binding.mechId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
  if (!wanted.length) return false

  const actor = entry.Combatant?.actor ?? entry.Pilot
  const candidates = [
    entry.ID,
    entry.Id,
    entry.PilotID,
    entry.Pilot?.ID,
    entry.Combatant?.id,
    actor?.ID,
    actor?.OriginId,
    actor?.ActiveMech?.ID,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return wanted.some(id => candidates.includes(id))
}

/**
 * Algum slot tem número de verdade?
 *
 * Serve para escolher ENTRE fontes locais: um mecha do Hangar (fora de combate) tem
 * o `StatController` zerado e devolveria `0/0` em tudo, ganhando de uma ficha ativa
 * com os valores reais do combate. `max > 0` já basta para separar os dois casos.
 */
export function hasAnyTrackerValue(values: TokenTrackerValues | null | undefined): boolean {
  if (!values) return false
  for (const slot of TOKEN_TRACKER_SLOT_ORDER) {
    const value = values[slot]
    if (!value) continue
    if (value.current > 0 || value.max > 0) return true
  }
  return false
}

/** Que tipo de ficha o vínculo aponta. Decide DE ONDE vêm os stats. */
export type TokenTrackerSheetKind = 'mech' | 'pilot' | 'npc'

/**
 * O vínculo é de mecha, de piloto a pé ou de NPC?
 *
 * A regra é declarada, não adivinhada: com `mechId` no vínculo é ficha de MECHA
 * (PV, calor, estrutura e estresse são stats de mecha); sem ele, o vínculo é do
 * próprio piloto. `sheetType: 'npc'` manda para a ficha de NPC.
 */
export function sheetKindForBinding(binding: TokenTrackerBinding): TokenTrackerSheetKind {
  if (binding.sheetType === 'npc') return 'npc'
  return binding.mechId ? 'mech' : 'pilot'
}

/**
 * Quantos stats estão de fato preenchidos nesta fonte.
 *
 * Existe porque "tem algum valor" não separa ficha viva de ficha pela metade: o
 * mecha do Hangar (`PilotStore`) pode ter PV e estrutura e **zero de estresse**,
 * porque quem chama `SetStats()` é a cópia do modo ativo (`PilotSheet.FromPilot`
 * faz `Pilot.Deserialize(Serialize(pilot))` + `SetStats()`). Comparar a PONTUAÇÃO
 * escolhe a fonte mais completa em vez da primeira que não está vazia.
 *
 * Máximo conhecido vale 2 (é o sinal forte de ficha inicializada); valor corrente
 * isolado vale 1 (Blindagem costuma não ter máximo).
 */
export function scoreTrackerValues(values: TokenTrackerValues | null | undefined): number {
  if (!values) return 0
  let score = 0
  for (const slot of TOKEN_TRACKER_SLOT_ORDER) {
    const value = values[slot]
    if (!value) continue
    if (value.max > 0) score += 2
    else if (value.current > 0) score += 1
  }
  return score
}

/**
 * O `StatController` certo de um ator/combatente.
 *
 * Detalhe que já custou caro: para combatente de PILOTO, `combatant.actor` é o
 * `Pilot` — e o `StatController` do piloto não tem calor, estrutura nem estresse de
 * mecha. Os valores que o painel mostra são do MECHA (`actor.ActiveMech`); escolher
 * o piloto desenhava o PV dele e o resto zerado.
 */
export function statReaderForActor(
  actor: unknown,
  binding: TokenTrackerBinding
): { reader: TokenTrackerStatReader | null; source: string } {
  const entry = actor as { ActiveMech?: any; Mechs?: any[]; CombatController?: any } | null
  const mechs = [entry?.ActiveMech, ...(entry?.Mechs ?? [])].filter(Boolean)

  const mech = binding.mechId
    ? mechs.find(candidate => candidate?.ID === binding.mechId)
    : entry?.ActiveMech

  if (mech) {
    return {
      reader: statReaderOf(mech),
      source: binding.mechId && mech.ID === binding.mechId ? 'mecha por mechId' : 'mecha ativo',
    }
  }

  return { reader: statReaderOf(actor), source: 'ator (sem mecha)' }
}

/** O `StatController` do ator, quando ele expõe um. */
export function statReaderOf(actor: unknown): TokenTrackerStatReader | null {
  const controller = (actor as { CombatController?: { StatController?: unknown } } | null)
    ?.CombatController?.StatController
  if (!controller || typeof controller !== 'object') return null
  return controller as TokenTrackerStatReader
}

/**
 * Lado do combatente do ponto de vista de um JOGADOR.
 *
 * O encontro ativo não é sincronizado entre GM e jogadores; o que chega é o
 * snapshot de iniciativa (`trackerSyncService`), que já traz `side` por card e
 * omite quem o GM marcou como oculto. Sem card correspondente, o lado é
 * desconhecido e a política trata como neutro.
 */
export function sideFromCards(
  cards: unknown,
  binding: TokenTrackerBinding
): TokenTrackerSide | 'unknown' {
  if (!binding.combatantId || !Array.isArray(cards)) return 'unknown'
  const card = (cards as Array<Record<string, unknown>>).find(
    entry => entry && entry.id === binding.combatantId
  )
  if (!card) return 'unknown'
  return card.side === 'ally' || card.side === 'enemy' || card.side === 'neutral'
    ? card.side
    : 'unknown'
}
