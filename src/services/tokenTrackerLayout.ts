import type {
  TokenTrackerConfig,
  TokenTrackerSlot,
  TokenTrackerSlotId,
  TokenTrackerValue,
  TokenTrackerValues,
} from '@/types/token-tracker'
import { TOKEN_TRACKER_SLOT_ORDER, LANCER_TOKEN_TRACKER_SLOTS } from '@/types/token-tracker'

/**
 * Geometria do painel de trackers (plano §6.1).
 *
 * Puro: transforma `bounds + valores + config` em uma lista neutra de comandos de
 * desenho. Nada de OBR aqui — quem vira item do SDK é `tokenTrackerRender.ts`, e
 * é por isso que a geometria é testável sem sala nenhuma.
 *
 * Convenção de coordenadas (importa para o render):
 * - `rect`   → `x/y` é a ORIGEM local dos pontos (canto superior esquerdo).
 * - `circle` → `cx/cy` é o CENTRO (o OBR desenha shapes centradas na posição).
 * - `square` → `cx/cy` é o CENTRO.
 * - `text`   → `x/y` é o canto superior esquerdo da caixa de texto.
 */

export interface TokenTrackerPoint {
  x: number
  y: number
}

export interface TokenTrackerBounds {
  min: TokenTrackerPoint
  max: TokenTrackerPoint
}

/////////////////////////////////////////////////////////////////////
// Constantes de layout
/////////////////////////////////////////////////////////////////////

/** Espaço entre linhas do painel. */
export const ROW_GAP = 4
/**
 * Respiro EXTRA na transição entre uma linha de quadrados e uma de barras.
 *
 * A ordem do painel é Estrutura (quadrados) → PV (barra) → Estresse (quadrados) →
 * Calor (barra): sem isto, a trilha de quadrados e a barra seguinte ficam coladas
 * e parecem um bloco só.
 */
export const ROW_KIND_GAP = 2
/** Altura da barra de PV/Calor. */
export const BAR_HEIGHT = 20
/** Diâmetro máximo da bolha numérica (Blindagem/Movimento). */
export const NUMBER_DIAMETER = 20
/** Lado de cada quadrado de Estrutura/Estresse. */
export const SQUARE_SIZE = 10
/** Espaço entre quadrados. */
export const SQUARE_GAP = 4
/** Altura da linha de quadrados (um pouco maior que o quadrado). */
export const SQUARES_ROW_HEIGHT = SQUARE_SIZE + 2
/** Corpo do texto dentro das barras/bolhas. */
export const VALUE_FONT_SIZE = 12
/** Respiro nas laterais do token. */
export const PANEL_PADDING = 2
/** Espaço entre o token e a primeira linha. */
export const PANEL_GAP = 4
/** Cor do fundo das barras e bolhas. */
export const PANEL_BACKGROUND = '#000000'
export const BAR_BACKGROUND_OPACITY = 0.68
export const BAR_FILL_OPACITY = 0.9
export const BUBBLE_BACKGROUND_OPACITY = 0.68
export const SQUARE_FILL_OPACITY = 1
export const SQUARE_EMPTY_OPACITY = 0.14
/** Corpo do `+N` quando a trilha de quadrados passa do teto. */
export const OVERFLOW_FONT_SIZE = 10
/** Faixa reservada para o `+N` no fim de uma trilha de quadrados truncada. */
export const OVERFLOW_RESERVE = 18
/** Fundo do badge do canto (Movimento). */
export const CORNER_BACKGROUND_OPACITY = 0.6
/** Respiro do badge em relação ao canto do token. */
export const CORNER_PADDING = 2
export const VALUE_COLOR = '#FFFFFF'

/////////////////////////////////////////////////////////////////////
// Comandos de desenho
/////////////////////////////////////////////////////////////////////

interface DrawCommandBase {
  /** Chave estável dentro do token; o render prefixa com o id do token. */
  key: string
  slot: TokenTrackerSlotId
}

export interface RectCommand extends DrawCommandBase {
  kind: 'rect'
  /** Canto superior esquerdo da forma. */
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill: string
  opacity: number
  /** 0..1 — quanto da barra está preenchido. */
  fillPortion: number
}

export interface CircleCommand extends DrawCommandBase {
  kind: 'circle'
  /** Centro da bolha. */
  cx: number
  cy: number
  diameter: number
  fill: string
  opacity: number
}

export interface SquareCommand extends DrawCommandBase {
  kind: 'square'
  /** Centro do quadrado. */
  cx: number
  cy: number
  size: number
  fill: string
  opacity: number
  /** Índice do quadrado na trilha (para id determinístico). */
  index: number
}

export interface TextCommand extends DrawCommandBase {
  kind: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
}

/** Ícone (SVG de `public/tracker-icons`) — imagens são centradas na posição. */
export interface IconCommand extends DrawCommandBase {
  kind: 'icon'
  /** Centro do ícone. */
  cx: number
  cy: number
  /** Lado do ícone em unidades de cena. */
  size: number
  /** Nome lógico do ícone; o render resolve a URL. */
  icon: string
}

export type DrawCommand = RectCommand | CircleCommand | SquareCommand | TextCommand | IconCommand

export interface TokenTrackerLayoutInput {
  /** Limites do token em unidades de cena (`OBR.scene.items.getItemBounds`). */
  bounds: TokenTrackerBounds
  values: TokenTrackerValues
  config: TokenTrackerConfig
  /** Desenha acima do token em vez de abaixo. */
  above?: boolean
  /** Deslocamento vertical extra (mesma ideia do `verticalOffset` do plugin). */
  verticalOffset?: number
  /** Escala global do painel. */
  scale?: number
}

export interface TokenTrackerLayoutResult {
  commands: DrawCommand[]
  /** Quantas linhas foram desenhadas (útil para diagnóstico/telemetria). */
  rowCount: number
  /** Slots efetivamente desenhados no painel de baixo, na ordem. */
  rows: TokenTrackerSlotId[]
  /** Slots desenhados como badge de canto (Movimento). */
  corner: TokenTrackerSlotId[]
  /** Slots descartados e o motivo — é o que responde "por que não apareceu". */
  skipped: Array<{ slot: TokenTrackerSlotId; reason: TokenTrackerSlotSkipReason }>
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function meterText(value: TokenTrackerValue): string {
  if (value.max > 0) return `${value.current}/${value.max}`
  return `${value.current}`
}

/**
 * Texto da bolha numérica: número puro quando está cheio (ou sem máximo
 * conhecido) e `atual/máximo` quando há diferença — é assim que o Movimento
 * gasto aparece sem poluir o caso normal.
 */
function numberText(value: TokenTrackerValue): string {
  if (value.max > 0 && value.current !== value.max) return `${value.current}/${value.max}`
  return `${value.current}`
}

/** Por que um slot NÃO foi desenhado. */
export type TokenTrackerSlotSkipReason =
  | 'disabled'
  | 'no-value'
  | 'no-max'
  | 'hidden-when-zero'
  | 'no-room'

/**
 * O slot deve ser desenhado com este valor? Devolve o MOTIVO quando não.
 *
 * Devolver o motivo (em vez de só `false`) é o que permite o log dizer "Estresse
 * ficou de fora porque `slots.stress = false`" em vez de deixar a dúvida.
 */
export function slotSkipReason(
  slot: TokenTrackerSlot,
  value: TokenTrackerValue | undefined,
  config: TokenTrackerConfig
): TokenTrackerSlotSkipReason | null {
  if (!value) return 'no-value'
  if (config.slots[slot.id] === false) return 'disabled'
  if (slot.kind === 'squares' && value.max <= 0) return 'no-max'
  if (slot.id === 'overshield' && !config.showBlindagemWhenZero && value.current === 0) {
    return 'hidden-when-zero'
  }
  return null
}

function isSlotVisible(
  slot: TokenTrackerSlot,
  value: TokenTrackerValue | undefined,
  config: TokenTrackerConfig
): boolean {
  return slotSkipReason(slot, value, config) === null
}

interface LayoutRow {
  slot: TokenTrackerSlot
  value: TokenTrackerValue
  /** Slot numérico desenhado ao lado desta barra (Blindagem ao lado do PV). */
  paired?: { slot: TokenTrackerSlot; value: TokenTrackerValue }
}

function slotById(id: TokenTrackerSlotId): TokenTrackerSlot | undefined {
  return LANCER_TOKEN_TRACKER_SLOTS.find(slot => slot.id === id)
}

/** Monta as linhas na ordem canônica, encaixando os slots pareados. */
function buildRows(values: TokenTrackerValues, config: TokenTrackerConfig): LayoutRow[] {
  const rows: LayoutRow[] = []

  for (const id of TOKEN_TRACKER_SLOT_ORDER) {
    const slot = slotById(id)
    if (!slot) continue
    // Slots de canto (Movimento) não entram na pilha: têm lugar próprio no token.
    if (slot.placement === 'top-left') continue
    const value = values[id]
    if (!isSlotVisible(slot, value, config)) continue

    if (slot.pairWith) {
      const host = rows.find(row => row.slot.id === slot.pairWith)
      if (host) {
        host.paired = { slot, value: value as TokenTrackerValue }
        continue
      }
    }

    rows.push({ slot, value: value as TokenTrackerValue })
  }

  return rows
}

/**
 * Badge do canto superior esquerdo: ícone + número, sobre um fundo escuro.
 *
 * Fica DENTRO do token, colado no canto, para não competir com o painel de baixo.
 */
function buildCornerBadge(
  slot: TokenTrackerSlot,
  value: TokenTrackerValue,
  config: TokenTrackerConfig,
  origin: { x: number; y: number },
  tokenWidth: number
): DrawCommand[] {
  if (!isSlotVisible(slot, value, config)) return []

  const commands: DrawCommand[] = []
  const iconSize = clamp(tokenWidth * 0.18, 12, 20)
  const textWidth = Math.max(iconSize * 1.6, 18)
  const badgeHeight = iconSize + 4
  const badgeWidth = iconSize + 8 + textWidth

  commands.push({
    kind: 'rect',
    key: `${slot.id}_badge`,
    slot: slot.id,
    x: origin.x,
    y: origin.y,
    width: badgeWidth,
    height: badgeHeight,
    radius: badgeHeight / 2,
    fill: PANEL_BACKGROUND,
    opacity: CORNER_BACKGROUND_OPACITY,
    fillPortion: 1,
  })

  const centerY = origin.y + badgeHeight / 2
  if (slot.icon) {
    commands.push({
      kind: 'icon',
      key: `${slot.id}_icon`,
      slot: slot.id,
      cx: origin.x + 2 + iconSize / 2,
      cy: centerY,
      size: iconSize,
      icon: slot.icon,
    })
  }

  commands.push({
    kind: 'text',
    key: `${slot.id}_text`,
    slot: slot.id,
    x: origin.x + iconSize + 6,
    y: origin.y,
    width: textWidth,
    height: badgeHeight,
    text: numberText(value),
    fontSize: Math.max(9, iconSize - 6),
    color: VALUE_COLOR,
    align: 'center',
    verticalAlign: 'middle',
  })

  return commands
}

/**
 * Quantos quadrados desenhar e quantos ficam preenchidos.
 *
 * Padrão (`invertSquares: false`): preenchido = valor ATUAL, ou seja, os
 * quadrados vazios são a Estrutura/Estresse já perdidos.
 */
export function resolveSquares(
  value: TokenTrackerValue,
  config: TokenTrackerConfig
): { count: number; filled: number; overflow: number } {
  const count = clamp(Math.trunc(value.max), 0, config.maxSquares)
  const lost = Math.max(0, value.max - value.current)
  const marked = config.invertSquares ? lost : value.current
  return {
    count,
    filled: clamp(Math.trunc(marked), 0, count),
    overflow: Math.max(0, Math.trunc(value.max) - count),
  }
}

function rowHeightFor(row: LayoutRow): number {
  if (row.slot.kind === 'bar') return BAR_HEIGHT
  if (row.slot.kind === 'squares') return SQUARES_ROW_HEIGHT
  return NUMBER_DIAMETER
}

/** Espaço DEPOIS desta linha: o normal, mais o respiro quando o tipo muda. */
function rowGapAfter(previous: LayoutRow, next: LayoutRow | undefined): number {
  if (!next) return 0
  return previous.slot.kind !== next.slot.kind ? ROW_GAP + ROW_KIND_GAP : ROW_GAP
}

/**
 * Gera os comandos de desenho do painel. Sem valor desenhável devolve lista
 * vazia — quem chama limpa os itens do token.
 */
export function layoutTokenTrackers(input: TokenTrackerLayoutInput): TokenTrackerLayoutResult {
  const rows = buildRows(input.values, input.config)

  // Slots de canto (Movimento) são independentes da pilha de baixo: um token pode
  // ter só eles e ainda assim precisar de desenho.
  const cornerSlots = TOKEN_TRACKER_SLOT_ORDER.map(slotById).filter(
    (slot): slot is TokenTrackerSlot =>
      !!slot &&
      slot.placement === 'top-left' &&
      isSlotVisible(slot, input.values[slot.id], input.config)
  )

  const skipped: Array<{ slot: TokenTrackerSlotId; reason: TokenTrackerSlotSkipReason }> = []
  const drawnRows = new Set(rows.map(row => row.slot.id))
  for (const row of rows) {
    if (row.paired) drawnRows.add(row.paired.slot.id)
  }
  const drawnCorner = new Set(cornerSlots.map(slot => slot.id))
  for (const id of TOKEN_TRACKER_SLOT_ORDER) {
    if (drawnRows.has(id) || drawnCorner.has(id)) continue
    const slot = slotById(id)
    if (!slot) continue
    const reason = slotSkipReason(slot, input.values[id], input.config)
    skipped.push({ slot: id, reason: reason ?? 'no-room' })
  }

  const result = (commands: DrawCommand[]): TokenTrackerLayoutResult => ({
    commands,
    rowCount: rows.length,
    rows: rows.map(row => row.slot.id),
    corner: cornerSlots.map(slot => slot.id),
    skipped,
  })

  if (rows.length === 0 && cornerSlots.length === 0) return result([])

  const scale = Number.isFinite(input.scale) && input.scale && input.scale > 0 ? input.scale : 1
  const minX = Math.min(input.bounds.min.x, input.bounds.max.x)
  const maxX = Math.max(input.bounds.min.x, input.bounds.max.x)
  const minY = Math.min(input.bounds.min.y, input.bounds.max.y)
  const maxY = Math.max(input.bounds.min.y, input.bounds.max.y)

  const tokenWidth = (maxX - minX) * scale
  const left = minX
  const verticalOffset = input.verticalOffset ?? 0
  // A distância até o token vem da config (negativo aproxima). Sem config válida, o
  // default do painel.
  const panelGap = Number.isFinite(input.config.panelGap)
    ? input.config.panelGap
    : PANEL_GAP

  const commands: DrawCommand[] = []

  // Badge do canto superior esquerdo (Movimento), com o ícone ao lado do número.
  for (const slot of cornerSlots) {
    commands.push(
      ...buildCornerBadge(
        slot,
        input.values[slot.id] as TokenTrackerValue,
        input.config,
        { x: minX + CORNER_PADDING, y: minY + CORNER_PADDING },
        tokenWidth
      )
    )
  }

  if (rows.length === 0) return result(commands)

  // Sem coluna de rótulos: o painel usa a largura inteira do token. O nome de cada
  // stat vive só no painel de configuração; no mapa fica o número (e a cor do slot).
  const contentWidth = Math.max(8, tokenWidth - PANEL_PADDING * 2)

  const heights = rows.map(rowHeightFor)
  // Cada transição tem o seu espaço: quadrados ↔ barras ganham um respiro extra.
  const gaps = rows.map((row, index) => rowGapAfter(row, rows[index + 1]))
  const totalHeight = heights.reduce((sum, h) => sum + h, 0) + gaps.reduce((sum, g) => sum + g, 0)

  let cursorY = input.above
    ? minY - panelGap - totalHeight - verticalOffset
    : maxY + panelGap + verticalOffset

  rows.forEach((row, rowIndex) => {
    const rowHeight = heights[rowIndex]
    const centerY = cursorY + rowHeight / 2
    const widgetX = left + PANEL_PADDING
    const widgetWidth = contentWidth

    if (row.slot.kind === 'bar') {
      let bubbleDiameter = 0
      if (row.paired) {
        bubbleDiameter = clamp(widgetWidth * 0.28, 14, NUMBER_DIAMETER)
      }
      const barWidth = Math.max(8, widgetWidth - (bubbleDiameter > 0 ? bubbleDiameter + 2 : 0))
      const fillPortion = row.value.max > 0 ? clamp(row.value.current / row.value.max, 0, 1) : row.value.current > 0 ? 1 : 0

      commands.push({
        kind: 'rect',
        key: `${row.slot.id}_bg`,
        slot: row.slot.id,
        x: widgetX,
        y: cursorY,
        width: barWidth,
        height: BAR_HEIGHT,
        radius: BAR_HEIGHT / 2,
        fill: PANEL_BACKGROUND,
        opacity: BAR_BACKGROUND_OPACITY,
        fillPortion: 1,
      })

      if (fillPortion > 0) {
        commands.push({
          kind: 'rect',
          key: `${row.slot.id}_fill`,
          slot: row.slot.id,
          x: widgetX,
          y: cursorY,
          width: barWidth,
          height: BAR_HEIGHT,
          radius: BAR_HEIGHT / 2,
          fill: row.slot.color,
          opacity: BAR_FILL_OPACITY,
          fillPortion,
        })
      }

      commands.push({
        kind: 'text',
        key: `${row.slot.id}_text`,
        slot: row.slot.id,
        x: widgetX,
        y: cursorY,
        width: barWidth,
        height: BAR_HEIGHT,
        text: meterText(row.value),
        fontSize: VALUE_FONT_SIZE,
        color: VALUE_COLOR,
        align: 'center',
        verticalAlign: 'middle',
      })

      if (row.paired) {
        const cx = widgetX + barWidth + 2 + bubbleDiameter / 2
        commands.push({
          kind: 'circle',
          key: `${row.paired.slot.id}_bg`,
          slot: row.paired.slot.id,
          cx,
          cy: centerY,
          diameter: bubbleDiameter,
          fill: row.paired.slot.color,
          opacity: BUBBLE_BACKGROUND_OPACITY,
        })
        commands.push({
          kind: 'text',
          key: `${row.paired.slot.id}_text`,
          slot: row.paired.slot.id,
          x: cx - bubbleDiameter / 2,
          y: centerY - bubbleDiameter / 2,
          width: bubbleDiameter,
          height: bubbleDiameter,
          text: numberText(row.paired.value),
          fontSize: bubbleDiameter <= 15 ? 9 : 11,
          color: VALUE_COLOR,
          align: 'center',
          verticalAlign: 'middle',
        })
      }
    } else if (row.slot.kind === 'number') {
      const diameter = clamp(widgetWidth * 0.5, 16, NUMBER_DIAMETER)
      const cx = widgetX + diameter / 2
      commands.push({
        kind: 'circle',
        key: `${row.slot.id}_bg`,
        slot: row.slot.id,
        cx,
        cy: centerY,
        diameter,
        fill: row.slot.color,
        opacity: BUBBLE_BACKGROUND_OPACITY,
      })
      commands.push({
        kind: 'text',
        key: `${row.slot.id}_text`,
        slot: row.slot.id,
        x: cx - diameter / 2,
        y: centerY - diameter / 2,
        width: diameter,
        height: diameter,
        text: numberText(row.value),
        fontSize: diameter <= 17 ? 9 : 11,
        color: VALUE_COLOR,
        align: 'center',
        verticalAlign: 'middle',
      })
    } else {
      const { count, filled, overflow } = resolveSquares(row.value, input.config)
      const overflowText = overflow > 0 ? `+${overflow}` : ''
      // Quando a trilha é truncada, os quadrados encolhem para o `+N` caber no fim.
      const availableWidth = Math.max(8, widgetWidth - (overflowText ? OVERFLOW_RESERVE : 0))
      const squareSize = clamp(
        Math.min(SQUARE_SIZE, (availableWidth - SQUARE_GAP * (count - 1)) / Math.max(1, count)),
        6,
        SQUARE_SIZE
      )

      for (let i = 0; i < count; i++) {
        commands.push({
          kind: 'square',
          key: `${row.slot.id}_sq_${i}`,
          slot: row.slot.id,
          cx: widgetX + squareSize / 2 + i * (squareSize + SQUARE_GAP),
          cy: centerY,
          size: squareSize,
          fill: row.slot.color,
          opacity: i < filled ? SQUARE_FILL_OPACITY : SQUARE_EMPTY_OPACITY,
          index: i,
        })
      }

      // Excedente do teto de quadrados: `+N` colado no fim da trilha (sem nome,
      // para não reintroduzir rótulo à esquerda).
      const overflowX = widgetX + count * (squareSize + SQUARE_GAP)
      const overflowWidth = widgetWidth - (count * (squareSize + SQUARE_GAP))
      if (overflowText && overflowWidth > 6) {
        commands.push({
          kind: 'text',
          key: `${row.slot.id}_overflow`,
          slot: row.slot.id,
          x: overflowX,
          y: cursorY,
          width: overflowWidth,
          height: rowHeight,
          text: overflowText,
          fontSize: OVERFLOW_FONT_SIZE,
          color: VALUE_COLOR,
          align: 'left',
          verticalAlign: 'middle',
        })
      }
    }

    cursorY += rowHeight + (gaps[rowIndex] ?? 0)
  })

  return result(commands)
}

/////////////////////////////////////////////////////////////////////
// Geometria do retângulo arredondado (barra)
/////////////////////////////////////////////////////////////////////

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startDegrees: number,
  endDegrees: number,
  segments: number
): TokenTrackerPoint[] {
  const points: TokenTrackerPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const angle = ((startDegrees + ((endDegrees - startDegrees) * i) / segments) * Math.PI) / 180
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  }
  return points
}

function fullOutline(width: number, height: number, radius: number, segments = 6): TokenTrackerPoint[] {
  if (width <= 0 || height <= 0) return []
  const r = clamp(radius, 0, Math.min(width / 2, height / 2))
  if (r === 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]
  }

  return [
    { x: r, y: 0 },
    { x: width - r, y: 0 },
    ...arcPoints(width - r, r, r, 270, 360, segments).slice(1),
    { x: width, y: height - r },
    ...arcPoints(width - r, height - r, r, 0, 90, segments).slice(1),
    { x: r, y: height },
    ...arcPoints(r, height - r, r, 90, 180, segments).slice(1),
    { x: 0, y: r },
    ...arcPoints(r, r, r, 180, 270, segments).slice(1, -1),
  ]
}

/** Barra com cantos arredondados à esquerda e corte reto na direita. */
function leftBarOutline(width: number, height: number, radius: number, segments = 6): TokenTrackerPoint[] {
  const r = clamp(radius, 0, Math.min(width / 2, height / 2))
  if (r === 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]
  }

  return [
    { x: r, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: r, y: height },
    ...arcPoints(r, height - r, r, 90, 180, segments).slice(1),
    { x: 0, y: r },
    ...arcPoints(r, r, r, 180, 270, segments).slice(1, -1),
  ]
}

/**
 * Pontos do preenchimento da barra, relativos ao canto superior esquerdo.
 *
 * `fillPortion` vai de 0 a 1. Valores muito pequenos (menos de um raio de
 * largura) caem num arredondado pequeno inteiro, para a barra nunca "desaparecer"
 * nem virar uma faixa de altura errada.
 */
export function roundedBarPoints(
  width: number,
  height: number,
  radius: number,
  fillPortion = 1
): TokenTrackerPoint[] {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  if (w <= 0 || h <= 0) return []
  if (fillPortion <= 0) return []
  if (fillPortion >= 1) return fullOutline(w, h, radius)

  const r = clamp(radius, 0, Math.min(w / 2, h / 2))
  const fillWidth = w * clamp(fillPortion, 0, 1)
  if (fillWidth <= r * 2) return fullOutline(fillWidth, h, Math.min(r, fillWidth / 2))
  return leftBarOutline(fillWidth, h, r)
}
