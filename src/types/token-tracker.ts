/**
 * Tipos do serviço de token trackers LANCER (PV, Blindagem, Calor, Movimento,
 * Estrutura, Estresse).
 *
 * Plano detalhado: `plano_token_trackers_lancer.md`.
 *
 * Este arquivo é puro: nada de OBR, Pinia, Vue ou acesso a ficha. Quem conversa
 * com o SDK e com os stores é `services/tokenTrackerService.ts`.
 */

/** Formas que o serviço sabe desenhar no mapa. */
export type TokenTrackerKind = 'bar' | 'number' | 'squares'

/**
 * Slot lógico do painel. A ordem de `LANCER_TOKEN_TRACKER_SLOTS` é a ordem de
 * cima para baixo no mapa.
 */
export type TokenTrackerSlotId = 'pv' | 'overshield' | 'heat' | 'speed' | 'structure' | 'stress'

/** Lado do combatente — mesma taxonomia já usada pelo tracker de iniciativa. */
export type TokenTrackerSide = 'ally' | 'enemy' | 'neutral'

export interface TokenTrackerSlot {
  id: TokenTrackerSlotId
  kind: TokenTrackerKind
  /**
   * Chave i18n do rótulo. Usada SÓ na UI (chips do painel de configuração): o
   * painel no mapa não escreve nomes.
   */
  labelKey: string
  /** Cor do slot nos itens do mapa. */
  color: string
  /** Slot desenhado ao lado deste — a Blindagem fica ao lado da barra de PV. */
  pairWith?: TokenTrackerSlotId
  /** Onde o slot é desenhado. `top-left` = badge no canto superior esquerdo do token. */
  placement?: 'panel' | 'top-left'
  /** Nome do ícone em `public/tracker-icons` (só nos slots de canto). */
  icon?: string
}

export interface TokenTrackerValue {
  current: number
  max: number
}

export type TokenTrackerValues = Partial<Record<TokenTrackerSlotId, TokenTrackerValue>>

/**
 * De onde saiu o valor desenhado. A ficha local (quando existe) sempre ganha do
 * resumo gravado no token; a UI pode usar isso para sinalizar dado mais velho.
 */
export type TokenTrackerValueSource = 'sheet' | 'token'

export type TokenTrackerValueOrigins = Partial<Record<TokenTrackerSlotId, TokenTrackerValueSource>>

/////////////////////////////////////////////////////////////////////
// Resumo no metadata do token (plano §7.6)
/////////////////////////////////////////////////////////////////////

/** Versão do formato do resumo. Leitura rejeita o que não bate. */
export const TOKEN_TRACKER_SUMMARY_VERSION = 1

/**
 * Resumo compacto dos 6 valores, gravado no metadata do token.
 *
 * É a única coisa derivada de ficha que cruza a mesa além do vínculo. Contém SÓ
 * os números — nunca nome, retrato, tags, itens, condições ou ficha serializada.
 */
export interface TokenTrackerSummary {
  /** Versão do formato. */
  v: typeof TOKEN_TRACKER_SUMMARY_VERSION
  /** PV: [atual, máximo]. */
  pv: [number, number]
  /** Blindagem (overshield): valor atual. */
  ov: number
  /** Calor: [atual, capacidade]. */
  heat: [number, number]
  /** Movimento/Velocidade: [atual, máximo]. */
  sp: [number, number]
  /** Estrutura: [atual, máximo]. */
  st: [number, number]
  /** Estresse: [atual, máximo]. */
  ss: [number, number]
  /** Quem gravou por último: 'gm' ou id curto do jogador. Desempata corrida. */
  w: string
  /** Timestamp da gravação (ms). */
  t: number
}

/** Chave do resumo no metadata do token. Distinta do vínculo (COMPCON_METADATA_KEY). */
export const TOKEN_TRACKER_SUMMARY_KEY = 'com.compcon.activemode/trackers'

/** Marca os itens LOCAIS de desenho criados por este serviço. */
export const TOKEN_TRACKER_ITEM_METADATA_KEY = 'com.compcon.token_tracker'

/** Slot de um item de desenho (para diff e limpeza por slot). */
export const TOKEN_TRACKER_ITEM_SLOT_KEY = 'com.compcon.token_tracker/slot'

/** Id do registro de preferências locais da janela (exigido pelo SetItem). */
export const TOKEN_TRACKER_LOCAL_PREFS_ID = 'token_tracker_prefs'

/////////////////////////////////////////////////////////////////////
// Visibilidade e configuração da mesa
/////////////////////////////////////////////////////////////////////

/**
 * Política da MESA: o que um jogador pode ver. Decidida pelo GM, gravada no
 * metadata da sala. Apenas a REGRA cruza a mesa; os valores vêm da ficha local
 * ou do resumo do token.
 */
export interface TokenTrackerPlayerVisibility {
  /** Jogadores veem trackers de aliados. Padrão: true. */
  allies: boolean
  /** Jogadores veem trackers de inimigos. Padrão: false — o GM libera. */
  enemies: boolean
  /** Jogadores veem trackers de neutros/sem lado. Padrão: true. */
  neutral: boolean
  /**
   * Combatentes ocultos para os jogadores (o Fog of War do GM, hoje
   * `hiddenFromPlayers` no encontro). Nunca aparecem em janela de jogador.
   */
  hiddenCombatantIds: string[]
}

/** Configuração (pequena) gravada por sala — só em ação do usuário. */
export interface TokenTrackerConfig {
  enabled: boolean
  /** false (padrão) = quadrados preenchidos são o valor ATUAL/restante. */
  invertSquares: boolean
  /** Trava de segurança: nunca desenhar mais que isso em cada trilha de quadrados. */
  maxSquares: number
  /**
   * Distância entre o token e o painel, em unidades de cena.
   *
   * Negativo aproxima (o painel sobe e pode encostar no token); positivo afasta.
   * Faixa segura na sanitização: -30..30.
   */
  panelGap: number
  /** Esconde o número da Blindagem quando o escudo está zerado. */
  showBlindagemWhenZero: boolean
  /** Slot→ligado/desligado, permite ao GM enxugar o painel. */
  slots: Partial<Record<TokenTrackerSlotId, boolean>>
  /** O que os jogadores podem ver. Ignorado na janela do GM. */
  playerVisibility: TokenTrackerPlayerVisibility
}

export const DEFAULT_TOKEN_TRACKER_CONFIG: TokenTrackerConfig = {
  enabled: true,
  invertSquares: false,
  maxSquares: 12,
  panelGap: 0,
  showBlindagemWhenZero: false,
  slots: {},
  playerVisibility: {
    allies: true,
    enemies: false,
    neutral: true,
    hiddenCombatantIds: [],
  },
}

/**
 * Preferências LOCAIS da janela (não vão para metadata nenhum).
 *
 * A watchlist é a lista de tokens que ESTA janela desenha. Ela começa implícita
 * (todo token permitido pela política com valores disponíveis) e cresce/encolhe
 * por ação do usuário.
 */
export interface TokenTrackerLocalPrefs {
  id: typeof TOKEN_TRACKER_LOCAL_PREFS_ID
  /** tokenIds explicitamente adicionados pelo usuário. */
  watchlist: string[]
  /** tokenIds que o usuário removeu da lista automática. */
  muted: string[]
}

export const DEFAULT_TOKEN_TRACKER_LOCAL_PREFS: TokenTrackerLocalPrefs = {
  id: TOKEN_TRACKER_LOCAL_PREFS_ID,
  watchlist: [],
  muted: [],
}

/**
 * A "receita LANCER": PV com a Blindagem ao lado, Calor, Movimento, Estrutura e
 * Estresse em quadrados. Ordem desta lista = ordem de cima para baixo no mapa.
 */
/**
 * A "receita LANCER", na ordem em que o painel é desenhado de CIMA para baixo:
 * Estrutura, PV (com a Blindagem ao lado), Estresse, Calor. O Movimento fica fora
 * da pilha, no badge do canto superior esquerdo do token.
 */
export const LANCER_TOKEN_TRACKER_SLOTS: TokenTrackerSlot[] = [
  { id: 'structure', kind: 'squares', labelKey: 'stats.structure', color: '#afafafff' },
  { id: 'pv', kind: 'bar', labelKey: 'stats.hp', color: '#4dc47cff' },
  { id: 'overshield', kind: 'number', labelKey: 'common.overshield', color: '#3c86fdff', pairWith: 'pv' },
  { id: 'stress', kind: 'squares', labelKey: 'stats.stress', color: '#ca2326ff' },
  { id: 'heat', kind: 'bar', labelKey: 'ui.titles.heat', color: '#c89017ff' },
  // Movimento não entra na pilha: fica no canto superior esquerdo do token, com o
  // ícone `mdi-arrow-right-bold-hexagon-outline` ao lado do número.
  { id: 'speed', kind: 'number', labelKey: 'stats.speed', color: '#ffffffff', placement: 'top-left', icon: 'speed' },
]

/** Ordem canônica dos slots (derivada do preset, sem depender do array). */
export const TOKEN_TRACKER_SLOT_ORDER: TokenTrackerSlotId[] = LANCER_TOKEN_TRACKER_SLOTS.map(
  slot => slot.id
)
