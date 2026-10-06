import { ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import {
  hideSheetWindow as hidePersistentSheetWindow,
  isSheetWindowContext,
  isSheetWindowHidden,
  isSheetWindowMinimized,
  restoreSheetWindow,
  setSheetWindowMinimized,
} from './mainWindow'
import {
  BAR_HEIGHT,
  BAR_LEFT,
  BAR_WIDTH,
  LEFT_SIDE_THRESHOLD,
  OBR_POPOVER_ID,
  OBR_SAFE_MARGIN,
  WINDOW_HEIGHT_DEFAULT,
  WINDOW_HEIGHT_FIT_MIN,
  WINDOW_HEIGHT_MAX,
  WINDOW_HEIGHT_MIN,
  WINDOW_WIDTH,
} from './obrLayout'

export interface WindowPosition {
  left: number
  top: number
}

export type SnapCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

// Reexportados para quem já importava a geometria daqui.
export { OBR_POPOVER_ID, OBR_SAFE_MARGIN }

class WindowManager {
  public isMinimized = ref(false)
  public isCompact = ref(true)
  public isFloating = ref(false) // false = Modo Nativo OBR.action (renderizado atrás dos menus do Owlbear); true = Popover flutuante

  /** Altura da janela cheia (persistida em `cc_window_height`). */
  public defaultHeight = WINDOW_HEIGHT_DEFAULT
  /** Barra compacta: altura/largura e o left especial vêm de `obrLayout`. */
  public minimizedHeight = BAR_HEIGHT
  public minimizedWidth = BAR_WIDTH
  public minimizedLeft = BAR_LEFT

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

        // A janela da ficha pode ser recriada (o Owlbear destrói o iframe, o usuário
        // recarrega a aba): o flag de sessão faz a recriação nascer como barra, no
        // left especial, em vez de voltar ao tamanho cheio na lateral direita.
        // Só a janela da ficha: o chat e o iframe de pré-aquecimento compartilham
        // o mesmo storage e não podem nascer com a barra compacta.
        this.isMinimized.value = isSheetWindowContext() && isSheetWindowMinimized()

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
            // Mesmos limites de `mainWindow.readSavedHeight` (mesma chave de storage).
            if (!isNaN(parsedH) && parsedH >= WINDOW_HEIGHT_MIN) {
              this.defaultHeight = Math.min(WINDOW_HEIGHT_MAX, parsedH)
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
    return WINDOW_WIDTH
  }

  /**
   * A janela da ficha está na barra compacta?
   *
   * Dentro dela, o estado em memória manda. Nos outros iframes (dock de ações,
   * chat) `isMinimized` é sempre falso — quem sabe que o popover foi criado como
   * barra é o flag de sessão, o mesmo que `mainWindow.computeGeometry` consulta.
   * Sem isto, o `init()` de outro iframe redimensionaria a barra para a largura cheia.
   */
  private get sheetIsMinimized(): boolean {
    return this.isMinimized.value || isSheetWindowMinimized()
  }

  /**
   * Altura da janela cheia para um viewport conhecido.
   *
   * Recebe a altura em vez de ler `window.screen` porque o que limita a janela é o
   * **viewport do Owlbear** (`OBR.viewport`), que pode ser bem menor que o monitor —
   * e é o mesmo valor usado em `clampPosition`.
   */
  public heightFor(screenH: number): number {
    if (this.sheetIsMinimized) return this.minimizedHeight
    const top = this.currentPosition.value.top || OBR_SAFE_MARGIN.TOP_RIGHT
    const fits = screenH - top - OBR_SAFE_MARGIN.BOTTOM
    return Math.min(this.defaultHeight, Math.max(WINDOW_HEIGHT_FIT_MIN, fits))
  }

  public async setHeight(newHeight: number) {
    this.defaultHeight = Math.min(WINDOW_HEIGHT_MAX, Math.max(WINDOW_HEIGHT_MIN, newHeight))
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
    const minTop = left < LEFT_SIDE_THRESHOLD ? OBR_SAFE_MARGIN.TOP_LEFT : OBR_SAFE_MARGIN.TOP_RIGHT
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
    const minimized = this.sheetIsMinimized
    const width = minimized ? this.minimizedWidth : this.currentWidth
    const { screenW, screenH } = await this.getScreenDimensionsAsync()
    const height = this.heightFor(screenH)
    const url = this.getTargetUrl(true)

    // A barra minimizada mora no left especial. Como o SDK não permite mover um
    // popover vivo, isto só tem efeito quando o popover é (re)criado enquanto ela
    // está no ar (mesmo caminho de `mainWindow.computeGeometry`).
    const anchor = minimized ? { left: this.minimizedLeft, top: rawPos.top } : rawPos

    const clampedPos = this.clampPosition(anchor, width, height, screenW, screenH)
    // Minimizado, `currentPosition` guarda a posição da janela CHEIA: sobrescrevê-la
    // com a âncora da barra faria a janela expandida nascer na esquerda depois.
    if (!minimized) {
      this.currentPosition.value = clampedPos
      this.saveState()
    }

    const finalLeft = clampedPos.left
    const finalTop = clampedPos.top

    // Nunca recriar/recarregar o iframe que já está montado: só redimensiona.
    // `OBR.popover.open` no mesmo id descartaria todo o estado em memória (fichas
    // abertas, saves pendentes) — e, como o SDK não tem `setPosition`, a posição
    // recém-calculada simplesmente não se aplica a um popover já aberto.
    if (await this.resizeExistingPopover(width, height)) {
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
      // Se estiver rodando dentro do Action Popover nativo: aqui o alvo é a dock
      // do Owlbear, não o popover flutuante — o estado precisa refletir isso.
      this.isFloating.value = false
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
   * Redimensiona a janela persistente SEM recriar o iframe.
   * Retorna `true` quando a janela já existia e foi apenas ajustada.
   *
   * Não recebe posição de propósito: o SDK não oferece `setPosition`, então a
   * posição só existe no `OBR.popover.open` (ver `obrLayout`). Quem chama
   * `alignRight`/`snapTo`/`setPercentagePosition` com a janela já aberta calcula
   * uma posição que **não** será aplicada — o que muda aqui é só o tamanho.
   *
   * Distingue "não existe" de "existe e está oculta": uma janela oculta está em
   * 0×0 de propósito (`collapsePopoverSize`), e redimensioná-la aqui a traria de
   * volta à tela sem o usuário pedir. Nesse caso respondemos `true` (o iframe foi
   * reaproveitado) sem tocar nas dimensões.
   */
  private async resizeExistingPopover(
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
      console.log('[WindowManager] ♻️ Janela persistente redimensionada (sem recarregar o iframe):', {
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
      void this.minimizeInPlace()
    }

    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout)
    }

    this.restoreTimeout = setTimeout(() => {
      if (this.wasAutoMinimized) {
        // Nunca reexibe uma janela que o usuário ocultou de propósito.
        if (!isSheetWindowHidden()) void this.restoreInPlace()
        this.wasAutoMinimized = false
      }
      this.restoreTimeout = null
    }, Math.max(1000, durationSeconds * 1000))
  }

  /**
   * Auto-minimize de rolagem: só o visual, sem marcar o flag de sessão.
   *
   * São poucos segundos e não uma escolha do usuário — se o popover fosse recriado
   * no meio de uma rolagem, não pode voltar como barra compacta.
   */
  private async minimizeInPlace() {
    if (isSheetWindowHidden()) return
    this.isMinimized.value = true
    await this.applyHeight()
  }

  /** Par de `minimizeInPlace`: volta ao tamanho cheio sem tocar no flag de sessão. */
  private async restoreInPlace() {
    this.isMinimized.value = false
    await this.applyHeight()
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
    if (this.isMinimized.value) {
      await this.restore()
      return
    }
    await this.minimize()
  }

  /**
   * Minimiza para a barra compacta (100×48).
   *
   * Só redimensiona: a janela NÃO é fechada nem reaberta. O SDK não tem
   * `setPosition`, então a posição de um popover vivo é imutável — o left especial
   * (`minimizedLeft`) é a âncora usada quando o popover for (re)criado já
   * minimizado (ver `mainWindow.computeGeometry`).
   */
  public async minimize() {
    if (isSheetWindowHidden()) return
    this.isMinimized.value = true
    this.persistMinimized(true)
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
    this.persistMinimized(false)
    await this.applyHeight()
  }

  /**
   * Marca o modo minimizado no `sessionStorage`.
   *
   * Só a janela da ficha comanda a barra: as outras instâncias do app (chat,
   * pré-aquecimento, dock) compartilham o mesmo storage por origem e não podem
   * herdar o estado. O flag é o que faz um popover recriado nascer como barra, no
   * left especial, em vez de voltar ao tamanho cheio na lateral direita.
   */
  private persistMinimized(minimized: boolean) {
    if (!isSheetWindowContext()) return
    setSheetWindowMinimized(minimized)
  }

  private async applyHeight() {
    const height = this.isMinimized.value ? this.minimizedHeight : this.defaultHeight
    const width = this.isMinimized.value ? this.minimizedWidth : this.currentWidth

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
   * Legado: o par "compacta/expandida" de larguras não existe mais (a largura da
   * janela é única — `WINDOW_WIDTH` em `obrLayout`). Mantido apenas para não
   * quebrar quem importa; não há chamadores no app.
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

  /**
   * Alinha a janela no extremo direito da tela respeitando a margem segura do Owlbear Rodeo.
   * Padrões: `OBR_SAFE_MARGIN.RIGHT` da borda direita e `OBR_SAFE_MARGIN.TOP_RIGHT` no topo.
   */
  public async alignRight(marginRight = OBR_SAFE_MARGIN.RIGHT, topMargin = OBR_SAFE_MARGIN.TOP_RIGHT) {
    if (
      typeof window !== 'undefined' &&
      window.location.hash.includes('/table-chat')
    ) {
      return
    }
    const { screenW, screenH } = await this.getScreenDimensionsAsync()

    const w = this.isMinimized.value ? this.minimizedWidth : this.currentWidth
    const rawLeft = Math.max(OBR_SAFE_MARGIN.LEFT, screenW - w - marginRight)
    const rawTop = Math.max(OBR_SAFE_MARGIN.TOP_RIGHT, topMargin)

    const clamped = this.clampPosition({ left: rawLeft, top: rawTop }, w, this.heightFor(screenH), screenW, screenH)

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

    const w = this.isMinimized.value ? this.minimizedWidth : this.currentWidth
    const clamped = this.clampPosition({ left: rawLeft, top: rawTop }, w, this.heightFor(screenH), screenW, screenH)

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

    const w = this.isMinimized.value ? this.minimizedWidth : this.currentWidth
    const h = this.heightFor(screenH)

    let left: number = OBR_SAFE_MARGIN.LEFT
    let top: number = OBR_SAFE_MARGIN.TOP_RIGHT

    switch (corner) {
      case 'top-left':
        left = OBR_SAFE_MARGIN.LEFT // não sobrepõe a barra de ferramentas
        top = OBR_SAFE_MARGIN.TOP_LEFT // não sobrepõe o logo e os players
        break
      case 'top-right':
        left = Math.max(OBR_SAFE_MARGIN.LEFT, screenW - w - OBR_SAFE_MARGIN.RIGHT)
        top = OBR_SAFE_MARGIN.TOP_RIGHT // margem limpa no topo
        break
      case 'bottom-left':
        left = OBR_SAFE_MARGIN.LEFT // barra de ferramentas
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
      this.persistMinimized(false)
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
        const { screenH } = await this.getScreenDimensionsAsync()
        try {
          await OBR.popover.close(OBR_POPOVER_ID)
        } catch {
          // ignore
        }
        try {
          await OBR.action.setWidth(this.currentWidth)
          await OBR.action.setHeight(this.heightFor(screenH))
          await OBR.action.open()
        } catch (err) {
          console.warn('[WindowManager] Falha ao acoplar no action:', err)
        }
      }
    }
  }
}

export const windowManager = new WindowManager()
