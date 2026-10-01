import OBR from '@owlbear-rodeo/sdk'

export const OBR_TABLE_SHEETS_MODAL_ID = 'com.compcon.table_sheets.modal'

/**
 * Abre a janela independente do Gerenciador de Fichas da Mesa
 */
export async function openTableSheetsWindow(): Promise<void> {
  if (OBR.isAvailable) {
    try {
      const modalUrl = typeof window !== 'undefined' ? new URL('/#/table-sheets', window.location.href).href : '/#/table-sheets'
      await OBR.modal.open({
        id: OBR_TABLE_SHEETS_MODAL_ID,
        url: modalUrl,
        width: 980,
        height: 680,
      })
      // Fecha o launcher se estiver aberto
      void OBR.action.close().catch(() => {})
      return
    } catch (e) {
      console.warn('[TableSheetsWindow] Falha ao abrir OBR.modal, usando fallback:', e)
    }
  }

  // Fallback para navegador ou ambiente fora do Owlbear
  if (typeof window !== 'undefined') {
    const screenW = window.screen?.availWidth || 1920
    const screenH = window.screen?.availHeight || 1080
    const width = 980
    const height = 680
    const left = Math.max(0, Math.round((screenW - width) / 2))
    const top = Math.max(0, Math.round((screenH - height) / 2))
    window.open(
      '/#/table-sheets',
      'TableSheetsManager',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )
  }
}

/**
 * Fecha a janela independente do Gerenciador de Fichas da Mesa
 */
export async function closeTableSheetsWindow(): Promise<void> {
  if (OBR.isAvailable) {
    try {
      await OBR.modal.close(OBR_TABLE_SHEETS_MODAL_ID)
      return
    } catch (e) {
      console.warn('[TableSheetsWindow] Erro ao fechar OBR.modal:', e)
    }
  }

  if (typeof window !== 'undefined') {
    if (window.opener) {
      window.close()
    } else {
      window.history.back()
    }
  }
}

export const OBR_STANDARD_POPOVER_ID = 'com.compcon.activemode.floating'

/**
 * Abre a janela padrão flutuante do COMP/CON no Owlbear Rodeo
 */
export async function openStandardWindow(targetRoute: string = '/#/active-mode'): Promise<void> {
  const cleanRoute = targetRoute.replace(/^\/?#?/, '')
  const fullTargetUrl = `/#/${cleanRoute}`

  // 1. Se já estiver no contexto da aplicação principal, navega diretamente sem recriar popovers
  if (typeof window !== 'undefined' && !window.location.hash.includes('/table-sheets')) {
    window.location.hash = fullTargetUrl
    return
  }

  // 2. Se estiver no Owlbear Rodeo, tenta abrir o Action Panel nativo (renderizado atrás dos menus)
  if (OBR.isAvailable) {
    try {
      await OBR.action.open()
      return
    } catch {
      // Se não for possível abrir o action, continua para o fallback de popover
    }
  }

  let screenW = 1920
  let screenH = 1080

  if (typeof window !== 'undefined' && window.screen) {
    screenW = window.screen.availWidth || window.screen.width || 1920
    screenH = window.screen.availHeight || window.screen.height || 1080
  }

  let savedHeight: string | null = null
  try {
    savedHeight = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('cc_window_height') : null
  } catch {}

  const baseHeight = savedHeight ? parseInt(savedHeight, 10) : 720
  const width = 520
  const top = 16
  const height = Math.min(!isNaN(baseHeight) && baseHeight >= 500 ? baseHeight : 720, Math.max(480, screenH - top - 96))
  const left = Math.max(84, screenW - width - 84)

  if (OBR.isAvailable) {
    try {
      const popoverUrl = typeof window !== 'undefined' ? new URL(fullTargetUrl, window.location.href).href : fullTargetUrl
      await OBR.popover.open({
        id: OBR_STANDARD_POPOVER_ID,
        url: popoverUrl,
        width,
        height,
        disableClickAway: true,
        hidePaper: true,
        marginThreshold: 0,
        anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        anchorReference: 'POSITION',
        anchorPosition: { left: Math.max(84, Math.round(left)), top: Math.max(16, Math.round(top)) },
      })
      return
    } catch (e) {
      console.warn('[StandardWindow] Falha ao abrir OBR.popover padrão:', e)
    }
  }

  // Fallback quando rodando como popup ou navegador
  if (typeof window !== 'undefined') {
    if (window.opener && !window.opener.closed) {
      window.opener.location.hash = fullTargetUrl.replace(/^\/?#?/, '#')
      window.opener.focus()
    } else {
      window.open(fullTargetUrl, 'CompConFloatingWindow')
    }
  }
}
