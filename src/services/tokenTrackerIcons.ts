/**
 * Ícones do painel de trackers no canvas.
 *
 * O Owlbear não carrega a fonte MDI em itens de TEXTO (a fonte é só do app), então
 * o ícone vai como ITEM DE IMAGEM apontando para um SVG estático em
 * `public/tracker-icons/` — mesmo caminho que os marcadores de status usam
 * (`services/statusIcons.ts`). Precisa ser URL http(s) absoluta: o loader do
 * Owlbear não renderiza `data:` URL.
 */

/** Nome lógico → arquivo em `public/tracker-icons`. */
export const TRACKER_ICON_FILES = {
  /** `mdi-arrow-right-bold-hexagon-outline` (o mesmo ícone de Movimento do app). */
  speed: 'speed',
  /** Círculo com play: ATIVAR o registro de movimento deste token (menu de contexto). */
  movement: 'movement',
  /** Círculo com stop: PARAR o registro de movimento deste token. */
  'movement-stop': 'movement-stop',
} as const

export type TokenTrackerIconName = keyof typeof TRACKER_ICON_FILES

/** URL absoluta do ícone (o loader do Owlbear exige http/https). */
export function getTrackerIconUrl(name: TokenTrackerIconName | string): string {
  const file = (TRACKER_ICON_FILES as Record<string, string>)[name] ?? name
  const origin =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin
      : ''
  return `${origin}/tracker-icons/${file}.svg`
}
