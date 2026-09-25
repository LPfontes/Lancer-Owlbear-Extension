import { ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'

export interface WindowPosition {
  left: number
  top: number
}

export type SnapCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

class WindowManager {
  public isMinimized = ref(false)
  public isCompact = ref(false)
  public isDragging = ref(false)

  public defaultWidth = 1120
  public defaultHeight = 760
  public compactWidth = 520
  public minHeight = 48

  public currentPosition = ref<WindowPosition>({ left: 30, top: 30 })

  private startX = 0
  private startY = 0
  private initialLeft = 0
  private initialTop = 0
  private dragThrottleTimer: number | null = null

  constructor() {
    this.handlePointerDown = this.handlePointerDown.bind(this)
    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerUp = this.handlePointerUp.bind(this)
    this.loadState()
  }

  private loadState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('cc_window_state')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.left !== undefined && parsed.top !== undefined) {
            this.currentPosition.value = { left: parsed.left, top: parsed.top }
          }
          if (parsed.isCompact !== undefined) {
            this.isCompact.value = parsed.isCompact
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'cc_window_state',
          JSON.stringify({
            left: this.currentPosition.value.left,
            top: this.currentPosition.value.top,
            isCompact: this.isCompact.value,
          })
        )
      }
    } catch {
      // ignore
    }
  }

  public get currentWidth(): number {
    return this.isCompact.value ? this.compactWidth : this.defaultWidth
  }

  public get currentHeight(): number {
    return this.isMinimized.value ? this.minHeight : this.defaultHeight
  }

  /**
   * Retorna a URL correta preservando a rota atual
   */
  private getTargetUrl(): string {
    const hash = window.location.hash || '#/active-mode'
    return hash.startsWith('/') ? hash : `/${hash}`
  }

  /**
   * Atualiza as dimensões e posição da janela no Owlbear Rodeo
   */
  public async syncWithObr(targetPos?: WindowPosition) {
    if (!OBR.isAvailable) return

    const pos = targetPos || this.currentPosition.value
    const width = this.isMinimized.value ? 400 : this.currentWidth
    const height = this.currentHeight
    const url = this.getTargetUrl()

    try {
      // Abre/Reposiciona como Popover flutuante livre
      await OBR.popover.open({
        id: OBR_POPOVER_ID,
        url,
        width,
        height,
        disableClickAway: true,
        hidePaper: true,
        anchorReference: 'POSITION',
        anchorPosition: { left: Math.max(10, Math.round(pos.left)), top: Math.max(10, Math.round(pos.top)) },
      })
      // Fecha a janela do action dock caso ela ainda esteja aberta para evitar duplicação de iframes
      try {
        await OBR.action.close()
      } catch {
        // ignore
      }
    } catch {
      // Se estiver rodando dentro do Action Popover nativo
      try {
        await OBR.action.setWidth(width)
        await OBR.action.setHeight(height)
      } catch (err) {
        console.warn('[WindowManager] Falha ao sincronizar com OBR:', err)
      }
    }
  }

  /**
   * Alterna entre minimizado (apenas barra) e tamanho completo
   */
  public async toggleMinimize() {
    this.isMinimized.value = !this.isMinimized.value
    await this.applyHeight()
  }

  public async minimize() {
    this.isMinimized.value = true
    await this.applyHeight()
  }

  public async restore() {
    this.isMinimized.value = false
    await this.applyHeight()
  }

  private async applyHeight() {
    const height = this.isMinimized.value ? this.minHeight : this.defaultHeight
    const width = this.isMinimized.value ? 400 : this.currentWidth

    if (OBR.isAvailable) {
      try {
        await OBR.popover.setHeight(OBR_POPOVER_ID, height)
        await OBR.popover.setWidth(OBR_POPOVER_ID, width)
      } catch {
        try {
          await OBR.action.setHeight(height)
          await OBR.action.setWidth(width)
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Alterna entre largura completa (1120px) e compacta lateral (520px)
   */
  public async toggleCompact() {
    this.isCompact.value = !this.isCompact.value
    this.saveState()

    if (!this.isMinimized.value && OBR.isAvailable) {
      const width = this.currentWidth
      try {
        await OBR.popover.setWidth(OBR_POPOVER_ID, width)
      } catch {
        try {
          await OBR.action.setWidth(width)
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Encaixa a janela flutuante em um canto pré-definido da tela usando dimensões reais do Owlbear
   */
  public async snapTo(corner: SnapCorner) {
    let screenW = 1920
    let screenH = 1080

    if (OBR.isAvailable) {
      try {
        screenW = await OBR.viewport.getWidth()
        screenH = await OBR.viewport.getHeight()
      } catch {
        screenW = window.innerWidth || 1920
        screenH = window.innerHeight || 1080
      }
    } else {
      screenW = window.innerWidth || 1920
      screenH = window.innerHeight || 1080
    }

    const w = this.isMinimized.value ? 400 : this.currentWidth
    const h = this.currentHeight

    let left = 24
    let top = 24

    switch (corner) {
      case 'top-left':
        left = 24
        top = 24
        break
      case 'top-right':
        left = Math.max(24, screenW - w - 24)
        top = 24
        break
      case 'bottom-left':
        left = 24
        top = Math.max(24, screenH - h - 30)
        break
      case 'bottom-right':
        left = Math.max(24, screenW - w - 24)
        top = Math.max(24, screenH - h - 30)
        break
      case 'center':
        left = Math.max(24, Math.floor((screenW - w) / 2))
        top = Math.max(24, Math.floor((screenH - h) / 2))
        break
    }

    this.currentPosition.value = { left, top }
    this.saveState()
    await this.syncWithObr()
  }

  /**
   * Manipulador de Arrastar janela com PointerCapture
   */
  public handlePointerDown = (e: PointerEvent) => {
    // Evita disparar em cliques de botões ou links
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('.no-drag')) return

    const el = e.currentTarget as HTMLElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    this.isDragging.value = true
    this.startX = e.screenX || e.clientX
    this.startY = e.screenY || e.clientY
    this.initialLeft = this.currentPosition.value.left
    this.initialTop = this.currentPosition.value.top
  }

  public handlePointerMove = (e: PointerEvent) => {
    if (!this.isDragging.value) return

    const currentX = e.screenX || e.clientX
    const currentY = e.screenY || e.clientY
    const deltaX = currentX - this.startX
    const deltaY = currentY - this.startY

    const newLeft = Math.max(0, this.initialLeft + deltaX)
    const newTop = Math.max(0, this.initialTop + deltaY)

    this.currentPosition.value = { left: newLeft, top: newTop }

    // Throttle para atualizar a posição no Owlbear a cada 50ms
    if (!this.dragThrottleTimer) {
      this.dragThrottleTimer = window.setTimeout(() => {
        this.dragThrottleTimer = null
        if (OBR.isAvailable) {
          this.syncWithObr()
        }
      }, 50)
    }
  }

  public handlePointerUp = (e: PointerEvent) => {
    if (!this.isDragging.value) return
    this.isDragging.value = false

    const el = e.currentTarget as HTMLElement
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    if (this.dragThrottleTimer) {
      clearTimeout(this.dragThrottleTimer)
      this.dragThrottleTimer = null
    }

    this.saveState()
    if (OBR.isAvailable) {
      this.syncWithObr()
    }
  }

  /**
   * Fecha o popover do Owlbear Rodeo
   */
  public async closeWindow() {
    if (!OBR.isAvailable) return
    try {
      await OBR.popover.close(OBR_POPOVER_ID)
    } catch {
      try {
        await OBR.action.close()
      } catch {
        // ignore
      }
    }
  }
}

export const windowManager = new WindowManager()
