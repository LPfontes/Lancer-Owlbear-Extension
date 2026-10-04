import { OBR_MAIN_WINDOW_POPOVER_ID, openMainWindow } from './mainWindow'

/**
 * Abre o Gerenciador de Fichas da Mesa (dialog) na janela principal.
 * A antiga janela standalone (rota /table-sheets) foi removida; agora isto
 * apenas dispara o evento que o TableSheetManagerDialog escuta.
 */
export async function openTableSheetsWindow(): Promise<void> {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('compcon-open-table-sheets'))
  }
}

/** Mesmo id da janela persistente da ficha: nunca abrir um segundo iframe. */
export const OBR_STANDARD_POPOVER_ID = OBR_MAIN_WINDOW_POPOVER_ID

/**
 * Abre (ou apenas reexibe) a janela padrão da aplicação.
 *
 * Delega para `openMainWindow`, que reutiliza o iframe já montado em vez de
 * recriá-lo — recriar era o que descartava o estado da ficha.
 */
export async function openStandardWindow(targetRoute: string = '/active-mode'): Promise<void> {
  const cleanRoute = targetRoute.replace(/^\/?#?/, '')
  await openMainWindow({
    restoreIfHidden: true,
    targetRoute: `/${cleanRoute}`,
  })
}
