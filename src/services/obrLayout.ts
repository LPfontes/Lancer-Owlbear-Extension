/**
 * Geometria da janela da ficha: fonte única das margens e dos tamanhos.
 *
 * Existe porque dois módulos precisam responder "que tamanho e onde fica a
 * janela?" — `windowManager` (posiciona/redimensiona) e `mainWindow` (cria, oculta
 * e reexibe o popover) — e cada um tinha a própria cópia das margens e das
 * dimensões, já divergentes (LEFT 84 × 70, largura 520 × 500, teto de altura
 * 840 × 900, altura padrão 720 × 800). Um módulo sem dependências resolve isso sem
 * criar ciclo de importação (`windowManager` já importa `mainWindow`).
 *
 * Regra de ouro desta geometria: **posição só existe na criação do popover**. O
 * SDK não tem `setPosition`/`getPosition`: `anchorPosition` no `OBR.popover.open`
 * é a única forma de colocar a janela na tela, e um arrasto manual do usuário não
 * pode ser lido de volta pelo app.
 */

/** Id do popover persistente da ficha (`windowManager` e `mainWindow` usam o mesmo). */
export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

/**
 * Margens de segurança para não sobrepor a interface nativa do Owlbear Rodeo:
 * - LEFT/RIGHT: barra de ferramentas vertical (esquerda) e menu lateral (direita)
 * - TOP_LEFT: barra superior esquerda (logo Home, Players, extensões)
 * - TOP_RIGHT: margem limpa quando a janela está encostada na direita
 * - BOTTOM: dock inferior (tokens/cenas, botão de grid de 1m e extras)
 */
export const OBR_SAFE_MARGIN = {
  LEFT: 70,
  TOP_LEFT: 64,
  TOP_RIGHT: 16,
  BOTTOM: 96,
  RIGHT: 70,
} as const

/** Topo usado quando a janela é criada sem posição salva (encostada na direita).
 * É mais folgado que `TOP_RIGHT` de propósito: a criação acontece com a interface
 * do Owlbear em estado inicial, quando a barra superior costuma estar expandida.
 */
export const OBR_TOP_DEFAULT = 50

/**
 * Janela cheia: proporcional ao viewport real, nunca um tamanho fixo.
 *
 * Quem limita a janela é o **viewport do Owlbear** (a área do VTT, que é a própria
 * janela do navegador), não o monitor: `window.screen.availWidth` pode ser bem maior
 * que a janela do navegador e, como o SDK não tem `setPosition`, uma largura chutada
 * deixaria a ficha fora da área visível até ser fechada e reaberta.
 */
export const WINDOW_WIDTH_RATIO = 0.32

/** Piso da largura: abaixo disto a ficha deixa de ser utilizável em telas estreitas. */
export const WINDOW_WIDTH_MIN = 420

/** Teto da largura: em telas muito largas uma ficha gigante só afasta o mapa. */
export const WINDOW_WIDTH_MAX = 820

/** Teto da altura, como fração do viewport (o resto fica de mapa visível). */
export const WINDOW_HEIGHT_VIEWPORT_RATIO = 0.92

/**
 * Piso da altura. Num viewport baixo o piso vence o espaço livre — a janela prefere
 * estourar a dock inferior a ficar com poucas linhas visíveis.
 */
export const WINDOW_HEIGHT_MIN = 480

/**
 * Último recurso quando nem o SDK nem o DOM respondem uma medida (SSR, testes sem
 * viewport): é um valor de emergência, não o tamanho esperado da janela.
 */
export const VIEWPORT_FALLBACK = { width: 1280, height: 720 } as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isUsable(size?: { width?: number; height?: number }): boolean {
  return (
    !!size &&
    typeof size.width === 'number' &&
    typeof size.height === 'number' &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  )
}

/**
 * Escolhe a medida real da área útil entre as fontes disponíveis, em ordem de
 * confiança: viewport do Owlbear → janela do navegador → monitor.
 *
 * Puro de propósito (a leitura do SDK/DOM fica nos serviços) e sem valores fixos no
 * meio do caminho: um 1920×1080 "chutado" só era substituído se o viewport passasse
 * de 500px, então num viewport estreito a geometria usava um tamanho inventado.
 */
export function pickViewportSize(sources: {
  obr?: { width?: number; height?: number }
  inner?: { width?: number; height?: number }
  screen?: { width?: number; height?: number }
}): { screenW: number; screenH: number } {
  if (isUsable(sources.obr)) return { screenW: sources.obr!.width!, screenH: sources.obr!.height! }
  if (isUsable(sources.inner)) {
    return { screenW: sources.inner!.width!, screenH: sources.inner!.height! }
  }
  if (isUsable(sources.screen)) {
    return { screenW: sources.screen!.width!, screenH: sources.screen!.height! }
  }
  return { screenW: VIEWPORT_FALLBACK.width, screenH: VIEWPORT_FALLBACK.height }
}

/** Largura da janela cheia para um viewport real (px). */
export function sheetWindowWidth(viewportW: number): number {
  if (!Number.isFinite(viewportW) || viewportW <= 0) return WINDOW_WIDTH_MIN
  return Math.round(clamp(viewportW * WINDOW_WIDTH_RATIO, WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX))
}

/**
 * Mantém a janela dentro das margens seguras do Owlbear.
 *
 * Mesma regra para **criar** (`mainWindow.computeGeometry`) e para **redimensionar**
 * (`windowManager`): sem isto, uma posição salva quando a janela era mais estreita
 * passaria da borda direita assim que a largura proporcional aumentasse.
 */
export function clampSheetPosition(
  pos: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const minLeft = OBR_SAFE_MARGIN.LEFT
  const maxLeft = Math.max(minLeft, viewport.width - size.width - OBR_SAFE_MARGIN.RIGHT)
  const left = Math.max(minLeft, Math.min(pos.left, maxLeft))

  // No lado esquerdo da tela vivem a barra de ferramentas e o logo/jogadores: ali o
  // topo precisa começar abaixo deles.
  const minTop = left < LEFT_SIDE_THRESHOLD ? OBR_SAFE_MARGIN.TOP_LEFT : OBR_SAFE_MARGIN.TOP_RIGHT
  const maxTop = Math.max(minTop, viewport.height - size.height - OBR_SAFE_MARGIN.BOTTOM)
  const top = Math.max(minTop, Math.min(pos.top, maxTop))

  return { left: Math.round(left), top: Math.round(top) }
}

/**
 * Altura da janela cheia para um viewport real: ocupa o espaço livre entre `top` e a
 * dock inferior, sem passar de `WINDOW_HEIGHT_VIEWPORT_RATIO` do viewport.
 */
export function sheetWindowHeight(viewportH: number, top: number = OBR_SAFE_MARGIN.TOP_RIGHT): number {
  if (!Number.isFinite(viewportH) || viewportH <= 0) return WINDOW_HEIGHT_MIN
  const free = viewportH - top - OBR_SAFE_MARGIN.BOTTOM
  const cap = viewportH * WINDOW_HEIGHT_VIEWPORT_RATIO
  return Math.round(Math.max(WINDOW_HEIGHT_MIN, Math.min(cap, free)))
}

/**
 * Barra compacta (janela minimizada): 100×48 no left seguro.
 *
 * O LEFT é a razão de existir destas constantes. Como o SDK não permite mover um
 * popover vivo, o left especial só tem efeito quando o popover é **criado** já
 * minimizado — ver `mainWindow.computeGeometry`. O `BAR_TOP` fica abaixo da barra
 * superior esquerda do Owlbear (o mesmo `TOP_LEFT` acima).
 */
export const BAR_WIDTH = 100
export const BAR_HEIGHT = 48
export const BAR_LEFT = 90
export const BAR_TOP = 64

/**
 * A partir de que `left` a janela é considerada "do lado esquerdo" da tela — onde
 * vivem a barra de ferramentas e o logo/players, exigindo `TOP_LEFT` em vez de
 * `TOP_RIGHT` (ver `windowManager.clampPosition`).
 */
export const LEFT_SIDE_THRESHOLD = 450
