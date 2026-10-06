import { describe, expect, it } from 'vitest'
import {
  BAR_HEIGHT,
  BOOST_COLOR,
  ERROR_COLOR,
  layoutTokenTrackers,
  movementBadgeColor,
  NUMBER_DIAMETER,
  PANEL_GAP,
  resolveSquares,
  ROW_GAP,
  ROW_KIND_GAP,
  roundedBarPoints,
  SQUARE_SIZE,
  SQUARES_ROW_HEIGHT,
  type DrawCommand,
  type MovementVisualState,
  type TokenTrackerBounds,
} from '@/services/tokenTrackerLayout'
import { LANCER_TOKEN_TRACKER_SLOTS } from '@/types/token-tracker'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  type TokenTrackerConfig,
  type TokenTrackerSlotId,
  type TokenTrackerValues,
} from '@/types/token-tracker'

const BOUNDS: TokenTrackerBounds = { min: { x: 100, y: 200 }, max: { x: 200, y: 300 } }

const FULL_VALUES: TokenTrackerValues = {
  pv: { current: 12, max: 20 },
  overshield: { current: 4, max: 0 },
  heat: { current: 3, max: 8 },
  speed: { current: 4, max: 6 },
  structure: { current: 2, max: 4 },
  stress: { current: 1, max: 4 },
}

function config(patch: Partial<TokenTrackerConfig> = {}): TokenTrackerConfig {
  return { ...DEFAULT_TOKEN_TRACKER_CONFIG, ...patch }
}

function layout(values: TokenTrackerValues = FULL_VALUES, patch: Partial<TokenTrackerConfig> = {}, extra = {}) {
  return layoutTokenTrackers({ bounds: BOUNDS, values, config: config(patch), ...extra })
}

function commandsOf(commands: DrawCommand[], slot: TokenTrackerSlotId) {
  return commands.filter(command => command.slot === slot)
}

function textOf(commands: DrawCommand[], key: string): string | undefined {
  const command = commands.find(c => c.kind === 'text' && c.key === key)
  return command && command.kind === 'text' ? command.text : undefined
}

describe('layoutTokenTrackers — linhas e visibilidade dos slots', () => {
  it('desenha as quatro linhas do painel (Blindagem pareada com o PV)', () => {
    const { commands, rowCount } = layout()
    expect(rowCount).toBe(4)
    expect(commandsOf(commands, 'pv').length).toBeGreaterThan(0)
    expect(commandsOf(commands, 'overshield').length).toBeGreaterThan(0)
    expect(commandsOf(commands, 'heat').length).toBeGreaterThan(0)
    expect(commandsOf(commands, 'structure').length).toBeGreaterThan(0)
    expect(commandsOf(commands, 'stress').length).toBeGreaterThan(0)
  })

  it('o Movimento fica no badge do canto superior esquerdo, com ícone ao lado do número', () => {
    const { commands } = layout()
    const badge = commands.find(c => c.key === 'speed_badge')
    const icon = commands.find(c => c.key === 'speed_icon')
    const text = commands.find(c => c.key === 'speed_text')

    expect(badge?.kind).toBe('rect')
    expect(icon?.kind).toBe('icon')
    expect(text?.kind).toBe('text')
    if (badge?.kind !== 'rect' || icon?.kind !== 'icon' || text?.kind !== 'text') return

    // Colado no canto superior esquerdo do token, DENTRO dele.
    expect(badge.x).toBe(BOUNDS.min.x + 2)
    expect(badge.y).toBe(BOUNDS.min.y + 2)
    expect(icon.icon).toBe('speed')
    // O ícone vem antes do número (à esquerda dele) e ambos dentro do badge.
    expect(icon.cx).toBeLessThan(text.x)
    expect(icon.cx).toBeGreaterThan(badge.x)
    expect(text.x + text.width).toBeLessThanOrEqual(badge.x + badge.width + 0.001)
  })

  it('pinta o badge do Movimento conforme o estado do turno (§6.1)', () => {
    // A cor "normal" vem do preset (que é ajustável), não de um literal no teste.
    const speedColor =
      LANCER_TOKEN_TRACKER_SLOTS.find(slot => slot.id === 'speed')?.color ?? ''
    expect(speedColor).not.toBe('')

    const badgeOf = (state?: MovementVisualState) => {
      const { commands } = layout(FULL_VALUES, {}, state ? { movementState: state } : {})
      const badge = commands.find(c => c.key === 'speed_badge')
      if (badge?.kind !== 'rect') throw new Error('esperava o badge')
      return badge.fill
    }

    // Sem estado declarado, a cor é a do slot.
    expect(badgeOf()).toBe(speedColor)
    expect(badgeOf('normal')).toBe(speedColor)
    // Boost concedido é destaque, não erro.
    expect(badgeOf('boosted')).toBe(BOOST_COLOR)
    // Estouro pendente é erro (aguarda Boost/Desfazer).
    expect(badgeOf('overflow')).toBe(ERROR_COLOR)
    expect(ERROR_COLOR).not.toBe(BOOST_COLOR)
  })

  it('movementBadgeColor é pura e cobre os três estados', () => {
    expect(movementBadgeColor('normal', '#123456')).toBe('#123456')
    expect(movementBadgeColor('boosted', '#123456')).toBe(BOOST_COLOR)
    expect(movementBadgeColor('overflow', '#123456')).toBe(ERROR_COLOR)
  })

  it('o Movimento não entra na pilha de baixo', () => {
    const { commands } = layout()
    const speedCommands = commandsOf(commands, 'speed')
    expect(speedCommands.some(c => c.key === 'speed_bg')).toBe(false)
    for (const command of speedCommands) {
      if (command.kind === 'rect') expect(command.y).toBeLessThan(BOUNDS.max.y)
      if (command.kind === 'icon' || command.kind === 'square' || command.kind === 'circle') {
        expect(command.cy).toBeLessThan(BOUNDS.max.y)
      }
    }
  })

  it('token só com Movimento ainda desenha o badge', () => {
    const { commands, rowCount } = layout({ speed: { current: 4, max: 6 } })
    expect(rowCount).toBe(0)
    expect(commands.some(c => c.key === 'speed_icon')).toBe(true)
    expect(textOf(commands, 'speed_text')).toBe('4/6')
  })

  it('Estrutura e Estresse ocupam linhas DIFERENTES (não se sobrepõem)', () => {
    const { commands } = layout()
    const structure = commands.filter(c => c.kind === 'square' && c.slot === 'structure')
    const stress = commands.filter(c => c.kind === 'square' && c.slot === 'stress')

    expect(structure.length).toBeGreaterThan(0)
    expect(stress.length).toBeGreaterThan(0)

    const structureYs = new Set(structure.map(c => (c.kind === 'square' ? c.cy : 0)))
    const stressYs = new Set(stress.map(c => (c.kind === 'square' ? c.cy : 0)))
    expect(structureYs.size).toBe(1)
    expect(stressYs.size).toBe(1)
    expect([...structureYs][0]).not.toBe([...stressYs][0])

    // E nenhum quadrado de um cai dentro da faixa do outro.
    const stressTop = Math.min(...stress.map(c => (c.kind === 'square' ? c.cy - c.size / 2 : 0)))
    const structureBottom = Math.max(...structure.map(c => (c.kind === 'square' ? c.cy + c.size / 2 : 0)))
    expect(stressTop).toBeGreaterThanOrEqual(structureBottom)
  })

  it('os ids dos itens de Estrutura e Estresse são distintos', () => {
    const { commands } = layout()
    const keys = commands.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('sem valores desenháveis não devolve comando nenhum', () => {
    expect(layout({}).commands).toEqual([])
    expect(layout({}).rowCount).toBe(0)
  })

  it('respeita o desligamento por slot', () => {
    const { commands } = layout(FULL_VALUES, { slots: { structure: false } })
    expect(commandsOf(commands, 'structure')).toEqual([])
    expect(commandsOf(commands, 'stress').length).toBeGreaterThan(0)
  })

  it('esconde a Blindagem zerada por padrão e mostra com a opção ligada', () => {
    const zero: TokenTrackerValues = { ...FULL_VALUES, overshield: { current: 0, max: 0 } }
    expect(commandsOf(layout(zero).commands, 'overshield')).toEqual([])
    expect(
      commandsOf(layout(zero, { showBlindagemWhenZero: true }).commands, 'overshield').length
    ).toBeGreaterThan(0)
  })

  it('sem máximo de Estrutura/Estresse não há quadrado para desenhar', () => {
    const empty: TokenTrackerValues = { ...FULL_VALUES, structure: { current: 0, max: 0 } }
    expect(commandsOf(layout(empty).commands, 'structure')).toEqual([])
  })

  it('quando a Blindagem some, a barra de PV volta a ocupar a largura cheia', () => {
    const zero: TokenTrackerValues = { ...FULL_VALUES, overshield: { current: 0, max: 0 } }
    const withBubble = layout().commands.find(c => c.kind === 'rect' && c.key === 'pv_bg')
    const without = layout(zero).commands.find(c => c.kind === 'rect' && c.key === 'pv_bg')

    expect(withBubble?.kind).toBe('rect')
    expect(without?.kind).toBe('rect')
    if (withBubble?.kind !== 'rect' || without?.kind !== 'rect') return
    expect(without.width).toBeGreaterThan(withBubble.width)
  })
})

describe('layoutTokenTrackers — barras', () => {
  it('desenha fundo, preenchimento e texto da barra de PV', () => {
    const commands = layout().commands
    expect(commands.find(c => c.key === 'pv_bg')).toMatchObject({
      kind: 'rect',
      fillPortion: 1,
      height: BAR_HEIGHT,
    })
    expect(commands.find(c => c.key === 'pv_fill')).toMatchObject({ fillPortion: 12 / 20 })
    expect(textOf(commands, 'pv_text')).toBe('12/20')
  })

  it('não desenha NENHUM nome à esquerda das linhas', () => {
    const { commands } = layout()
    expect(commands.some(c => c.kind === 'text' && c.key.endsWith('_label'))).toBe(false)
    const texts = commands.filter(c => c.kind === 'text').map(c => (c.kind === 'text' ? c.text : ''))
    expect(texts).toEqual(expect.arrayContaining(['12/20', '4', '3/8']))
    for (const text of texts) {
      expect(text).not.toMatch(/[A-Za-zÀ-ÿ]/)
    }
  })

  it('a primeira linha começa na borda do token (sem faixa de rótulo comendo a largura)', () => {
    const bar = layout().commands.find(c => c.key === 'pv_bg')
    expect(bar?.kind).toBe('rect')
    if (bar?.kind !== 'rect') return
    expect(bar.x).toBe(BOUNDS.min.x + 2)
  })

  it('não gera preenchimento quando o valor é zero', () => {
    const zero: TokenTrackerValues = { ...FULL_VALUES, pv: { current: 0, max: 20 } }
    const commands = layout(zero).commands
    expect(commands.find(c => c.key === 'pv_bg')).toBeDefined()
    expect(commands.find(c => c.key === 'pv_fill')).toBeUndefined()
    expect(textOf(commands, 'pv_text')).toBe('0/20')
  })

  it('enche a barra quando o valor passa do máximo (calor estourado)', () => {
    const over: TokenTrackerValues = { ...FULL_VALUES, heat: { current: 11, max: 8 } }
    expect(layout(over).commands.find(c => c.key === 'heat_fill')).toMatchObject({ fillPortion: 1 })
  })

  it('sem máximo conhecido, valor positivo enche a barra', () => {
    const unknown: TokenTrackerValues = { pv: { current: 7, max: 0 } }
    expect(layout(unknown).commands.find(c => c.key === 'pv_fill')).toMatchObject({ fillPortion: 1 })
  })

  it('mostra a Blindagem pareada só com o número, à direita da barra', () => {
    const commands = layout().commands
    const bubble = commands.find(c => c.kind === 'circle' && c.key === 'overshield_bg')
    const bar = commands.find(c => c.kind === 'rect' && c.key === 'pv_bg')

    expect(bubble?.kind).toBe('circle')
    expect(bar?.kind).toBe('rect')
    if (bubble?.kind !== 'circle' || bar?.kind !== 'rect') return
    expect(bubble.cx).toBeGreaterThan(bar.x + bar.width)
    expect(textOf(commands, 'overshield_text')).toBe('4')
  })
})

describe('layoutTokenTrackers — numéricos', () => {
  it('mostra o Movimento cheio como número puro', () => {
    const full: TokenTrackerValues = { ...FULL_VALUES, speed: { current: 6, max: 6 } }
    expect(textOf(layout(full).commands, 'speed_text')).toBe('6')
  })

  it('mostra atual/máximo quando o Movimento já foi gasto', () => {
    expect(textOf(layout().commands, 'speed_text')).toBe('4/6')
  })

  it('respeita o teto de tamanho do badge no canto', () => {
    const wide = layoutTokenTrackers({
      bounds: { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } },
      values: { speed: { current: 4, max: 6 } },
      config: config(),
    })
    const icon = wide.commands.find(c => c.kind === 'icon')
    expect(icon?.kind).toBe('icon')
    if (icon?.kind !== 'icon') return
    expect(icon.size).toBeLessThanOrEqual(20)
  })
})

describe('resolveSquares', () => {
  it('preenche o valor ATUAL por padrão (vazio = perdido)', () => {
    expect(resolveSquares({ current: 2, max: 4 }, config())).toEqual({ count: 4, filled: 2, overflow: 0 })
  })

  it('com invertSquares marca o dano', () => {
    expect(resolveSquares({ current: 1, max: 4 }, config({ invertSquares: true }))).toEqual({
      count: 4,
      filled: 3,
      overflow: 0,
    })
  })

  it('trava no teto e reporta o excedente', () => {
    expect(resolveSquares({ current: 8, max: 20 }, config({ maxSquares: 6 }))).toEqual({
      count: 6,
      filled: 6,
      overflow: 14,
    })
  })

  it('não deixa o preenchido passar do que foi desenhado', () => {
    expect(resolveSquares({ current: 20, max: 20 }, config({ maxSquares: 3 })).filled).toBe(3)
  })

  it('lida com valor atual maior que o máximo', () => {
    expect(resolveSquares({ current: 9, max: 4 }, config())).toEqual({ count: 4, filled: 4, overflow: 0 })
  })
})

describe('layoutTokenTrackers — quadrados', () => {
  it('desenha um quadrado por ponto de Estrutura', () => {
    const squares = layout().commands.filter(c => c.kind === 'square' && c.slot === 'structure')
    expect(squares).toHaveLength(4)
  })

  it('marca preenchidos os quadrados do valor atual', () => {
    const squares = layout().commands.filter(c => c.kind === 'square' && c.slot === 'structure')
    const filled = squares.filter(c => c.kind === 'square' && c.opacity === 1)
    expect(filled).toHaveLength(2)
  })

  it('com invertSquares marca os perdidos', () => {
    const { commands } = layout(FULL_VALUES, { invertSquares: true })
    const squares = commands.filter(c => c.kind === 'square' && c.slot === 'structure')
    const filled = squares.filter(c => c.kind === 'square' && c.opacity === 1)
    expect(filled).toHaveLength(2) // current 2, max 4 → perdidos 2
  })

  it('sinaliza o excedente com +N no fim da trilha quando passa do teto', () => {
    const big: TokenTrackerValues = { structure: { current: 3, max: 20 } }
    const { commands } = layout(big, { maxSquares: 6 })
    expect(textOf(commands, 'structure_overflow')).toBe('+14')
    expect(commands.filter(c => c.kind === 'square')).toHaveLength(6)

    // O `+N` fica depois do último quadrado, não à esquerda.
    const squares = commands.filter(c => c.kind === 'square')
    const lastSquare = squares[squares.length - 1]
    const overflow = commands.find(c => c.key === 'structure_overflow')
    if (lastSquare?.kind !== 'square' || overflow?.kind !== 'text') throw new Error('esperava quadrado e texto')
    expect(overflow.x).toBeGreaterThan(lastSquare.cx)
  })

  it('nunca desenha quadrado maior que o tamanho nominal', () => {
    const squares = layout().commands.filter(c => c.kind === 'square')
    for (const square of squares) {
      if (square.kind !== 'square') continue
      expect(square.size).toBeLessThanOrEqual(SQUARE_SIZE)
    }
  })
})

describe('layoutTokenTrackers — posicionamento', () => {
  it('a distância da config controla o quanto o painel fica do token', () => {
    const padrao = layout().commands.find(c => c.key === 'structure_sq_0')
    const colado = layout(FULL_VALUES, { panelGap: -12 }).commands.find(c => c.key === 'structure_sq_0')
    const afastado = layout(FULL_VALUES, { panelGap: 20 }).commands.find(c => c.key === 'structure_sq_0')

    if (padrao?.kind !== 'square' || colado?.kind !== 'square' || afastado?.kind !== 'square') {
      throw new Error('esperava quadrados')
    }
    // Negativo sobe o painel (aproxima), positivo desce (afasta).
    expect(colado.cy).toBeLessThan(padrao.cy)
    expect(afastado.cy).toBeGreaterThan(padrao.cy)
  })

  it('sem panelGap na config, usa o default do layout', () => {
    const semCampo = layoutTokenTrackers({
      bounds: BOUNDS,
      values: FULL_VALUES,
      config: { ...config(), panelGap: undefined as unknown as number },
    })
    const explicito = layout(FULL_VALUES, { panelGap: PANEL_GAP })
    expect(semCampo.commands).toEqual(explicito.commands)
  })

  it('dá 2 de respiro extra entre uma linha de quadrados e uma de barra', () => {
    const { commands } = layout()
    const bottomOf = (key: string): number => {
      const command = commands.find(c => c.key === key)
      if (!command) throw new Error(`comando ${key} faltando`)
      if (command.kind === 'square') return command.cy + command.size / 2
      if (command.kind === 'rect') return command.y + command.height
      if (command.kind === 'circle') return command.cy + command.diameter / 2
      if (command.kind === 'text') return command.y + command.height
      return command.cy + command.size / 2
    }
    const topOf = (key: string): number => {
      const command = commands.find(c => c.key === key)
      if (!command) throw new Error(`comando ${key} faltando`)
      if (command.kind === 'square') return command.cy - command.size / 2
      if (command.kind === 'rect') return command.y
      if (command.kind === 'circle') return command.cy - command.diameter / 2
      if (command.kind === 'text') return command.y
      return command.cy - command.size / 2
    }

    // A linha de quadrados tem SQUARES_ROW_HEIGHT de altura com quadrados menores,
    // então sobra folga em cima e embaixo: o vão VISÍVEL é o gap + essa folga.
    const folgaDosQuadrados = (SQUARES_ROW_HEIGHT - SQUARE_SIZE) / 2
    const esperado = ROW_GAP + ROW_KIND_GAP + folgaDosQuadrados

    // Estrutura (quadrados) → PV (barra): gap normal + respiro.
    expect(topOf('pv_bg') - bottomOf('structure_sq_0')).toBeCloseTo(esperado, 5)
    // PV (barra) → Estresse (quadrados): idem.
    expect(topOf('stress_sq_0') - bottomOf('pv_bg')).toBeCloseTo(esperado, 5)
    // Estresse (quadrados) → Calor (barra): idem.
    expect(topOf('heat_bg') - bottomOf('stress_sq_0')).toBeCloseTo(esperado, 5)
  })

  it('o respiro extra só aparece quando o TIPO da linha muda', () => {
    // Duas barras seguidas (escondendo Estrutura e Estresse) mantêm o gap normal.
    const { commands } = layout(FULL_VALUES, { slots: { structure: false, stress: false } })
    const pv = commands.find(c => c.key === 'pv_bg')
    const heat = commands.find(c => c.key === 'heat_bg')
    if (pv?.kind !== 'rect' || heat?.kind !== 'rect') throw new Error('esperava barras')
    expect(heat.y - (pv.y + pv.height)).toBeCloseTo(ROW_GAP, 5)
  })

  it('desenha abaixo do token por padrão', () => {
    const { commands } = layout()
    const first = commands.find(c => c.key === 'pv_bg')
    expect(first?.kind).toBe('rect')
    if (first?.kind !== 'rect') return
    expect(first.y).toBeGreaterThan(BOUNDS.max.y)
  })

  it('desenha acima do token quando pedido', () => {
    const { commands } = layout(FULL_VALUES, {}, { above: true })
    const first = commands.find(c => c.key === 'pv_bg')
    expect(first?.kind).toBe('rect')
    if (first?.kind !== 'rect') return
    expect(first.y + first.height).toBeLessThanOrEqual(BOUNDS.min.y)
  })

  it('aplica o deslocamento vertical', () => {
    const base = layout().commands.find(c => c.key === 'pv_bg')
    const shifted = layout(FULL_VALUES, {}, { verticalOffset: 25 }).commands.find(c => c.key === 'pv_bg')
    if (base?.kind !== 'rect' || shifted?.kind !== 'rect') throw new Error('esperava retângulos')
    expect(shifted.y - base.y).toBe(25)
  })

  it('empilha as linhas do painel sem sobreposição', () => {
    const boxOf = (command: DrawCommand | undefined): { top: number; bottom: number } => {
      if (!command) throw new Error('comando faltando')
      switch (command.kind) {
        case 'rect':
          return { top: command.y, bottom: command.y + command.height }
        case 'circle':
          return { top: command.cy - command.diameter / 2, bottom: command.cy + command.diameter / 2 }
        case 'square':
          return { top: command.cy - command.size / 2, bottom: command.cy + command.size / 2 }
        case 'text':
          return { top: command.y, bottom: command.y + command.height }
        case 'icon':
          return { top: command.cy - command.size / 2, bottom: command.cy + command.size / 2 }
        default:
          throw new Error(`comando inesperado: ${JSON.stringify(command)}`)
      }
    }

    // Ordem pedida pelo usuário, de cima para baixo: Estrutura, PV, Estresse, Calor.
    // O Movimento NÃO entra: ele fica no badge do canto (dentro do token).
    const commands = layout().commands
    const boxes = ['structure_sq_0', 'pv_bg', 'stress_sq_0', 'heat_bg'].map(key =>
      boxOf(commands.find(c => c.key === key))
    )

    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom)
    }
  })

  it('desenha na ordem Estrutura → PV → Estresse → Calor', () => {
    const { rows } = layout()
    expect(rows).toEqual(['structure', 'pv', 'stress', 'heat'])
  })

  it('lista os slots pulados com o motivo (o que responde "não apareceu")', () => {
    const zeroStress: TokenTrackerValues = { ...FULL_VALUES, stress: { current: 0, max: 0 } }
    const semMaximo = layout(zeroStress)
    expect(semMaximo.skipped).toContainEqual({ slot: 'stress', reason: 'no-max' })
    expect(semMaximo.rows).not.toContain('stress')

    const disabled = layout(FULL_VALUES, { slots: { stress: false } })
    expect(disabled.skipped).toContainEqual({ slot: 'stress', reason: 'disabled' })
    expect(disabled.rows).not.toContain('stress')

    const noOvershield: TokenTrackerValues = { ...FULL_VALUES, overshield: { current: 0, max: 0 } }
    expect(layout(noOvershield).skipped).toContainEqual({
      slot: 'overshield',
      reason: 'hidden-when-zero',
    })

    // Com tudo presente e ligado, nada é pulado e o canto é o Movimento.
    const completo = layout()
    expect(completo.skipped).toEqual([])
    expect(completo.corner).toEqual(['speed'])
  })

  it('acompanha a largura do token', () => {
    const wide = layoutTokenTrackers({
      bounds: { min: { x: 0, y: 0 }, max: { x: 400, y: 100 } },
      values: FULL_VALUES,
      config: config(),
    })
    const narrow = layout()
    const wideBar = wide.commands.find(c => c.key === 'pv_bg')
    const narrowBar = narrow.commands.find(c => c.key === 'pv_bg')
    if (wideBar?.kind !== 'rect' || narrowBar?.kind !== 'rect') throw new Error('esperava retângulos')
    expect(wideBar.width).toBeGreaterThan(narrowBar.width)
  })

  it('não quebra com token de tamanho degenerado', () => {
    const { commands } = layoutTokenTrackers({
      bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
      values: FULL_VALUES,
      config: config(),
    })
    for (const command of commands) {
      if (command.kind === 'rect') {
        expect(Number.isFinite(command.width)).toBe(true)
        expect(command.width).toBeGreaterThan(0)
      }
    }
  })
})

describe('roundedBarPoints', () => {
  it('não desenha nada com preenchimento zero ou tamanho degenerado', () => {
    expect(roundedBarPoints(100, 20, 10, 0)).toEqual([])
    expect(roundedBarPoints(0, 20, 10, 0.5)).toEqual([])
    expect(roundedBarPoints(100, 0, 10, 0.5)).toEqual([])
  })

  it('desenha o retângulo completo (com cantos) quando cheio', () => {
    const full = roundedBarPoints(100, 20, 10, 1)
    expect(full.length).toBeGreaterThan(4)
    for (const point of full) {
      expect(point.x).toBeGreaterThanOrEqual(-0.001)
      expect(point.x).toBeLessThanOrEqual(100.001)
      expect(point.y).toBeGreaterThanOrEqual(-0.001)
      expect(point.y).toBeLessThanOrEqual(20.001)
    }
  })

  it('corta a barra preenchida no comprimento certo', () => {
    const half = roundedBarPoints(100, 20, 10, 0.5)
    const maxX = Math.max(...half.map(p => p.x))
    expect(maxX).toBeCloseTo(50, 5)
  })

  it('em preenchimento pequeno devolve um arredondado do tamanho do pedaço', () => {
    const tiny = roundedBarPoints(100, 20, 10, 0.05)
    const maxX = Math.max(...tiny.map(p => p.x))
    expect(maxX).toBeCloseTo(5, 5)
  })

  it('sem raio devolve um retângulo de quatro cantos', () => {
    expect(roundedBarPoints(50, 20, 0, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 20 },
      { x: 0, y: 20 },
    ])
  })

  it('mantém raio coerente com a altura', () => {
    const points = roundedBarPoints(100, 20, 999, 1)
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(-0.001)
      expect(point.y).toBeGreaterThanOrEqual(-0.001)
      expect(point.y).toBeLessThanOrEqual(20.001)
    }
  })
})
