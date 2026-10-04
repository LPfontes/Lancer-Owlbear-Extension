import type {
  TokenTrackerConfig,
  TokenTrackerPlayerVisibility,
  TokenTrackerSide,
  TokenTrackerSlotId,
} from '@/types/token-tracker'
import { DEFAULT_TOKEN_TRACKER_CONFIG, TOKEN_TRACKER_SLOT_ORDER } from '@/types/token-tracker'

/**
 * Política de visibilidade da mesa (plano §7.5).
 *
 * Puro: nada de OBR, store ou Vue. O payload vem do metadata da SALA, ou seja, é
 * dado de fora desta janela — por isso tudo aqui é sanitizado e o default é
 * sempre o conservador (`enemies: false`).
 */

/** Teto de ids ocultos publicados na sala, para o payload continuar pequeno. */
export const MAX_HIDDEN_COMBATANTS = 120

/** Default seguro: aliados e neutros visíveis; inimigos só quando o GM liberar. */
export const DEFAULT_PLAYER_VISIBILITY: TokenTrackerPlayerVisibility = {
  allies: true,
  enemies: false,
  neutral: true,
  hiddenCombatantIds: [],
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Normaliza o lado de um combatente. Qualquer coisa fora da taxonomia (incluindo
 * um combatente que a janela não conhece) vira `unknown`, que é tratado como
 * neutro na política.
 */
export function normalizeSide(value: unknown): TokenTrackerSide | 'unknown' {
  if (value === 'ally' || value === 'enemy' || value === 'neutral') return value
  return 'unknown'
}

/**
 * Sanitiza o `playerVisibility` lido do metadata da sala.
 *
 * Nunca lança: entrada ausente, corrompida ou de tipo errado cai no default
 * seguro. A lista de ocultos é deduplicada, limpa e truncada.
 */
export function sanitizePlayerVisibility(value: unknown): TokenTrackerPlayerVisibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PLAYER_VISIBILITY }
  }

  const raw = value as Partial<TokenTrackerPlayerVisibility>

  const hidden: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw.hiddenCombatantIds)) {
    for (const entry of raw.hiddenCombatantIds) {
      if (hidden.length >= MAX_HIDDEN_COMBATANTS) break
      if (typeof entry !== 'string') continue
      const id = entry.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      hidden.push(id)
    }
  }

  return {
    allies: toBoolean(raw.allies, DEFAULT_PLAYER_VISIBILITY.allies),
    enemies: toBoolean(raw.enemies, DEFAULT_PLAYER_VISIBILITY.enemies),
    neutral: toBoolean(raw.neutral, DEFAULT_PLAYER_VISIBILITY.neutral),
    hiddenCombatantIds: hidden,
  }
}

/**
 * O lado passa pela política? `unknown` (combatente fora de qualquer encontro que
 * esta janela conheça) cai no balde neutro de propósito.
 */
export function isSideAllowed(
  side: TokenTrackerSide | 'unknown',
  visibility: TokenTrackerPlayerVisibility
): boolean {
  switch (side) {
    case 'ally':
      return visibility.allies
    case 'enemy':
      return visibility.enemies
    case 'neutral':
    case 'unknown':
      return visibility.neutral
    default:
      return visibility.neutral
  }
}

/** O combatente está oculto para os jogadores (Fog of War do GM)? */
export function isCombatantHidden(
  combatantId: string | null | undefined,
  hiddenFromPlayers: boolean | undefined,
  visibility: TokenTrackerPlayerVisibility
): boolean {
  if (hiddenFromPlayers === true) return true
  if (!combatantId) return false
  return visibility.hiddenCombatantIds.includes(combatantId)
}

/** Teto de quadrados por trilha, para uma config corrompida não virar mil itens. */
const MAX_SQUARES_LIMIT = 40

/** Distância máxima (para cima ou para baixo) entre o token e o painel. */
const MAX_PANEL_GAP = 30

/**
 * Sanitiza a config da sala. Vem do metadata da SALA (dado de fora desta janela),
 * então nada é confiado: campos com tipo errado caem no default, o teto de
 * quadrados é limitado e a política passa pelo seu próprio sanitizador.
 */
export function sanitizeTokenTrackerConfig(value: unknown): TokenTrackerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TOKEN_TRACKER_CONFIG, playerVisibility: { ...DEFAULT_PLAYER_VISIBILITY } }
  }

  const raw = value as Partial<TokenTrackerConfig>

  const slots: Partial<Record<TokenTrackerSlotId, boolean>> = {}
  if (raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots)) {
    for (const slot of TOKEN_TRACKER_SLOT_ORDER) {
      const flag = (raw.slots as Record<string, unknown>)[slot]
      if (typeof flag === 'boolean') slots[slot] = flag
    }
  }

  const maxSquaresRaw = Number(raw.maxSquares)
  const panelGapRaw = Number(raw.panelGap)

  return {
    enabled: toBoolean(raw.enabled, DEFAULT_TOKEN_TRACKER_CONFIG.enabled),
    invertSquares: toBoolean(raw.invertSquares, DEFAULT_TOKEN_TRACKER_CONFIG.invertSquares),
    maxSquares: Number.isFinite(maxSquaresRaw)
      ? Math.min(Math.max(Math.trunc(maxSquaresRaw), 1), MAX_SQUARES_LIMIT)
      : DEFAULT_TOKEN_TRACKER_CONFIG.maxSquares,
    panelGap: Number.isFinite(panelGapRaw)
      ? Math.min(Math.max(panelGapRaw, -MAX_PANEL_GAP), MAX_PANEL_GAP)
      : DEFAULT_TOKEN_TRACKER_CONFIG.panelGap,
    showBlindagemWhenZero: toBoolean(
      raw.showBlindagemWhenZero,
      DEFAULT_TOKEN_TRACKER_CONFIG.showBlindagemWhenZero
    ),
    slots,
    playerVisibility: sanitizePlayerVisibility(raw.playerVisibility),
  }
}
