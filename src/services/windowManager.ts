import { ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import {
  hideSheetWindow as hidePersistentSheetWindow,
  isSheetWindowContext,
  isSheetWindowHidden,
  restoreSheetWindow,
} from './mainWindow'

export interface WindowPosition {
  left: number
  top: number
}

export type SnapCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export const OBR_POPOVER_ID = 'com.compcon.activemode.floating'

/**
 * Margens de segurança para nunca sobrepor a interface nativa do Owlbear Rodeo:
 * - LEFT: 84px evita sobrepor a barra de ferramentas vertical (pan, select, fog, draw, etc.)
 * - TOP_LEFT: 64px evita sobrepor a barra superior esquerda (logo Home, Players, extensões)
 * - TOP_RIGHT: 16px margem limpa quando posicionado na direita
 * - BOTTOM: 96px evita sobrepor a dock inferior (painel de tokens/cenas, botão de grid 1m e extras)
 * - RIGHT: 84px evita sobrepor o menu lateral direito do Owlbear (painel de cena, configurações, extensões e botões)
 */
export const OBR_SAFE_MARGIN = {
  LEFT: 84,
  TOP_LEFT: 64,
  TOP_RIGHT: 16,
  BOTTOM: 96,
  RIGHT: 84,
}

class WindowManager {
  public isMinimized = ref(false)
  public isCompact = ref(true)
  public isFloating = ref(false) // false = Modo Nativo OBR.action (renderizado atrás dos menus do Owlbear); true = Popover flutuante

  public defaultWidth = 520
  public defaultHeight = 720
  public compactWidth = 520
  public minHeight = 48

  public currentPosition = ref<WindowPosition>({ left: 1920, top: 16 })

  constructor() {
    this.loadState()
  }

  private loadState() {
    try {
      if (typeof window !== 'undefined') {
        const isFloatingUrl =
          window.location.search.includes('windowType=floating') ||
          window.location.hash.includes('windowType=floating')
        this.isFloating.value = isFloatingUrl

        if (window.localStorage) {
          const saved = window.localStorage.getItem('cc_window_state')
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.left !== undefined && parsed.top !== undefined) {
              this.currentPosition.value = {
                left: Math.max(OBR_SAFE_MARGIN.LEFT, parsed.left),
                top: Math.max(OBR_SAFE_MARGIN.TOP_RIGHT, parsed.top),
              }
            }
            this.isCompact.value = true
          }

          const savedHeight = window.localStorage.getItem('cc_window_height')
          if (savedHeight) {
            const parsedH = parseInt(savedHeight, 10)
            if (!isNaN(parsedH) && parsedH >= 450) {
              this.defaultHeight = Math.min(840, parsedH)
            }
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
            isCompact: true,
            isFloating: this.isFloating.value,
          })
        )
      }
    } catch {
      // ignore
    }
  }

  /**
   * Inicializa o gerenciador no carregamento da aplicação.
   * Por padrão, abre posicionado na lateral direita respeitando a margem segura do Owlbear Rodeo.
   */
  public async init() {
    if (!OBR.isAvailable) return
    const ready = await this.ensureReady()
    if (!ready) return

    // A janela persistente da ficha é criada por `mainWindow`.
    // Aqui apenas aplicamos as dimensões salvas — nunca fechamos nem recriamos o iframe.
    if (isSheetWindowContext()) {
      this.isFloating.value = true
    }

    if (!this.isFloating.value) {
      await this.alignRight()
    } else {
      await this.applyHeight()
    }
  }

  public get currentWidth(): number {
    return this.compactWidth
  }

  public get currentHeight(): number {
    if (this.isMinimized.value) return this.minHeight
    const { screenH } = this.getScreenDimensions()
    const top = this.currentPosition.value.top || OBR_SAFE_MARGIN.TOP_RIGHT
    return Math.min(this.defaultHeight, Math.max(480, screenH - top - OBR_SAFE_MARGIN.BOTTOM))
  }

  public async setHeight(newHeight: number) {
    this.defaultHeight = Math.min(840, Math.max(450, newHeight))
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('cc_window_height', String(this.defaultHeight))
      }
    } catch {
      // ignore
    }
    await this.applyHeight()
  }

  private isSyncing = false

  /**
   * Garante que as coordenadas da janela nunca invadam a barra de ferramentas,
   * a barra superior de players/extensões ou a dock inferior de tokens do Owlbear Rodeo.
   */
  public clampPosition(
    pos: WindowPosition,
    width: number,
    height: number,
    screenW: number,
    screenH: number
  ): WindowPosition {
    const minLeft = OBR_SAFE_MARGIN.LEFT
    const maxLeft = Math.max(minLeft, screenW - width - OBR_SAFE_MARGIN.RIGHT)
    const left = Math.max(minLeft, Math.min(pos.left, maxLeft))

    // Se estiver no lado esquerdo da tela (onde fica a barra de ferramentas e logo/jogadores), precisa de top >= 64
    const minTop = left < 450 ? OBR_SAFE_MARGIN.TOP_LEFT : OBR_SAFE_MARGIN.TOP_RIGHT
    const maxTop = Math.max(minTop, screenH - height - OBR_SAFE_MARGIN.BOTTOM)
    const top = Math.max(minTop, Math.min(pos.top, maxTop))

    return { left: Math.round(left), top: Math.round(top) }
  }

  /**
   * Retorna a URL correta preservando a rota atual
   */
  private getTargetUrl(isFloating = this.isFloating.value): string {
    let hash = (typeof window !== 'undefined' && window.location.hash) || ''
    if (!hash || hash === '#' || hash === '#/') {
      hash = '#/active-mode'
    }
    if (hash.includes('/table-chat')) {
      hash = '#/active-mode'
    }
    const cleanHash = hash.startsWith('#') ? hash : `#${hash}`
    return isFloating ? `/?windowType=floating${cleanHash}` : `/${cleanHash}`
  }

  public async ensureReady(): Promise<boolean> {
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

  /**
   * Atualiza as dimensões e posição da janela no Owlbear Rodeo respeitando as margens seguras
   */
  public async syncWithObr(targetPos?: WindowPosition) {
    if (
      typeof window !== 'undefined' &&
      window.location.hash.includes('/table-chat')
    ) {
      return
    }
    if (!OBR.isAvailable || this.isSyncing) return
    const ready = await this.ensureReady()
    if (!ready) return

    this.isSyncing = true
    this.isFloating.value = true

    const rawPos = targetPos || this.currentPosition.value
    const width = this.isMinimized.value ? 400 : this.currentWidth
    const { screenW, screenH } = await this.getScreenDimensionsAsync()
    const height = this.currentHeight
    const url = this.getTargetUrl(true)

    const clampedPos = this.clampPosition(rawPos, width, height, screenW, screenH)
    this.currentPosition.value = clampedPos
    this.saveState()

    const finalLeft = clampedPos.left
    const finalTop = clampedPos.top

    // Nunca recriar/recarregar o iframe que já está montado: apenas reposiciona e
    // redimensiona a janela persistente. `OBR.popover.open` no mesmo id descartaria
    // todo o estado em memória (fichas abertas, saves pendentes).
    if (await this.repositionExistingPopover(clampedPos, width, height)) {
      this.isSyncing = false
      return
    }

    try {
      console.log('[WindowManager] 🚀 OBR.popover.open disparado com margens seguras:', {
        id: OBR_POPOVER_ID,
        anchorPosition: { left: finalLeft, top: finalTop },
        width,
        height,
        marginThreshold: 0,
      })

      // Abre/Reposiciona como Popover flutuante livre
      await OBR.popover.open({
        id: OBR_POPOVER_ID,
        url,
        width,
        height,
        disableClickAway: true,
        hidePaper: true,
        marginThreshold: 0,
        anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        anchorReference: 'POSITION',
        anchorPosition: { left: finalLeft, top: finalTop },
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
    } finally {
      this.isSyncing = false
    }
  }

  private restoreTimeout: ReturnType<typeof setTimeout> | null = null
  private wasAutoMinimized = false

  /**
   * Reposiciona/redimensiona a janela persistente SEM recriar o iframe.
   * Retorna `true` quando a janela já existia e foi apenas ajustada.
   */
  /**
   * Reposiciona/redimensiona a janela persistente SEM recriar o iframe.
   *
   * Distingue "não existe" de "existe e está oculta": uma janela oculta está em
   * 0×0 de propósito (`collapsePopoverSize`), e redimensioná-la aqui a traria de
   * volta à tela sem o usuário pedir. Nesse caso respondemos `true` (o iframe foi
   * reaproveitado) sem tocar nas dimensões.
   */
  private async repositionExistingPopover(
    pos: WindowPosition,
    width: number,
    height: number
  ): Promise<boolean> {
    if (!OBR.isAvailable) return false
    try {
      const existingWidth = await OBR.popover.getWidth(OBR_POPOVER_ID).catch(() => undefined)
      if (existingWidth === undefined || existingWidth === null) return false

      if (existingWidth <= 0) {
        console.log('[WindowManager] Janela persistente existe porém oculta (0×0); preservando.')
        return true
      }

      await OBR.popover.setWidth(OBR_POPOVER_ID, width)
      await OBR.popover.setHeight(OBR_POPOVER_ID, height)
      console.log('[WindowManager] ♻️ Janela persistente reaproveitada (sem recarregar o iframe):', {
        left: pos.left,
        top: pos.top,
        width,
        height,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Minimiza temporariamente a janela durante uma rolagem de dados
   * e a restaura automaticamente após a duração especificada (em segundos).
   */
  public minimizeForRoll(durationSeconds = 4) {
    if (!this.isMinimized.value) {
      this.wasAutoMinimized = true
      void this.minimize()
    }

    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout)
    }

    this.restoreTimeout = setTimeout(() => {
      if (this.wasAutoMinimized) {
        // Nunca reexibe uma janela que o usuário ocultou de propósito.
        if (!isSheetWindowHidden()) void this.restore()
        this.wasAutoMinimized = false
      }
      this.restoreTimeout = null
    }, Math.max(1000, durationSeconds * 1000))
  }

  public cancelRollMinimize() {
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout)
      this.restoreTimeout = null
    }
    this.wasAutoMinimized = false
  }

  /**
   * Alterna entre minimizado (apenas barra) e tamanho completo
   */
  public async toggleMinimize() {
    if (isSheetWindowHidden()) {
      await this.reopenWindow()
      return
    }
    this.cancelRollMinimize()
    this.isMinimized.value = !this.isMinimized.value
    await this.applyHeight()
  }

  public async minimize() {
    if (isSheetWindowHidden()) return
    this.isMinimized.value = true
    await this.applyHeight()
  }

  /**
   * Restaura a janela ao tamanho completo.
   *
   * Se ela estiver OCULTA (0×0 + `display:none`), o caminho correto não é
   * redimensionar: é reexibir, ou seja, `reopenWindow()`.
   */
  public async restore() {
    if (isSheetWindowHidden()) {
      await this.reopenWindow()
      return
    }
    this.cancelRollMinimize()
    this.isMinimized.value = false
    await this.applyHeight()
  }

  private async applyHeight() {
    const height = this.isMinimized.value ? this.minHeight : this.defaultHeight
    const width = this.isMinimized.value ? 400 : this.currentWidth

    // Uma janela oculta está em 0×0 de propósito. Redimensioná-la aqui (minimizar,
    // restaurar ou o minimize automático de rolagem) a traria de volta à tela sem
    // o usuário pedir — vale para o popover e para o action dock.
    if (isSheetWindowHidden()) {
      console.log('[WindowManager] Janela da ficha está oculta; dimensões preservadas.')
      return
    }

    if (OBR.isAvailable) {
      const ready = await this.ensureReady()
      if (!ready) return

      if (this.isFloating.value) {
        try {
          await OBR.popover.setHeight(OBR_POPOVER_ID, height)
          await OBR.popover.setWidth(OBR_POPOVER_ID, width)
        } catch (err) {
          console.warn('[WindowManager] Falha ao ajustar dimensões no popover:', err)
        }
      } else {
        try {
          await OBR.action.setHeight(height)
          await OBR.action.setWidth(width)
        } catch (err) {
          console.warn('[WindowManager] Falha ao ajustar dimensões no action:', err)
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
      const ready = await this.ensureReady()
      if (!ready) return
      // Não expande uma janela oculta de propósito (0×0).
      if (isSheetWindowHidden()) return
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
   * Obtém as dimensões reais da tela/janela para cálculo preciso de bordas
   */
  public async getScreenDimensionsAsync(): Promise<{ screenW: number; screenH: number }> {
    let screenW = 1920
    let screenH = 1080

    if (OBR.isAvailable) {
      try {
        const ready = await this.ensureReady()
        if (ready) {
          const [vpW, vpH] = await Promise.all([
            OBR.viewport.getWidth().catch(() => 1920),
            OBR.viewport.getHeight().catch(() => 1080),
          ])
          if (vpW && vpW > 500) screenW = vpW
          if (vpH && vpH > 500) screenH = vpH
          return { screenW, screenH }
        }
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && window.screen) {
      screenW = window.screen.availWidth || window.screen.width || 1920
      screenH = window.screen.availHeight || window.screen.height || 1080
    }
    return { screenW, screenH }
  }

  public getScreenDimensions(): { screenW: number; screenH: number } {
    let screenW = 1920
    let screenH = 1080

    if (typeof window !== 'undefined' && window.screen) {
      screenW = window.screen.availWidth || window.screen.width || 1920
      screenH = window.screen.availHeight || window.screen.height || 1080
    }
    return { screenW, screenH }
  }

  /**
   * Alinha a janela no extremo direito da tela respeitando a margem segura do Owlbear Rodeo
   * Padrão: marginRight = 20px (da borda direita), topMargin = 12px
   */
  public async alignRight(marginRight = OBR_SAFE_MARGIN.RIGHT, topMargin = OBR_SAFE_MARGIN.TOP_RIGHT) {
    if (
      typeof window !== 'undefined' &&
      window.location.hash.includes('/table-chat')
    ) {
      return
    }
    const { screenW, screenH } = await this.getScreenDimensionsAsync()

    const w = this.isMinimized.value ? 400 : this.currentWidth
    const rawLeft = Math.max(OBR_SAFE_MARGIN.LEFT, screenW - w - marginRight)
    const rawTop = Math.max(OBR_SAFE_MARGIN.TOP_RIGHT, topMargin)

    const clamped = this.clampPosition({ left: rawLeft, top: rawTop }, w, this.currentHeight, screenW, screenH)

    console.log('[WindowManager] 📐 alignRight Calculado (com margem segura Owlbear Rodeo):', clamped)

    this.currentPosition.value = clamped
    this.saveState()
    await this.syncWithObr(clamped)
  }

  public async setPercentagePosition(leftPercent = 0.8, topPercent = 0.05) {
    if (
      typeof window !== 'undefined' &&
      window.location.hash.includes('/table-chat')
    ) {
      return
    }
    const { screenW, screenH } = await this.getScreenDimensionsAsync()

    const rawLeft = Math.round(screenW * leftPercent)
    const rawTop = Math.round(screenH * topPercent)

    const w = this.isMinimized.value ? 400 : this.currentWidth
    const clamped = this.clampPosition({ left: rawLeft, top: rawTop }, w, this.currentHeight, screenW, screenH)

    console.log('[WindowManager] 📐 setPercentagePosition Calculado:', clamped)

    this.currentPosition.value = clamped
    this.saveState()
    await this.syncWithObr(clamped)
  }

  /**
   * Encaixa a janela flutuante em um canto pré-definido da tela sem sobrepor as ferramentas e docks do Owlbear Rodeo
   */
  public async snapTo(corner: SnapCorner) {
    if (
      typeof window !== 'undefined' &&
      window.location.hash.includes('/table-chat')
    ) {
      return
    }
    const { screenW, screenH } = await this.getScreenDimensionsAsync()

    const w = this.isMinimized.value ? 400 : this.currentWidth
    const h = this.currentHeight

    let left = OBR_SAFE_MARGIN.LEFT
    let top = OBR_SAFE_MARGIN.TOP_RIGHT

    switch (corner) {
      case 'top-left':
        left = OBR_SAFE_MARGIN.LEFT // 84px - não sobrepõe a barra de ferramentas
        top = OBR_SAFE_MARGIN.TOP_LEFT // 64px - não sobrepõe o logo e jogadores
        break
      case 'top-right':
        left = Math.max(OBR_SAFE_MARGIN.LEFT, screenW - w - OBR_SAFE_MARGIN.RIGHT)
        top = OBR_SAFE_MARGIN.TOP_RIGHT // 12px
        break
      case 'bottom-left':
        left = OBR_SAFE_MARGIN.LEFT // 84px
        top = Math.max(OBR_SAFE_MARGIN.TOP_LEFT, screenH - h - OBR_SAFE_MARGIN.BOTTOM) // não sobrepõe a dock
        break
      case 'bottom-right':
        left = Math.max(OBR_SAFE_MARGIN.LEFT, screenW - w - OBR_SAFE_MARGIN.RIGHT)
        top = Math.max(OBR_SAFE_MARGIN.TOP_RIGHT, screenH - h - OBR_SAFE_MARGIN.BOTTOM) // não sobrepõe extras/grid
        break
      case 'center':
        left = Math.max(OBR_SAFE_MARGIN.LEFT, Math.floor((screenW - w) / 2))
        top = Math.max(OBR_SAFE_MARGIN.TOP_LEFT, Math.floor((screenH - h - OBR_SAFE_MARGIN.BOTTOM) / 2))
        break
    }

    const clamped = this.clampPosition({ left, top }, w, h, screenW, screenH)
    this.currentPosition.value = clamped
    this.isFloating.value = true
    this.saveState()
    await this.syncWithObr(clamped)
  }

  /**
   * "Fecha" a janela da ficha.
   *
   * Importante: NÃO destrói o iframe. O app é apenas ocultado via CSS e continua
   * montado, sincronizado e com todos os dados em memória — que é o que impede a
   * perda de ficha ao abrir/fechar. Recriar o iframe (OBR.popover.open no mesmo id)
   * ou removê-lo (OBR.popover.close) causava exatamente a perda relatada.
   */
  public async closeWindow() {
    this.cancelRollMinimize()

    if (isSheetWindowContext()) {
      await hidePersistentSheetWindow()
      return
    }

    // Não estamos dentro da janela persistente: encerra popovers auxiliares.
    if (!OBR.isAvailable) return
    const ready = await this.ensureReady()
    if (!ready) return
    try {
      await OBR.popover.close(OBR_POPOVER_ID)
    } catch {
      // ignore
    }
  }

  /** Reexibe a janela persistente (mesmo iframe) e sai do modo minimizado. */
  public async reopenWindow() {
    this.cancelRollMinimize()
    this.isMinimized.value = false
    if (isSheetWindowContext()) {
      this.isFloating.value = true
      await restoreSheetWindow()
      return
    }
    await this.applyHeight()
  }

  /** Fecha (destrói) o iframe da janela persistente. Uso deliberado e explícito. */
  public async destroyWindow() {
    this.cancelRollMinimize()
    if (!OBR.isAvailable) return
    const ready = await this.ensureReady()
    if (!ready) return
    try {
      await OBR.popover.close(OBR_POPOVER_ID)
    } catch {
      // ignore
    }
  }

  /**
   * Desprende a janela para o modo flutuante livre
   */
  public async detachFloating() {
    this.isFloating.value = true
    this.saveState()
    await this.syncWithObr()
  }

  /**
   * Acopla a janela de volta na barra de extensões do Owlbear Rodeo (renderizada atrás dos menus)
   */
  public async dockToAction() {
    this.isFloating.value = false
    this.saveState()

    if (OBR.isAvailable) {
      const ready = await this.ensureReady()
      if (ready) {
        try {
          await OBR.popover.close(OBR_POPOVER_ID)
        } catch {
          // ignore
        }
        try {
          await OBR.action.setWidth(this.currentWidth)
          await OBR.action.setHeight(this.currentHeight)
          await OBR.action.open()
        } catch (err) {
          console.warn('[WindowManager] Falha ao acoplar no action:', err)
        }
      }
    }
  }
}

export const windowManager = new WindowManager()
