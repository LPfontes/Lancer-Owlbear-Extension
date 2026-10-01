import './polyfill'
import OBR from '@owlbear-rodeo/sdk'

export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

function prewarm() {
  try {
    fetch('/content/pt/lancer-data.json', { cache: 'force-cache' }).catch(() => {})
    fetch('/content/pt/lancer-srd.json', { cache: 'force-cache' }).catch(() => {})
    fetch('/index.html', { cache: 'force-cache' }).catch(() => {})
    fetch('/src/main.ts').catch(() => {})
    fetch('/src/features/active_mode/TableChatView.vue').catch(() => {})
  } catch {
    // ignore
  }
}

// Quando o launcher é invocado pelo menu esquerdo do Owlbear Rodeo,
// expande o drawer nativo e redireciona imediatamente para o chat dentro do menu esquerdo
OBR.onReady(async () => {
  try {
    prewarm()
    await OBR.action.setWidth(420)
    await OBR.action.setHeight(720)
    window.location.replace('/index.html#/table-chat')
  } catch (err) {
    console.warn('[COMP/CON Launcher] onReady:', err)
  }
})

prewarm()
