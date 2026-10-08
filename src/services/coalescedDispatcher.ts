/**
 * Agrupamento de chamadas em rajada (debounce com teto de espera).
 *
 * Os inputs da ficha alteram o estado a cada tecla/clique; sem agrupar, cada
 * alteração vira uma requisição. `schedule()` registra a alteração e reinicia a
 * janela de silêncio; `run()` roda uma única vez, lendo o estado final da rajada.
 */

export interface CoalescedDispatcherOptions {
  /** Silêncio necessário, em ms, depois da última chamada a `schedule()`. */
  debounceMs: number
  /**
   * Teto de espera, em ms, desde a primeira chamada da rajada. Impede que uma
   * rajada contínua (segurar um botão de +/-) adie a execução para sempre.
   * Padrão: o próprio `debounceMs`.
   */
  maxWaitMs?: number
  /** Trabalho executado quando a rajada fecha. */
  run: () => void
}

export interface CoalescedDispatcher {
  /** Registra uma alteração e (re)agenda a execução. */
  schedule: () => void
  /** Executa agora o que estiver pendente; sem rajada pendente, não faz nada. */
  flush: () => void
  /** Descarta a rajada pendente sem executar. */
  cancel: () => void
  /** Há execução agendada? */
  readonly pending: boolean
}

export function createCoalescedDispatcher(options: CoalescedDispatcherOptions): CoalescedDispatcher {
  const debounceMs = Math.max(0, options.debounceMs)
  const maxWaitMs = Math.max(debounceMs, options.maxWaitMs ?? debounceMs)

  let timeout: ReturnType<typeof setTimeout> | null = null
  let burstStartedAt = 0

  function cancel(): void {
    if (timeout === null) return
    clearTimeout(timeout)
    timeout = null
  }

  function runNow(): void {
    cancel()
    options.run()
  }

  function schedule(): void {
    const now = Date.now()
    if (timeout === null) {
      burstStartedAt = now
    } else {
      clearTimeout(timeout)
    }

    // Quanto falta para o teto da rajada; se o teto já passou, executa no próximo tick.
    const waited = now - burstStartedAt
    const delay = Math.min(debounceMs, Math.max(0, maxWaitMs - waited))

    timeout = setTimeout(runNow, delay)
  }

  return {
    schedule,
    flush: () => {
      if (timeout !== null) runNow()
    },
    cancel,
    get pending() {
      return timeout !== null
    },
  }
}
