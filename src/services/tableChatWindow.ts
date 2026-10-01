import { ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'

export const OBR_TABLE_CHAT_POPOVER_ID = 'com.compcon.table_chat.floating'

export const isChatWindowOpen = ref(false)

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

// Monitora quando a aba de ações/chat do Owlbear Rodeo abre ou fecha na barra lateral esquerda
if (typeof window !== 'undefined' && OBR.isAvailable) {
  void ensureObrReady().then((ready) => {
    if (ready) {
      try {
        OBR.action.onOpenChange((open) => {
          isChatWindowOpen.value = open
        })
      } catch {
        // ignore
      }
    }
  })
}

/**
 * Pré-carrega o componente Vue do TableChatView no cache do navegador
 */
export async function preloadTableChatWindow(): Promise<void> {
  void import('@/features/active_mode/TableChatView.vue').catch(() => {})
}

/**
 * Verifica se a janela do chat está atualmente aberta
 */
export function isTableChatOpen(): boolean {
  return isChatWindowOpen.value
}

/**
 * Abre o chat de ações da mesa diretamente dentro do menu esquerdo do Owlbear Rodeo
 */
export async function openTableChatWindow(): Promise<void> {
  let screenH = 1080

  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (ready) {
      try {
        const vpH = await OBR.viewport.getHeight().catch(() => 1080)
        if (vpH && vpH > 500) screenH = vpH
      } catch {
        // ignore
      }
    }
  } else if (typeof window !== 'undefined' && window.screen) {
    screenH = window.screen.availHeight || window.screen.height || 1080
  }

  const width = 420
  const height = Math.min(720, Math.max(480, screenH - 64 - 96))

  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (ready) {
      // 1. Tenta abrir dentro do drawer nativo do menu esquerdo do Owlbear Rodeo
      try {
        await OBR.action.setWidth(width).catch(() => {})
        await OBR.action.setHeight(height).catch(() => {})
        await OBR.action.open().catch(() => {})
        isChatWindowOpen.value = true
        return
      } catch (err) {
        console.warn('[TableChatWindow] Falha ao abrir via OBR.action, usando fallback OBR.popover:', err)
      }

      // 2. Fallback: abre como popover acoplado no menu esquerdo (left: 84px, top: 64px)
      try {
        await OBR.popover.open({
          id: OBR_TABLE_CHAT_POPOVER_ID,
          url: '/#/table-chat',
          width,
          height,
          disableClickAway: true,
          hidePaper: true,
          marginThreshold: 0,
          anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
          transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
          anchorReference: 'POSITION',
          anchorPosition: { left: 84, top: 64 },
        })
        isChatWindowOpen.value = true
        return
      } catch (e) {
        console.warn('[TableChatWindow] Falha ao abrir popover no menu esquerdo:', e)
      }
    }
  }

  // Fallback para navegador fora do Owlbear Rodeo
  if (typeof window !== 'undefined') {
    isChatWindowOpen.value = true
    window.open(
      '/#/table-chat',
      'COMPCON_TableChat',
      `width=${width},height=${height},left=84,top=64,resizable=yes,scrollbars=yes`
    )
  }
}

/**
 * Fecha a janela independente de chat
 */
export async function closeTableChatWindow(): Promise<void> {
  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (ready) {
      try {
        await OBR.action.close()
      } catch {
        // ignore
      }
      try {
        await OBR.popover.close(OBR_TABLE_CHAT_POPOVER_ID)
      } catch {
        // ignore
      }
    }
  }
  isChatWindowOpen.value = false

  if (typeof window !== 'undefined') {
    if (window.name === 'COMPCON_TableChat' || window.opener) {
      window.close()
    }
  }
}

/**
 * Alterna entre abrir e fechar o chat dentro do menu esquerdo do Owlbear Rodeo
 */
export async function toggleTableChatWindow(): Promise<void> {
  if (OBR.isAvailable) {
    const ready = await ensureObrReady()
    if (ready) {
      try {
        const isActionOpen = await OBR.action.isOpen()
        if (isActionOpen) {
          await closeTableChatWindow()
          return
        }
      } catch {
        // ignore
      }
    }
  }

  if (isChatWindowOpen.value) {
    await closeTableChatWindow()
  } else {
    await openTableChatWindow()
  }
}

/**
 * Destaca o chat em uma nova aba ou janela independente do navegador
 */
export function detachTableChatWindow(): void {
  if (typeof window !== 'undefined') {
    const width = 440
    const height = 780
    const left = 84
    const top = 40
    window.open(
      '/#/table-chat',
      'COMPCON_TableChat_Detached',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )
  }
}
