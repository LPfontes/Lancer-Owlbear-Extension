/**
 * Registro leve de "flush" de persistência.
 *
 * Objetivo: garantir que nada que esteja agendado/atrasado (throttle do
 * `SaveController`, timers de autosave) fique pendente quando a janela da ficha
 * é ocultada ou quando o navegador descarta o documento.
 *
 * Fica num módulo sem dependências para que `SaveController` possa registrá-lo
 * sem criar ciclo de importação com `@/io/Storage`.
 */

type Flusher = () => void

const flushers = new Set<Flusher>()
let listening = false

function attachLifecycleListeners(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  try {
    window.addEventListener('pagehide', () => flushPendingSaves())
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingSaves()
    })
  } catch {
    // ignore
  }
}

/** Registra um flusher e devolve a função de cancelamento do registro. */
export function registerPersistenceFlusher(flusher: Flusher): () => void {
  attachLifecycleListeners()
  flushers.add(flusher)
  return () => flushers.delete(flusher)
}

/** Dispara todos os flushers registrados (nunca lança). */
export function flushPendingSaves(): void {
  for (const flusher of Array.from(flushers)) {
    try {
      flusher()
    } catch {
      // ignore: flush é best-effort
    }
  }
}
