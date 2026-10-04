import type { TokenTrackerValues } from '@/types/token-tracker'
import {
  TRACKER_STAT_KEYS,
  type TokenTrackerBinding,
  type TokenTrackerStatReader,
} from '@/services/tokenTrackerModel'

/**
 * Logs de diagnóstico dos token trackers.
 *
 * Vêm LIGADOS por padrão (foi o pedido: "deixa ativo" para acompanhar a
 * sincronização com a ficha em sala). Para silenciar:
 *
 * 1. no console da janela da extensão: `__ccTokenTracker.disable()` — vale na hora;
 * 2. `localStorage.setItem('cc_token_tracker_debug', '0')` + recarregar (persiste).
 *
 * Com o modo ligado, `__ccTokenTracker.dump()` imprime uma tabela por token
 * vinculado explicando por que ele (não) está desenhado — é a resposta para
 * "está vazio".
 *
 * O volume é contido pelo debounce do serviço (200 ms por rajada), então a saída
 * é uma linha por token que realmente mudou.
 */

const LOG_PREFIX = '[TokenTracker]'
const STORAGE_KEY = 'cc_token_tracker_debug'
/** Valor gravado para DESLIGAR; a ausência da chave significa ligado. */
const STORAGE_VALUE_OFF = '0'

let override: boolean | null = null

/** O modo de diagnóstico está ligado? (ligado, salvo se alguém desligar) */
export function isTokenTrackerDebugEnabled(): boolean {
  if (override !== null) return override
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === STORAGE_VALUE_OFF) {
      return false
    }
  } catch {
    // localStorage indisponível: segue ligado
  }
  return true
}

/** Liga/desliga na hora (usado pelo helper de console). Não imprime nada. */
export function setTokenTrackerDebug(value: boolean): void {
  override = value
  if (typeof localStorage === 'undefined') return
  try {
    if (value) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, STORAGE_VALUE_OFF)
  } catch {
    // só o override em memória vale
  }
}

/** Descarta o override em memória (testes): o default volta a valer. */
export function resetTokenTrackerDebug(): void {
  override = null
}

export function tokenTrackerLog(scope: string, message: string, data?: unknown): void {
  if (!isTokenTrackerDebugEnabled()) return
  if (data === undefined) console.log(`${LOG_PREFIX}[${scope}] ${message}`)
  else console.log(`${LOG_PREFIX}[${scope}] ${message}`, data)
}

export function tokenTrackerWarn(scope: string, message: string, data?: unknown): void {
  if (!isTokenTrackerDebugEnabled()) return
  if (data === undefined) console.warn(`${LOG_PREFIX}[${scope}] ${message}`)
  else console.warn(`${LOG_PREFIX}[${scope}] ${message}`, data)
}

/** Vínculo em uma linha, para não poluir o log com objeto aninhado. */
export function summarizeBinding(binding: TokenTrackerBinding | null | undefined): string {
  if (!binding) return 'sem vínculo'
  const parts = [`sheetType=${binding.sheetType ?? '?'}`, `sheetId=${binding.sheetId}`]
  if (binding.mechId) parts.push(`mechId=${binding.mechId}`)
  if (binding.combatantId) parts.push(`combatantId=${binding.combatantId}`)
  return parts.join(' ')
}

/** Valores em uma linha: `pv 12/20, ov 4, heat 3/8, ...` */
export function summarizeValues(values: TokenTrackerValues | null | undefined): string {
  if (!values) return '(sem valores)'
  const order = ['pv', 'overshield', 'heat', 'speed', 'structure', 'stress'] as const
  const parts: string[] = []
  for (const slot of order) {
    const value = values[slot]
    if (!value) continue
    parts.push(slot === 'overshield' ? `ov ${value.current}` : `${slot} ${value.current}/${value.max}`)
  }
  return parts.length ? parts.join(', ') : '(sem valores)'
}

/**
 * Lê CRU as chaves que o serviço usa no `StatController`.
 *
 * É o que separa "a ficha tem valores" de "estou lendo a chave errada": se
 * `hp`/`heatcap`/`overshield` vierem `undefined` aqui, o problema é o mapeamento
 * (ou o `StatController` não foi inicializado), não o desenho.
 *
 * As chaves saem do MESMO mapa que o desenho usa (`TRACKER_STAT_KEYS`), para o
 * diagnóstico não divergir do serviço — calor é `heat`/`heatcap`, por exemplo.
 */
export function dumpRawStats(reader: TokenTrackerStatReader | null | undefined): Record<string, unknown> | null {
  if (!reader || typeof reader.getCurrent !== 'function') return null
  const out: Record<string, unknown> = {}
  for (const [slot, keys] of Object.entries(TRACKER_STAT_KEYS)) {
    try {
      out[`${slot}.current (${keys.current})`] = reader.getCurrent(keys.current)
      out[`${slot}.max (${keys.max})`] = reader.getMax(keys.max)
    } catch (err) {
      out[slot] = `erro: ${String(err)}`
    }
  }
  return out
}

export interface TokenTrackerDebugApi {
  /** Tabela por token vinculado explicando o estado atual. */
  dump: () => Promise<unknown>
}

/**
 * Publica `window.__ccTokenTracker` na janela para depurar dentro da sala (o
 * console do iframe da extensão é quem vê estes logs, não o console do topo).
 */
export function installTokenTrackerDebugConsole(api: TokenTrackerDebugApi): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>).__ccTokenTracker = {
    enable: () => {
      setTokenTrackerDebug(true)
      console.log(`${LOG_PREFIX} diagnóstico LIGADO (use dump() para a tabela por token)`)
    },
    disable: () => {
      setTokenTrackerDebug(false)
      console.log(`${LOG_PREFIX} diagnóstico DESLIGADO (persistido; use enable() para voltar)`)
    },
    dump: () => api.dump(),
  }
}