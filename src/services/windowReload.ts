/**
 * Recarga do iframe da extensão.
 *
 * Um reload de página **não** desmonta os componentes: `onBeforeUnmount` não roda, e o
 * que estiver em timers de debounce (envio de `PATCH_FIELD` da ficha, autosave do
 * encontro) morreria com a janela. Por isso avisamos quem tem trabalho pendente pelo
 * evento `compcon-before-reload` e só recarregamos depois de um instante, para as
 * gravações assíncronas no IndexedDB chegarem a terminar.
 */

/** Evento ouvido pelos runners para descarregar timers pendentes antes do reload. */
export const RELOAD_FLUSH_EVENT = 'compcon-before-reload'

/** Tempo dado aos listeners para gravar antes de recarregar. */
export const RELOAD_DELAY_MS = 350

export interface ReloadExtensionWindowOptions {
  /** Espera antes de recarregar (ms). */
  delayMs?: number
  /** Injetável nos testes; por padrão recarrega o iframe. */
  reload?: () => void
}

/** Avisa os listeners e recarrega o iframe da janela. */
export function reloadExtensionWindow(options: ReloadExtensionWindowOptions = {}): void {
  const delayMs = options.delayMs ?? RELOAD_DELAY_MS
  const reload = options.reload ?? (() => window.location.reload())

  try {
    window.dispatchEvent(new CustomEvent(RELOAD_FLUSH_EVENT))
  } catch {
    // Sem listeners (ou ambiente sem DOM), o reload segue normalmente.
  }

  setTimeout(reload, delayMs)
}
