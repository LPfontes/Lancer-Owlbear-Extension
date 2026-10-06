import { describe, expect, it } from 'vitest'
import {
  bindingFromMetadata,
  buildTrackerSignature,
  canRenderToken,
  combatantMatchesBinding,
  combatantSheetIds,
  evaluateTokenRender,
  hasAnyTrackerValue,
  mergeTrackerValues,
  readTrackerValuesFromStats,
  scoreTrackerValues,
  sheetKindForBinding,
  sheetMatchesBinding,
  sideFromCards,
  statReaderForActor,
  toTrackerInt,
  type TokenRenderInput,
  type TokenTrackerStatReader,
} from '@/services/tokenTrackerModel'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  type TokenTrackerConfig,
  type TokenTrackerValues,
} from '@/types/token-tracker'

/** Leitor de stats fake: só o que o StatController expõe. */
function reader(stats: Record<string, number>): TokenTrackerStatReader {
  return {
    getCurrent: (key: string) => stats[key],
    getMax: (key: string) => stats[key],
  }
}

/** Leitor fiel ao StatController: atual e máximo são dicionários separados. */
function reader2(current: Record<string, unknown>, max: Record<string, unknown>): TokenTrackerStatReader {
  return {
    getCurrent: (key: string) => current[key],
    getMax: (key: string) => max[key],
  }
}

/** Leitor com o cap do turno (`CombatController.BoostedSpeed`) exposto. */
function withBoostedSpeed(reader: TokenTrackerStatReader, boostedSpeed: unknown): TokenTrackerStatReader {
  return { ...reader, getBoostedSpeed: () => boostedSpeed }
}

function config(patch: Partial<TokenTrackerConfig> = {}): TokenTrackerConfig {
  return { ...DEFAULT_TOKEN_TRACKER_CONFIG, ...patch }
}

function renderInput(patch: Partial<TokenRenderInput> = {}): TokenRenderInput {
  return {
    role: 'PLAYER',
    side: 'ally',
    hiddenFromPlayers: false,
    combatantId: null,
    isTracked: true,
    hasValues: true,
    config: config(),
    ...patch,
  }
}

describe('toTrackerInt', () => {
  it('trunca, nunca devolve negativo e trata lixo como zero', () => {
    expect(toTrackerInt(7.9)).toBe(7)
    expect(toTrackerInt(-3)).toBe(0)
    expect(toTrackerInt('12')).toBe(12)
    expect(toTrackerInt('abc')).toBe(0)
    expect(toTrackerInt(null)).toBe(0)
    expect(toTrackerInt(undefined)).toBe(0)
    expect(toTrackerInt(Number.NaN)).toBe(0)
    expect(toTrackerInt(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('readTrackerValuesFromStats', () => {
  it('lê os seis slots do mecha pelo StatController', () => {
    const values = readTrackerValuesFromStats(
      reader2(
        { hp: 12, overshield: 4, heatcap: 3, speed: 4, structure: 2, stress: 1 },
        { hp: 20, overshield: 6, heatcap: 8, speed: 6, structure: 4, stress: 4 }
      )
    )

    expect(values.pv).toEqual({ current: 12, max: 20 })
    expect(values.overshield).toEqual({ current: 4, max: 6 })
    expect(values.heat).toEqual({ current: 3, max: 8 })
    expect(values.speed).toEqual({ current: 4, max: 6 })
    expect(values.structure).toEqual({ current: 2, max: 4 })
    expect(values.stress).toEqual({ current: 1, max: 4 })
  })

  it('lê o CALOR de heatcap (atual e máximo), nunca da chave legada heat', () => {
    // `heat` é legado neste fork: quem escreve calor é DamageFlow/ApplyHeat/overcharge,
    // todos em `heatcap`. Se um dia alguém repuser valor em `heat`, ele é ignorado de
    // propósito — é o que o app inteiro faz.
    const values = readTrackerValuesFromStats(
      reader2({ heat: 99, heatcap: 3 }, { heat: 99, heatcap: 12 })
    )
    expect(values.heat).toEqual({ current: 3, max: 12 })
  })

  it('não perde o calor quando só a chave heatcap tem valor', () => {
    const values = readTrackerValuesFromStats(reader2({ heatcap: 3 }, { heatcap: 5 }))
    expect(values.heat).toEqual({ current: 3, max: 5 })
  })

  it('deixa o calor estourar a capacidade em vez de travar no máximo', () => {
    const values = readTrackerValuesFromStats(reader2({ heatcap: 9 }, { heatcap: 4 }))
    expect(values.heat).toEqual({ current: 9, max: 4 })
  })

  it('não trava a Blindagem no máximo zero (mecha nasce com overshield 0/0)', () => {
    const values = readTrackerValuesFromStats(reader2({ overshield: 0 }, { overshield: 0 }))
    expect(values.overshield).toEqual({ current: 0, max: 0 })

    const shielded = readTrackerValuesFromStats(reader2({ overshield: 5 }, { overshield: 0 }))
    expect(shielded.overshield).toEqual({ current: 5, max: 0 })
  })

  it('trava PV, Estrutura, Estresse e Movimento no máximo', () => {
    const values = readTrackerValuesFromStats(
      reader2(
        { hp: 30, structure: 9, stress: 9, speed: 12 },
        { hp: 20, structure: 4, stress: 4, speed: 6 }
      )
    )
    expect(values.pv).toEqual({ current: 20, max: 20 })
    expect(values.structure).toEqual({ current: 4, max: 4 })
    expect(values.stress).toEqual({ current: 4, max: 4 })
    expect(values.speed).toEqual({ current: 6, max: 6 })
  })

  it('o máximo do Movimento é o cap do turno com Boost, não getMax(speed)', () => {
    // Depois de um Boost de 5 num mecha speed 5: restante 10 e cap 10 (não 5/5).
    const boosted = withBoostedSpeed(reader2({ speed: 10 }, { speed: 5 }), 10)
    expect(readTrackerValuesFromStats(boosted).speed).toEqual({ current: 10, max: 10 })

    // Antes do Boost os dois coincidem.
    const semBoost = withBoostedSpeed(reader2({ speed: 4 }, { speed: 5 }), 5)
    expect(readTrackerValuesFromStats(semBoost).speed).toEqual({ current: 4, max: 5 })

    // Sem `getBoostedSpeed` (leitor simples), cai no getMax(speed) de sempre.
    expect(readTrackerValuesFromStats(reader2({ speed: 4 }, { speed: 5 })).speed).toEqual({
      current: 4,
      max: 5,
    })
  })

  it('Movimento é clampado no cap (restante não passa do turno)', () => {
    const values = readTrackerValuesFromStats(withBoostedSpeed(reader2({ speed: 99 }, { speed: 5 }), 10))
    expect(values.speed).toEqual({ current: 10, max: 10 })
  })

  it('não trava quando o máximo é desconhecido (0)', () => {
    const values = readTrackerValuesFromStats(reader2({ hp: 7 }, { hp: 0 }))
    expect(values.pv).toEqual({ current: 7, max: 0 })
  })

  it('normaliza lixo vindo dos stats', () => {
    const values = readTrackerValuesFromStats(
      reader2({ hp: 'nope', structure: -4, stress: 2.7 }, { hp: null, structure: 4, stress: 4 })
    )
    expect(values.pv).toEqual({ current: 0, max: 0 })
    expect(values.structure).toEqual({ current: 0, max: 4 })
    expect(values.stress).toEqual({ current: 2, max: 4 })
  })

  it('devolve vazio quando não há ficha nesta janela', () => {
    expect(readTrackerValuesFromStats(null)).toEqual({})
    expect(readTrackerValuesFromStats(undefined)).toEqual({})
    expect(readTrackerValuesFromStats({} as TokenTrackerStatReader)).toEqual({})
  })
})

describe('mergeTrackerValues', () => {
  const local: TokenTrackerValues = {
    pv: { current: 10, max: 20 },
    structure: { current: 3, max: 4 },
  }
  const fromToken: TokenTrackerValues = {
    pv: { current: 1, max: 2 },
    heat: { current: 3, max: 8 },
    stress: { current: 4, max: 4 },
  }

  it('a ficha local ganha do resumo, slot a slot', () => {
    const merged = mergeTrackerValues(local, fromToken)
    expect(merged.values.pv).toEqual({ current: 10, max: 20 })
    expect(merged.origins.pv).toBe('sheet')
  })

  it('o resumo preenche só o que a ficha local não tem', () => {
    const merged = mergeTrackerValues(local, fromToken)
    expect(merged.values.heat).toEqual({ current: 3, max: 8 })
    expect(merged.origins.heat).toBe('token')
    expect(merged.values.stress).toEqual({ current: 4, max: 4 })
    expect(merged.values.overshield).toBeUndefined()
  })

  it('sinaliza quando não há nada desenhável', () => {
    expect(mergeTrackerValues(null, null).hasValues).toBe(false)
    expect(mergeTrackerValues({}, {}).hasValues).toBe(false)
    expect(mergeTrackerValues(local, null).hasValues).toBe(true)
    expect(mergeTrackerValues(null, fromToken).hasValues).toBe(true)
  })
})

describe('buildTrackerSignature', () => {
  const values: TokenTrackerValues = {
    pv: { current: 10, max: 20 },
    structure: { current: 3, max: 4 },
  }

  it('é estável para a mesma entrada', () => {
    expect(buildTrackerSignature(values, config())).toBe(buildTrackerSignature(values, config()))
  })

  it('muda quando um valor muda', () => {
    const other: TokenTrackerValues = { ...values, pv: { current: 11, max: 20 } }
    expect(buildTrackerSignature(other, config())).not.toBe(buildTrackerSignature(values, config()))
  })

  it('muda quando o conjunto de slots muda (mesmo com valores iguais)', () => {
    expect(buildTrackerSignature(values, config())).not.toBe(
      buildTrackerSignature(values, config({ maxSquares: 6 }))
    )
  })

  it('muda com as opções que afetam o desenho', () => {
    const base = buildTrackerSignature(values, config())
    expect(buildTrackerSignature(values, config({ invertSquares: true }))).not.toBe(base)
    expect(buildTrackerSignature(values, config({ showBlindagemWhenZero: true }))).not.toBe(base)
    expect(buildTrackerSignature(values, config({ showBlindagemWhenZero: true }))).not.toBe(base)
    expect(buildTrackerSignature(values, config({ enabled: false }))).not.toBe(base)
    expect(buildTrackerSignature(values, config({ slots: { structure: false } }))).not.toBe(base)
  })
})

describe('evaluateTokenRender — matriz do plano §7.5', () => {
  it('não desenha com os trackers desligados, para ninguém', () => {
    expect(evaluateTokenRender(renderInput({ role: 'GM', config: config({ enabled: false }) }))).toEqual(
      { render: false, reason: 'disabled' }
    )
  })

  it('não desenha token mutado/fora da watchlist — nem para o GM', () => {
    expect(evaluateTokenRender(renderInput({ role: 'GM', isTracked: false }))).toEqual({
      render: false,
      reason: 'not-tracked',
    })
    expect(evaluateTokenRender(renderInput({ role: 'PLAYER', isTracked: false }))).toEqual({
      render: false,
      reason: 'not-tracked',
    })
  })

  it('o GM vê tudo, inclusive inimigo e combatente oculto', () => {
    expect(
      evaluateTokenRender(
        renderInput({ role: 'GM', side: 'enemy', hiddenFromPlayers: true })
      )
    ).toEqual({ render: true, reason: 'ok' })
  })

  it('jogador vê aliado com a política default', () => {
    expect(evaluateTokenRender(renderInput({ side: 'ally' }))).toEqual({ render: true, reason: 'ok' })
  })

  it('jogador NÃO vê inimigo com a política default', () => {
    expect(evaluateTokenRender(renderInput({ side: 'enemy' }))).toEqual({
      render: false,
      reason: 'side-blocked',
    })
  })

  it('jogador vê inimigo quando o GM libera', () => {
    const cfg = config({
      playerVisibility: { allies: true, enemies: true, neutral: true, hiddenCombatantIds: [] },
    })
    expect(evaluateTokenRender(renderInput({ side: 'enemy', config: cfg }))).toEqual({
      render: true,
      reason: 'ok',
    })
  })

  it('neutro e sem lado seguem o balde neutro', () => {
    expect(evaluateTokenRender(renderInput({ side: 'neutral' })).render).toBe(true)
    expect(evaluateTokenRender(renderInput({ side: 'unknown' })).render).toBe(true)

    const cfg = config({
      playerVisibility: { allies: true, enemies: false, neutral: false, hiddenCombatantIds: [] },
    })
    expect(evaluateTokenRender(renderInput({ side: 'neutral', config: cfg }))).toEqual({
      render: false,
      reason: 'side-blocked',
    })
  })

  it('o Fog of War esconde até aliado', () => {
    expect(evaluateTokenRender(renderInput({ side: 'ally', hiddenFromPlayers: true }))).toEqual({
      render: false,
      reason: 'hidden-from-players',
    })
  })

  it('a lista de ocultos da sala esconde pelo combatantId', () => {
    const cfg = config({
      playerVisibility: {
        allies: true,
        enemies: true,
        neutral: true,
        hiddenCombatantIds: ['combatant-2'],
      },
    })
    expect(evaluateTokenRender(renderInput({ combatantId: 'combatant-2', config: cfg }))).toEqual({
      render: false,
      reason: 'hidden-from-players',
    })
    expect(evaluateTokenRender(renderInput({ combatantId: 'combatant-1', config: cfg })).render).toBe(
      true
    )
  })

  it('sem dados desenháveis o motivo é no-data (o token entra como "sem dados aqui")', () => {
    expect(evaluateTokenRender(renderInput({ hasValues: false }))).toEqual({
      render: false,
      reason: 'no-data',
    })
    expect(canRenderToken(renderInput({ hasValues: false }))).toBe(false)
  })

  it('política antes de dados: inimigo bloqueado nem chega a olhar os valores', () => {
    expect(evaluateTokenRender(renderInput({ side: 'enemy', hasValues: false })).reason).toBe(
      'side-blocked'
    )
  })
})

describe('bindingFromMetadata', () => {
  it('lê o vínculo completo', () => {
    expect(
      bindingFromMetadata({
        sheetType: 'pilot',
        sheetId: 'p1',
        mechId: 'm1',
        combatantId: 'c1',
      })
    ).toEqual({ sheetType: 'pilot', sheetId: 'p1', mechId: 'm1', combatantId: 'c1' })
  })

  it('sem sheetId não há vínculo', () => {
    for (const value of [undefined, null, 'nope', 5, [], {}, { sheetType: 'pilot' }, { sheetId: '  ' }]) {
      expect(bindingFromMetadata(value)).toBeNull()
    }
  })

  it('ignora campos opcionais vazios ou de tipo errado', () => {
    expect(bindingFromMetadata({ sheetId: 'p1', mechId: '', combatantId: 7, sheetType: '' })).toEqual({
      sheetId: 'p1',
    })
  })
})

describe('combatantSheetIds / combatantMatchesBinding', () => {
  const liveCombatant = {
    id: 'combatant-1',
    side: 'ally',
    actor: { ID: 'mech-1', OriginId: 'npc-roster-1', ActiveMech: { ID: 'mech-1' } },
  }

  it('junta os ids do ator vivo e do registro serializado', () => {
    expect(combatantSheetIds(liveCombatant)).toEqual(
      expect.arrayContaining(['combatant-1', 'mech-1', 'npc-roster-1'])
    )
    expect(
      combatantSheetIds({ id: 'c2', actor: { id: 'a2', originId: 'o2' } })
    ).toEqual(expect.arrayContaining(['c2', 'a2', 'o2']))
  })

  it('não inventa id em entrada inválida', () => {
    expect(combatantSheetIds(null)).toEqual([])
    expect(combatantSheetIds('nope')).toEqual([])
  })

  it('casa o combatente por combatantId, sheetId ou mechId', () => {
    expect(combatantMatchesBinding(liveCombatant, { sheetId: 'mech-1' })).toBe(true)
    expect(combatantMatchesBinding(liveCombatant, { sheetId: 'x', combatantId: 'combatant-1' })).toBe(
      true
    )
    expect(combatantMatchesBinding(liveCombatant, { sheetId: 'npc-roster-1' })).toBe(true)
    expect(combatantMatchesBinding(liveCombatant, { sheetId: 'outro' })).toBe(false)
  })

  it('vínculo sem nenhum id não casa com nada', () => {
    expect(combatantMatchesBinding(liveCombatant, { sheetId: '' })).toBe(false)
  })
})

describe('sideFromCards', () => {
  const cards = [
    { id: 'c1', side: 'ally' },
    { id: 'c2', side: 'enemy' },
    { id: 'c3', side: 'coisa-estranha' },
  ]

  it('lê o lado do card do combatente', () => {
    expect(sideFromCards(cards, { sheetId: 's', combatantId: 'c1' })).toBe('ally')
    expect(sideFromCards(cards, { sheetId: 's', combatantId: 'c2' })).toBe('enemy')
  })

  it('lado fora da taxonomia vira unknown', () => {
    expect(sideFromCards(cards, { sheetId: 's', combatantId: 'c3' })).toBe('unknown')
  })

  it('sem combatantId ou sem card, o lado é desconhecido', () => {
    expect(sideFromCards(cards, { sheetId: 's' })).toBe('unknown')
    expect(sideFromCards(cards, { sheetId: 's', combatantId: 'c9' })).toBe('unknown')
    expect(sideFromCards(null, { sheetId: 's', combatantId: 'c1' })).toBe('unknown')
  })
})

describe('sheetMatchesBinding — fichas do modo ativo (pilot_sheets)', () => {
  const sheet = {
    ID: 'sheet-1',
    PilotID: 'pilot-1',
    Pilot: { ID: 'pilot-1' },
    Combatant: { id: 'combatant-1', actor: { ID: 'pilot-1', ActiveMech: { ID: 'mech-1' } } },
  }

  it('casa pelo id do piloto gravado no vínculo', () => {
    expect(sheetMatchesBinding(sheet, { sheetId: 'pilot-1' })).toBe(true)
  })

  it('casa também pelo id da ficha, do combatente ou do mecha', () => {
    expect(sheetMatchesBinding(sheet, { sheetId: 'sheet-1' })).toBe(true)
    expect(sheetMatchesBinding(sheet, { sheetId: 'combatant-1' })).toBe(true)
    expect(sheetMatchesBinding(sheet, { sheetId: 'outro', mechId: 'mech-1' })).toBe(true)
  })

  it('não casa com outra ficha nem com entrada inválida', () => {
    expect(sheetMatchesBinding(sheet, { sheetId: 'outro' })).toBe(false)
    expect(sheetMatchesBinding(null, { sheetId: 'pilot-1' })).toBe(false)
    expect(sheetMatchesBinding(sheet, { sheetId: '' })).toBe(false)
  })
})

describe('sheetKindForBinding — a regra de qual ficha usar', () => {
  it('vínculo com mechId é ficha de MECHA', () => {
    expect(sheetKindForBinding({ sheetType: 'pilot', sheetId: 'p1', mechId: 'm1' })).toBe('mech')
  })

  it('piloto sem mechId é ficha de PILOTO (a pé)', () => {
    expect(sheetKindForBinding({ sheetType: 'pilot', sheetId: 'p1' })).toBe('pilot')
    expect(sheetKindForBinding({ sheetId: 'p1' })).toBe('pilot')
  })

  it('sheetType npc manda para a ficha de NPC', () => {
    expect(sheetKindForBinding({ sheetType: 'npc', sheetId: 'n1' })).toBe('npc')
    // NPC com mechId ainda é NPC: quem decide é o tipo da ficha.
    expect(sheetKindForBinding({ sheetType: 'npc', sheetId: 'n1', mechId: 'm1' })).toBe('npc')
  })
})

describe('scoreTrackerValues — separa ficha completa de ficha pela metade', () => {
  it('pontua 2 por máximo conhecido e 1 por valor corrente isolado', () => {
    expect(scoreTrackerValues({ pv: { current: 16, max: 16 } })).toBe(2)
    expect(scoreTrackerValues({ overshield: { current: 3, max: 0 } })).toBe(1)
  })

  it('a ficha do modo ativo (com estresse) ganha do mecha do Hangar (sem estresse)', () => {
    // Exatamente o caso real: o Hangar tem PV/calor/estrutura, mas `stress` zerado
    // porque quem roda `SetStats()` é a cópia de `PilotSheet.FromPilot`.
    const hangar = {
      pv: { current: 16, max: 16 },
      heat: { current: 0, max: 5 },
      speed: { current: 4, max: 4 },
      structure: { current: 4, max: 4 },
      stress: { current: 0, max: 0 },
    }
    const sheet = {
      ...hangar,
      heat: { current: 3, max: 5 },
      stress: { current: 4, max: 4 },
    }
    expect(scoreTrackerValues(sheet)).toBeGreaterThan(scoreTrackerValues(hangar))
    expect(scoreTrackerValues(hangar)).toBe(8)
    expect(scoreTrackerValues(sheet)).toBe(10)
  })

  it('fonte zerada pontua zero', () => {
    expect(scoreTrackerValues({})).toBe(0)
    expect(scoreTrackerValues(null)).toBe(0)
    expect(scoreTrackerValues({ pv: { current: 0, max: 0 } })).toBe(0)
  })
})

describe('statReaderForActor — mecha em vez de piloto', () => {
  const pilotController = { getCurrent: () => 'piloto', getMax: () => 'piloto' }
  const mechController = { getCurrent: () => 'mecha', getMax: () => 'mecha' }

  const pilot = {
    ID: 'pilot-1',
    CombatController: { StatController: pilotController },
    ActiveMech: { ID: 'mech-1', CombatController: { StatController: mechController } },
    Mechs: [{ ID: 'mech-1', CombatController: { StatController: mechController } }],
  }

  it('usa o MECHA do piloto (o StatController do piloto não tem calor/estrutura)', () => {
    const resolved = statReaderForActor(pilot, { sheetId: 'pilot-1' })
    // O leitor é um invólucro: o que importa é para QUEM ele delega.
    expect(resolved.reader?.getCurrent('hp')).toBe('mecha')
    expect(resolved.source).toBe('mecha ativo')
  })

  it('escolhe o mecha pelo mechId quando o piloto tem mais de um', () => {
    const otherController = { getCurrent: () => 'outro', getMax: () => 'outro' }
    const multi = {
      ID: 'pilot-1',
      ActiveMech: { ID: 'mech-1', CombatController: { StatController: mechController } },
      Mechs: [
        { ID: 'mech-1', CombatController: { StatController: mechController } },
        { ID: 'mech-2', CombatController: { StatController: otherController } },
      ],
    }
    const resolved = statReaderForActor(multi, { sheetId: 'pilot-1', mechId: 'mech-2' })
    expect(resolved.reader?.getCurrent('hp')).toBe('outro')
    expect(resolved.source).toBe('mecha por mechId')
  })

  it('sem mecha nenhum, cai no ator (NPC, doodad, eidolon)', () => {
    const npc = { ID: 'npc-1', CombatController: { StatController: mechController } }
    expect(statReaderForActor(npc, { sheetId: 'npc-1' }).reader?.getCurrent('hp')).toBe('mecha')
    expect(statReaderForActor(npc, { sheetId: 'npc-1' }).source).toBe('ator (sem mecha)')
  })

  it('o leitor expõe o cap do turno (BoostedSpeed) do CombatController do ator certo', () => {
    const boosted = {
      ID: 'pilot-2',
      CombatController: { StatController: pilotController, BoostedSpeed: 99 },
      ActiveMech: {
        ID: 'mech-2',
        CombatController: { StatController: mechController, BoostedSpeed: 10 },
      },
    }
    const resolved = statReaderForActor(boosted, { sheetId: 'pilot-2' })
    // Do MECHA (10), não do piloto (99): é o cap que a ficha mostra.
    expect(resolved.reader?.getBoostedSpeed?.()).toBe(10)
  })

  it('sem controller devolve leitor nulo em vez de estourar', () => {
    expect(statReaderForActor({ ID: 'x' }, { sheetId: 'x' }).reader).toBeNull()
    expect(statReaderForActor(null, { sheetId: 'x' }).reader).toBeNull()
  })

  it('ignora controller sem getCurrent/getMax (não estoura depois)', () => {
    const quebrado = { ID: 'x', CombatController: { StatController: { algo: 1 } } }
    expect(statReaderForActor(quebrado, { sheetId: 'x' }).reader).toBeNull()
  })
})

describe('hasAnyTrackerValue — separa fonte viva de fonte zerada', () => {
  it('reconhece valores de verdade', () => {
    expect(hasAnyTrackerValue({ pv: { current: 16, max: 16 } })).toBe(true)
    expect(hasAnyTrackerValue({ structure: { current: 0, max: 4 } })).toBe(true)
    expect(hasAnyTrackerValue({ overshield: { current: 3, max: 0 } })).toBe(true)
  })

  it('trata tudo zero como fonte zerada (mecha do Hangar fora de combate)', () => {
    expect(
      hasAnyTrackerValue({
        pv: { current: 0, max: 0 },
        overshield: { current: 0, max: 0 },
        heat: { current: 0, max: 0 },
        speed: { current: 0, max: 0 },
        structure: { current: 0, max: 0 },
        stress: { current: 0, max: 0 },
      })
    ).toBe(false)
  })

  it('sem valores também é zerada', () => {
    expect(hasAnyTrackerValue({})).toBe(false)
    expect(hasAnyTrackerValue(null)).toBe(false)
    expect(hasAnyTrackerValue(undefined)).toBe(false)
  })
})
