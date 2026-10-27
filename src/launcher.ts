import './polyfill'
import OBR from '@owlbear-rodeo/sdk'

import { openMainWindow } from '@/services/mainWindow'

export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

function prewarm() {
  try {
    fetch('/index.html', { cache: 'force-cache' }).catch(() => {})
  } catch {
    // ignore
  }
}

// Quando o launcher é invocado pelo ícone do Owlbear Rodeo,
// garante que a janela flutuante única esteja aberta e fecha o popover da barra
async function launchApp() {
  try {
    prewarm()
    await openMainWindow({ restoreIfHidden: true })
    if (OBR.isAvailable) {
      await OBR.action.close()
    }
  } catch (err) {
    console.warn('[COMP/CON Launcher] Falha ao lançar janela principal:', err)
  }
}

OBR.onReady(async () => {
  await launchApp()
})

prewarm()

