import OBR from '@owlbear-rodeo/sdk'

export const OBR_MAIN_WINDOW_POPOVER_ID = 'com.compcon.activemode.floating'

/**
 * Garante que o SDK do Owlbear Rodeo completou o handshake de prontidão
 */
export async function ensureObrReady(): Promise<boolean> {
  if (!OBR.isAvailable) return false
  if (OBR.isReady) return true
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 3000)
    OBR.onReady(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

function getSafeStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

export async function isMainWindowOpen(): Promise<boolean> {
  if (!OBR.isAvailable) return false
  const ready = await ensureObrReady()
  if (!ready) return false
  try {
    const w = await OBR.popover.getWidth(OBR_MAIN_WINDOW_POPOVER_ID).catch(() => 0)
    return !!(w && w > 0)
  } catch {
    return false
  }
}

export async function openMainWindow(openTableSheets: boolean = false): Promise<void> {
  let screenW = 1920
  let screenH = 1080

  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (!ready) return
    try {
      const [vpW, vpH] = await Promise.all([
        OBR.viewport.getWidth().catch(() => 1920),
        OBR.viewport.getHeight().catch(() => 1080),
      ])
      if (vpW && vpW > 500) screenW = vpW
      if (vpH && vpH > 500) screenH = vpH
    } catch {
      // ignore
    }
  } else if (typeof window !== 'undefined' && window.screen) {
    screenW = window.screen.availWidth || window.screen.width || 1920
    screenH = window.screen.availHeight || window.screen.height || 1080
  }

  const savedHeight = getSafeStorage('cc_window_height')
  const baseHeight = savedHeight ? parseInt(savedHeight, 10) : 720

  const width = 520
  const top = 16
  const height = Math.min(!isNaN(baseHeight) && baseHeight >= 500 ? baseHeight : 720, Math.max(480, screenH - top - 96))
  const left = Math.max(84, screenW - width - 84)

  const targetUrl = openTableSheets
    ? '/?windowType=floating#/active-mode?openTableSheets=true'
    : '/?windowType=floating#/active-mode'

  if (OBR.isAvailable) {
    try {
      await OBR.popover.open({
        id: OBR_MAIN_WINDOW_POPOVER_ID,
        url: targetUrl,
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
    } catch (err) {
      console.warn('[MainWindow] Erro ao abrir popover principal:', err)
    }
  } else if (typeof window !== 'undefined') {
    window.open(targetUrl, '_blank')
  }
}

export async function closeMainWindow(): Promise<void> {
  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (ready) {
      try {
        await OBR.popover.close(OBR_MAIN_WINDOW_POPOVER_ID)
      } catch {
        // ignore
      }
    }
  }
}

export async function toggleMainWindow(openTableSheets: boolean = false): Promise<void> {
  const isOpen = await isMainWindowOpen()
  if (isOpen) {
    await closeMainWindow()
  } else {
    await openMainWindow(openTableSheets)
  }
}
