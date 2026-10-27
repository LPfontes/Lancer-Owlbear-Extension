import type { TokenTrackerValues } from '@/types/token-tracker'
import {
  TRACKER_STAT_KEYS,
  type TokenTrackerBinding,
  type TokenTrackerStatReader,
} from '@/services/tokenTrackerModel'

/**
 * Diagnóstico dos token trackers.
 *
 * Dois níveis, porque as perguntas são diferentes:
 *
 * - **`summary` (padrão):** o que muda decisão — de onde veio o leitor, quando o token
 *   fica sem valor, slots descartados, gestos de movimento e resumo gravado. Dá para
 *   jogar com isto ligado sem o console virar parede.
 * - **`verbose`:** tudo, incluindo cada rodada de refresh e cada add/update/delete de
 *   item. É o nível que achou os bugs de sincronização (calor lido da chave errada,
 *   mecha do Hangar vencendo a ficha ativa, a cópia do encontro com o calor de verdade).
 *
 * Desligar: `__ccTokenTracker.off()` no console da JANELA DA EXTENSÃO (persiste), ou
 * `localStorage.setItem('cc_token_tracker_debug', 'off')` + reload.
 */

export type TokenTrackerLogLevel = 'off' | 'summary' | 'verbose'

const STORAGE_KEY = 'cc_token_tracker_debug'

let level: TokenTrackerLogLevel = readStoredLevel()

function readStoredLevel(): TokenTrackerLogLevel {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw === 'off' || raw === '0') return 'off'
    if (raw === 'verbose') return 'verbose'
    // Ligado por padrão: o custo é um console organizado, o benefício é não precisar
    // instrumentar nada na mão quando o painel aparece vazio no meio da sessão.
    return 'summary'
  } catch {
    return 'summary'
  }
}

function persist(next: TokenTrackerLogLevel): void {
  try {
    if (next === 'summary') globalThis.localStorage?.removeItem(STORAGE_KEY)
    else globalThis.localStorage?.setItem(STORAGE_KEY, next)
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

export function getTokenTrackerLogLevel(): TokenTrackerLogLevel {
  return level
}

export function setTokenTrackerLogLevel(next: TokenTrackerLogLevel): void {
  level = next
  persist(next)
  console.info(`[TokenTracker] logs: ${next}`)
}

function enabled(minimum: TokenTrackerLogLevel): boolean {
  if (level === 'off') return false
  return minimum === 'summary' || level === 'verbose'
}

export function tokenTrackerLog(scope: string, message: string, data?: unknown): void {
  if (!enabled('summary')) return
  if (data === undefined) console.info(`[TokenTracker][${scope}] ${message}`)
  else console.info(`[TokenTracker][${scope}] ${message}`, data)
}

/** Só no nível `verbose` — para o que sai a cada rodada de refresh. */
export function tokenTrackerTrace(scope: string, message: string, data?: unknown): void {
  if (!enabled('verbose')) return
  if (data === undefined) console.info(`[TokenTracker][${scope}] ${message}`)
  else console.info(`[TokenTracker][${scope}] ${message}`, data)
}

export function tokenTrackerWarn(scope: string, message: string, data?: unknown): void {
  if (!enabled('summary')) return
  if (data === undefined) console.warn(`[TokenTracker][${scope}] ${message}`)
  else console.warn(`[TokenTracker][${scope}] ${message}`, data)
}

/** `sheetType=pilot sheetId=… mechId=…` — curto e suficiente para achar a ficha. */
export function summarizeBinding(binding: TokenTrackerBinding | null | undefined): string {
  if (!binding) return 'sem vínculo'
  const parts = [`sheetType=${binding.sheetType ?? '?'}`, `sheetId=${binding.sheetId}`]
  if (binding.mechId) parts.push(`mechId=${binding.mechId}`)
  if (binding.combatantId) parts.push(`combatantId=${binding.combatantId}`)
  return parts.join(' ')
}

/** `pv 12/20, ov 0, heat 3/5, …` — legível e comparável de olho. */
export function summarizeValues(values: TokenTrackerValues | null | undefined): string {
  if (!values) return '(sem valores)'
  const order = ['pv', 'overshield', 'heat', 'speed', 'structure', 'stress'] as const
  const short: Record<string, string> = {
    pv: 'pv',
    overshield: 'ov',
    heat: 'heat',
    speed: 'speed',
    structure: 'structure',
    stress: 'stress',
  }
  const parts: string[] = []
  for (const slot of order) {
    const value = values[slot]
    if (!value) continue
    parts.push(`${short[slot]} ${value.current}/${value.max}`)
  }
  return parts.length ? parts.join(', ') : '(sem valores)'
}

/**
 * Leitura CRUA do `StatController` nas chaves que o serviço realmente usa.
 *
 * Existe para separar "a ficha tem outro valor" de "leio a chave errada": foi assim
 * que apareceu o calor em `heatcap` (e não em `heat`) e o máximo do Movimento em
 * `BoostedSpeed`.
 */
export function dumpRawStats(
  reader: TokenTrackerStatReader | null | undefined
): Record<string, unknown> | null {
  if (!reader || typeof reader.getCurrent !== 'function') return null

  const dump: Record<string, unknown> = {}
  for (const [slot, keys] of Object.entries(TRACKER_STAT_KEYS)) {
    dump[`${slot}.current (${keys.current})`] = safeRead(() => reader.getCurrent(keys.current))
    dump[`${slot}.max (${keys.max})`] = safeRead(() => reader.getMax(keys.max))
  }
  if (typeof reader.getBoostedSpeed === 'function') {
    dump['speed.cap (BoostedSpeed)'] = safeRead(() => reader.getBoostedSpeed!())
  }
  return dump
}

function safeRead(read: () => unknown): unknown {
  try {
    const value = read()
    return value === undefined ? '(undefined)' : value
  } catch (err) {
    return `(erro: ${String(err)})`
  }
}

/**
 * API de console. Sem isto, o nível só mudaria com reload — e o momento de querer
 * verbose é justamente quando algo acabou de dar errado.
 */
export function installTokenTrackerDebugConsole(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>).__ccTokenTracker = {
    level: () => getTokenTrackerLogLevel(),
    summary: () => setTokenTrackerLogLevel('summary'),
    verbose: () => setTokenTrackerLogLevel('verbose'),
    off: () => setTokenTrackerLogLevel('off'),
    /** Tabela por token vinculado: valores, fonte, motivo de (não) desenhar. */
    dump: () => dumpTokens(),
    /** Retrato do armazenamento DESTA janela (origem, driver, contagens). */
    storage: () => reportStorage(),
  }
}

export interface StorageReport {
  origem: string
  url: string
  janelaDaFicha: boolean
  driver: unknown
  duravel: unknown
  noArmazenamento: { pilots: number; pilot_sheets: number; npcs: number; active_encounters: number }
  /**
   * Contagem por driver, para as coleções que interessam. `undefined` = driver
   * indisponível no contexto (não confundir com 0 registros).
   */
  porDriver: Record<string, { indexeddb: number | null; localstorage: number | null }>
  /** Veredito curto: onde os dados estão e onde esta sessão os procura. */
  veredito: string
}

/**
 * Retrato do armazenamento desta janela — a ferramenta que separa "a ficha não está
 * aqui" de "esta janela não tem armazenamento".
 *
 * Motivo de existir: o app roda em vários iframes (a ficha viva na janela
 * persistente, o mapa em outra). Eles só compartilham dados se tiverem a **mesma
 * origem** — `http://localhost` e `https://localhost` (ou `127.0.0.1` vs `localhost`)
 * são origens diferentes, com IndexedDB diferente. Quando o IndexedDB é negado no
 * iframe, `Storage.ts` cai para memória e cada janela fica com o seu banco: a janela
 * do mapa mostra `0 pilotos, 0 fichas` para sempre, mesmo com a ficha aberta ao lado.
 *
 * Rode em AMBAS as janelas e compare `origem` e `driver`.
 */
export async function reportStorage(): Promise<StorageReport | null> {
  try {
    const { GetAll, inspectDrivers, storageDriver, storageIsDurable } = await import('@/io/Storage')
    const { isSheetWindowContext } = await import('@/services/mainWindow')

    const COLLECOES = ['pilots', 'pilot_sheets', 'npcs', 'active_encounters'] as const
    const [got, ...porDriverList] = await Promise.all([
      Promise.all([
        GetAll('pilots').catch(() => []),
        GetAll('pilot_sheets').catch(() => []),
        GetAll('npcs').catch(() => []),
        GetAll('active_encounters').catch(() => []),
      ]),
      ...COLLECOES.map(async collection => [collection, await inspectDrivers(collection)] as const),
    ])

    const porDriver = Object.fromEntries(porDriverList) as StorageReport['porDriver']
    const driverAtivo = String(storageDriver?.value ?? '?')
    const driverComDados = COLLECOES.filter(collection => {
      const counts = porDriver[collection]
      if (!counts) return false
      const noAtivo = driverAtivo === 'INDEXEDDB' ? counts.indexeddb : counts.localstorage
      const noOutro = driverAtivo === 'INDEXEDDB' ? counts.localstorage : counts.indexeddb
      return (noAtivo ?? 0) === 0 && (noOutro ?? 0) > 0
    })

    const veredito = driverComDados.length
      ? `ATENÇÃO: ${driverComDados.join(', ')} existem no OUTRO driver (não no ${driverAtivo}, que é o ativo). A sessão lê o driver ativo — os dados não estão perdidos, estão no outro namespace.`
      : `Sem divergência: esta sessão lê ${driverAtivo} e todas as coleções conferidas estão consistentes.`

    const report: StorageReport = {
      origem: typeof location !== 'undefined' ? location.origin : '(sem location)',
      url: typeof location !== 'undefined' ? location.href.slice(0, 140) : '',
      janelaDaFicha: isSheetWindowContext(),
      driver: storageDriver?.value,
      duravel: storageIsDurable?.value,
      noArmazenamento: {
        pilots: got[0].length,
        pilot_sheets: got[1].length,
        npcs: got[2].length,
        active_encounters: got[3].length,
      },
      porDriver,
      veredito,
    }

    console.table([report])
    console.log('[TokenTracker] por driver:', porDriver)
    console.log(`[TokenTracker] ${veredito}`)
    if (report.duravel === false) {
      console.warn(
        '[TokenTracker] armazenamento NÃO durável nesta janela: cada iframe tem um banco em memória próprio. Sirva por HTTPS na MESMA origem em todas as janelas.'
      )
    }
    return report
  } catch (err) {
    console.warn('[TokenTracker] falha ao inspecionar o armazenamento:', err)
    return null
  }
}

/** Tabela por token vinculado, montada a partir do serviço (evita import circular). */
let dumpProvider: (() => Promise<unknown[]>) | null = null

export function setTokenTrackerDumpProvider(provider: (() => Promise<unknown[]>) | null): void {
  dumpProvider = provider
}

async function dumpTokens(): Promise<unknown[]> {
  if (!dumpProvider) {
    console.warn('[TokenTracker] dump indisponível: o serviço ainda não subiu')
    return []
  }
  const rows = await dumpProvider()
  if (rows.length) console.table(rows)
  else {
    console.warn(
      '[TokenTracker] nenhum token vinculado: procure `com.compcon.activemode` no metadata do token'
    )
  }
  return rows
}

// Reexportado por conveniência de quem já importava daqui.
export { TRACKER_STAT_KEYS }
