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

/**
 * Topo usado quando a janela é criada sem posição salva (encostada na direita).
 * É mais folgado que `TOP_RIGHT` de propósito: a criação acontece com a interface
 * do Owlbear em estado inicial, quando a barra superior costuma estar expandida.
 */
export const OBR_TOP_DEFAULT = 50

/** Largura da janela cheia (única: não existe mais "compacta" de 520px). */
export const WINDOW_WIDTH = 500

/** Altura da janela cheia quando não há nenhuma salva. */
export const WINDOW_HEIGHT_DEFAULT = 800

/** Menor altura aceita — piso do arrasto do usuário e do que é lido do storage. */
export const WINDOW_HEIGHT_MIN = 450

/** Teto de altura (arrasto do usuário e persistência). */
export const WINDOW_HEIGHT_MAX = 900

/**
 * Piso do cálculo quando o viewport é baixo: a janela nunca é encolhida abaixo
 * disto para caber, mesmo que o resultado estoure o `BOTTOM`.
 */
export const WINDOW_HEIGHT_FIT_MIN = 480

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
