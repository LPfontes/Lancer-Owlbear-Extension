import './polyfill'
import OBR from '@owlbear-rodeo/sdk'

export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

function getSafeStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

OBR.onReady(async () => {
  try {
    const saved = getSafeStorage('cc_window_state')
    let left = 40
    let top = 40
    let isCompact = false
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.left !== undefined) left = parsed.left
        if (parsed.top !== undefined) top = parsed.top
        if (parsed.isCompact !== undefined) isCompact = parsed.isCompact
      } catch {
        // ignore
      }
    }

    const width = isCompact ? 520 : 1120
    const height = 760

    // Verifica se a janela flutuante livre já está aberta
    let isOpen = false
    try {
      const currentW = await OBR.popover.getWidth(OBR_POPOVER_ID)
      if (currentW && currentW > 0) {
        isOpen = true
      }
    } catch {
      isOpen = false
    }

    if (isOpen) {
      // Se já estava aberta, clicar no botão da barra fecha a janela (comportamento de toggle)
      await OBR.popover.close(OBR_POPOVER_ID)
    } else {
      // Abre a janela flutuante livre no canvas do Owlbear Rodeo
      await OBR.popover.open({
        id: OBR_POPOVER_ID,
        url: '/#/active-mode',
        width,
        height,
        disableClickAway: true,
        hidePaper: true,
        anchorReference: 'POSITION',
        anchorPosition: { left: Math.max(10, Math.round(left)), top: Math.max(10, Math.round(top)) },
      })
    }
  } catch (err) {
    console.error('[COMP/CON Launcher] Erro:', err)
  } finally {
    // Fecha o popover do dock imediatamente para não criar iframe duplicado
    try {
      await OBR.action.close()
    } catch {
      // ignore
    }
  }
})
