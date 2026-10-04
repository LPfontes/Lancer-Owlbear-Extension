import type {
  TokenTrackerConfig,
  TokenTrackerSummary,
  TokenTrackerValues,
} from '@/types/token-tracker'
import { TOKEN_TRACKER_SUMMARY_VERSION } from '@/types/token-tracker'

/**
 * Resumo dos trackers gravado no metadata do TOKEN (plano §7.6).
 *
 * Puro: monta, valida, compara e decide *quando* publicar. Quem fala com o OBR é
 * `tokenTrackerService.ts`; aqui não há SDK, store nem Vue.
 *
 * O resumo é um ESPELHO derivado da ficha: nunca é lido de volta para atualizar
 * ficha nenhuma. Ele existe para uma janela que não tem a ficha (tipicamente a do
 * jogador) conseguir desenhar o token — e só carrega os 6 números.
 */

/** Tamanho máximo aceito para o campo `w` (quem gravou). */
const MAX_WRITER_LENGTH = 64

/** Intervalo mínimo entre duas gravações do MESMO escritor para o mesmo token. */
export const SUMMARY_WRITE_THROTTLE_MS = 1000

/**
 * Janela de cortesia para um escritor diferente: se outro cliente gravou há
 * pouco, este espera em vez de brigar (o GM, que tem a visão completa, manda).
 */
export const SUMMARY_OTHER_WRITER_GRACE_MS = 3000

function toFiniteInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

function clampNonNegative(value: unknown): number {
  return Math.max(0, toFiniteInt(value, 0))
}

/**
 * Monta o resumo a partir dos valores resolvidos. Slots ausentes viram zero para
 * o formato ficar sempre com as 6 chaves (leitura mais simples e previsível).
 */
export function valuesToSummary(
  values: TokenTrackerValues,
  writer: string,
  updatedAt: number
): TokenTrackerSummary {
  const meter = (id: keyof TokenTrackerValues): [number, number] => {
    const value = values[id]
    return [clampNonNegative(value?.current), clampNonNegative(value?.max)]
  }

  return {
    v: TOKEN_TRACKER_SUMMARY_VERSION,
    pv: meter('pv'),
    ov: clampNonNegative(values.overshield?.current),
    heat: meter('heat'),
    sp: meter('speed'),
    st: meter('structure'),
    ss: meter('stress'),
    w: normalizeWriter(writer),
    t: toFiniteInt(updatedAt, 0),
  }
}

function normalizeWriter(writer: unknown): string {
  if (typeof writer !== 'string') return 'unknown'
  const trimmed = writer.trim()
  if (!trimmed) return 'unknown'
  return trimmed.slice(0, MAX_WRITER_LENGTH)
}

/** Reconstrói os valores desenháveis a partir de um resumo JÁ sanitizado. */
export function summaryToValues(summary: TokenTrackerSummary): TokenTrackerValues {
  return {
    pv: { current: summary.pv[0], max: summary.pv[1] },
    overshield: { current: summary.ov, max: summary.ov },
    heat: { current: summary.heat[0], max: summary.heat[1] },
    speed: { current: summary.sp[0], max: summary.sp[1] },
    structure: { current: summary.st[0], max: summary.st[1] },
    stress: { current: summary.ss[0], max: summary.ss[1] },
  }
}

function readMeter(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const current = Number(value[0])
  const max = Number(value[1])
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null
  return [Math.max(0, Math.trunc(current)), Math.max(0, Math.trunc(max))]
}

/**
 * Sanitiza um resumo vindo do metadata do token (dado de fora desta janela).
 *
 * Devolve `null` — e o token fica "sem dados aqui" — quando a versão não bate ou
 * falta qualquer uma das 6 chaves. Nada aqui confia no formato de entrada.
 */
export function sanitizeTokenTrackerSummary(value: unknown): TokenTrackerSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const raw = value as Record<string, unknown>
  if (raw.v !== TOKEN_TRACKER_SUMMARY_VERSION) return null

  const pv = readMeter(raw.pv)
  const heat = readMeter(raw.heat)
  const sp = readMeter(raw.sp)
  const st = readMeter(raw.st)
  const ss = readMeter(raw.ss)
  const ov = Number(raw.ov)
  if (!pv || !heat || !sp || !st || !ss || !Number.isFinite(ov)) return null

  return {
    v: TOKEN_TRACKER_SUMMARY_VERSION,
    pv,
    ov: Math.max(0, Math.trunc(ov)),
    heat,
    sp,
    st,
    ss,
    w: normalizeWriter(raw.w),
    t: toFiniteInt(raw.t, 0),
  }
}

/**
 * Assinatura só dos VALORES: `w` e `t` ficam de fora de propósito, para o diff
 * não considerar "mudou" quando apenas o autor/timestamp mudou.
 */
export function summaryValueSignature(summary: TokenTrackerSummary | null): string {
  if (!summary) return ''
  return [summary.v, summary.pv, summary.ov, summary.heat, summary.sp, summary.st, summary.ss].join(
    '|'
  )
}

/**
 * Força de quem gravou o resumo — e, do outro lado, de quem o está lendo.
 *
 * O app tem MAIS DE UMA cópia do mecha: o encontro ativo (`EncounterInstance` faz
 * `Pilot.Deserialize` do piloto) é onde o GM realmente edita durante o combate, e a
 * ficha do modo ativo (`pilot_sheets`) guarda o estado de fora do combate. Uma
 * janela que só tem a ficha (a de chat, por exemplo) gravaria calor 0 por cima do
 * calor 3 que o GM acabou de aplicar no encontro.
 *
 * Por isso o escritor vai identificado (`gm/encounter`, `gm/sheet`, `p…/sheet`) e a
 * força decide: fonte mais forte manda na hora; fonte mais fraca não passa por cima.
 */
export function writerRank(writer: unknown): number {
  if (typeof writer !== 'string') return 0
  if (writer.includes('encounter')) return 2
  if (writer.includes('sheet')) return 1
  return 0
}

/** Identificador do escritor do resumo, com a fonte embutida. */
export function summaryWriterId(role: 'GM' | 'PLAYER', source: 'encounter' | 'sheet', playerId = ''): string {
  if (role === 'GM') return `gm/${source}`
  const short = playerId ? `-${playerId.slice(0, 8)}` : ''
  return `p${short}/${source}`
}

export interface SummaryWriterInput {
  /** Papel desta janela no Owlbear. */
  role: 'GM' | 'PLAYER'
  /** Ids do piloto/mecha ATIVO desta janela (ficha própria). Vazio para o GM. */
  ownSheetIds: string[]
  /** Vínculo do token (`com.compcon.activemode`). */
  binding: { sheetType?: string; sheetId?: string; mechId?: string } | null | undefined
  config: TokenTrackerConfig
}

/**
 * Esta janela é a escritora do resumo DESTE token?
 *
 * O GM presente na sala escreve todos (ele tem o encontro inteiro); sem GM, cada
 * jogador escreve apenas os tokens da própria ficha. Sem vínculo, ou com os
 * trackers desligados, ninguém escreve.
 */
export function shouldWriteSummary(input: SummaryWriterInput): boolean {
  if (!input.config.enabled) return false

  const binding = input.binding
  if (!binding || !binding.sheetId) return false

  if (input.role === 'GM') return true

  const own = new Set(input.ownSheetIds.filter(id => typeof id === 'string' && id !== ''))
  if (own.has(binding.sheetId)) return true
  if (binding.mechId && own.has(binding.mechId)) return true
  return false
}

export interface PublishSummaryOptions {
  throttleMs?: number
  otherWriterGraceMs?: number
}

/**
 * Vale a pena gravar `next` agora, considerando o que já está no token (`prev`)?
 *
 * Corta quatro desperdícios: valores idênticos (nada mudou), regravação rápida do
 * mesmo escritor (throttle), briga com outro escritor que acabou de gravar — e a
 * inversão de força entre fontes, que é o caso perigoso: uma janela que só tem a
 * ficha (calor 0) não pode passar por cima do encontro ativo (calor 3).
 */
export function shouldPublishSummary(
  prev: TokenTrackerSummary | null,
  next: TokenTrackerSummary,
  now: number,
  options: PublishSummaryOptions = {}
): boolean {
  const throttleMs = options.throttleMs ?? SUMMARY_WRITE_THROTTLE_MS
  const otherWriterGraceMs = options.otherWriterGraceMs ?? SUMMARY_OTHER_WRITER_GRACE_MS

  if (!prev) return true
  if (summaryValueSignature(prev) === summaryValueSignature(next)) return false

  const prevRank = writerRank(prev.w)
  const nextRank = writerRank(next.w)

  // Fonte mais forte manda na hora, sem esperar throttle nem cortesia.
  if (nextRank > prevRank) return true
  // Fonte mais fraca NUNCA sobrescreve uma mais forte (o encontro é a verdade do GM).
  if (nextRank < prevRank) return false

  const elapsed = now - prev.t
  if (prev.w === next.w) return elapsed >= throttleMs
  return elapsed >= otherWriterGraceMs
}
