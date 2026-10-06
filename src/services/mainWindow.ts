import OBR from '@owlbear-rodeo/sdk'
import { flushPendingSaves } from '@/io/persistenceFlush'
import {
  BAR_HEIGHT,
  BAR_LEFT,
  BAR_TOP,
  BAR_WIDTH,
  OBR_POPOVER_ID,
  OBR_SAFE_MARGIN,
  OBR_TOP_DEFAULT,
  WINDOW_HEIGHT_DEFAULT,
  WINDOW_HEIGHT_MAX,
  WINDOW_HEIGHT_MIN,
  WINDOW_WIDTH,
} from './obrLayout'

/**
 * Janela principal persistente da ficha (iframe do Owlbear Rodeo).
 *
 * Regra de ouro deste módulo: **o iframe nunca é destruído**.
 * - `OBR.popover.open` com o MESMO id recarrega o iframe (perde todo o estado em memória).
 * - `OBR.popover.close` remove o iframe.
 *
 * Portanto:
 *  - a janela é aberta UMA vez, quando a sala abre (ou quando o usuário pede);
 *  - "fechar" apenas OCULTA o app via CSS (`sheet-window-hidden`) e mantém o iframe montado,
 *    transparente e sem capturar cliques (`pointer-events: none`);
 *  - reabrir uma ficha reutiliza o iframe existente e só navega a rota (sem reload).
 *
 * Geometria (margens, largura, altura e a barra compacta) vem de `./obrLayout`.
 */
export const OBR_MAIN_WINDOW_POPOVER_ID = OBR_POPOVER_ID

const SESSION_HIDDEN_KEY = 'cc_sheet_window_hidden'
const SESSION_MINIMIZED_KEY = 'cc_sheet_window_minimized'
const SESSION_AUTO_OPEN_KEY = 'cc_sheet_window_autopen'
const SESSION_RESTORE_INTENT_KEY = 'cc_sheet_restore_intent'
const SESSION_WINDOW_NAME_KEY = 'cc_sheet_window_name'
const SHEET_WINDOW_HEIGHT_KEY = 'cc_window_height'
const SHEET_WINDOW_POS_KEY = 'cc_window_state'

export const SHEET_WINDOW_HIDDEN_CLASS = 'sheet-window-hidden'

/**
 * A janela da ficha registra um batimento no `sessionStorage` (compartilhado
 * entre os iframes da mesma sala). Se o Owlbear destruir o popover por conta
 * própria — algo que `OBR.popover.getWidth` pode não reportar — o batimento
 * fica velho e os outros iframes recriam a janela automaticamente.
 */
const SESSION_HEARTBEAT_KEY = 'cc_sheet_window_heartbeat'
const HEARTBEAT_INTERVAL_MS = 5000
const HEARTBEAT_STALE_MS = 20000

/**
 * A janela persistente está no modo barra compacta?
 *
 * Vive no `sessionStorage` (mesmo escopo da intenção de ocultação) porque a janela
 * pode ser recriada: o Owlbear destrói o iframe por conta própria (recriação por
 * batimento de vida) ou o usuário recarrega a aba. Sem o flag, o iframe novo
 * voltaria ao tamanho cheio, na lateral direita, e a barra sumiria.
 */
export function isSheetWindowMinimized(): boolean {
  return safeSessionGet(SESSION_MINIMIZED_KEY) === 'true'
}

export function setSheetWindowMinimized(minimized: boolean): void {
  safeSessionSet(SESSION_MINIMIZED_KEY, minimized ? 'true' : 'false')
}

// ---------------------------------------------------------------------------
// Acesso seguro ao storage (iframe de terceiros pode ter storage bloqueado)
// ---------------------------------------------------------------------------

function safeSessionGet(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

function safeSessionRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Contexto do iframe
// ---------------------------------------------------------------------------

/**
 * `true` quando este contexto É a janela persistente da ficha.
 */
export function isSheetWindowContext(): boolean {
  if (typeof window === 'undefined') return false
  const url = `${window.location.search}${window.location.hash}`
  return url.includes('windowType=floating')
}

async function ensureObrReady(): Promise<boolean> {
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

// ---------------------------------------------------------------------------
// Estado de ocultação: o app vive no DOM; o storage guarda a intenção
// ---------------------------------------------------------------------------

export function isSheetWindowHidden(): boolean {
  return safeSessionGet(SESSION_HIDDEN_KEY) === 'true'
}

function readSavedHeight(): number {
  const parsed = parseInt(safeLocalGet(SHEET_WINDOW_HEIGHT_KEY) || '', 10)
  if (!isNaN(parsed) && parsed >= WINDOW_HEIGHT_MIN) {
    return Math.min(WINDOW_HEIGHT_MAX, parsed)
  }
  return WINDOW_HEIGHT_DEFAULT
}

function readSavedPosition(): { left: number; top: number } | null {
  try {
    const raw = safeLocalGet(SHEET_WINDOW_POS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        // Mesmos pisos de `windowManager.loadState`: os dois leem a MESMA chave.
        return {
          left: Math.max(OBR_SAFE_MARGIN.LEFT, parsed.left),
          top: Math.max(OBR_SAFE_MARGIN.TOP_RIGHT, parsed.top),
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** Dimensões reais do viewport do Owlbear (com fallback para a tela). */
async function viewportSize(): Promise<{ screenW: number; screenH: number }> {
  let screenW = 1920
  let screenH = 1080
  if (OBR.isAvailable && (await ensureObrReady())) {
    try {
      const [vpW, vpH] = await Promise.all([
        OBR.viewport.getWidth().catch(() => 1920),
        OBR.viewport.getHeight().catch(() => 1080),
      ])
      if (vpW && vpW > 500) screenW = vpW
      if (vpH && vpH > 500) screenH = vpH
      return { screenW, screenH }
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

async function computeGeometry(): Promise<{ left: number; top: number; width: number; height: number }> {
  const { screenW, screenH } = await viewportSize()
  const saved = readSavedPosition()

  // Barra compacta: nasce no left seguro, não na lateral direita. Vale quando a
  // janela é (re)criada já minimizada (iframe destruído pelo Owlbear, recarga da
  // aba enquanto a ficha estava na barra).
  if (isSheetWindowMinimized()) {
    return {
      left: BAR_LEFT,
      top: Math.max(BAR_TOP, saved?.top ?? OBR_TOP_DEFAULT),
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
    }
  }

  // A janela precisa caber entre o topo e a dock inferior.
  const fits = screenH - OBR_SAFE_MARGIN.TOP_RIGHT - OBR_SAFE_MARGIN.BOTTOM
  const height = Math.min(readSavedHeight(), Math.max(WINDOW_HEIGHT_MIN, fits))
  if (saved) return { ...saved, width: WINDOW_WIDTH, height }
  // Sem posição salva: encosta na lateral direita, respeitando as barras do OBR.
  return {
    left: Math.max(OBR_SAFE_MARGIN.LEFT, screenW - WINDOW_WIDTH - OBR_SAFE_MARGIN.RIGHT),
    top: OBR_TOP_DEFAULT,
    width: WINDOW_WIDTH,
    height,
  }
}

// ---------------------------------------------------------------------------
// Ocultar / restaurar (CSS + intenção persistida)
// ---------------------------------------------------------------------------

function applyHiddenClass(hidden: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(SHEET_WINDOW_HIDDEN_CLASS, hidden)
  document.body.classList.toggle(SHEET_WINDOW_HIDDEN_CLASS, hidden)
}

// ---------------------------------------------------------------------------
// Batimento de vida da janela persistente
// ---------------------------------------------------------------------------

function touchHeartbeat(): void {
  safeSessionSet(SESSION_HEARTBEAT_KEY, String(Date.now()))
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function startHeartbeat(): void {
  if (heartbeatTimer || typeof window === 'undefined') return
  touchHeartbeat()
  heartbeatTimer = setInterval(touchHeartbeat, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

/**
 * O popover existe no Owlbear mas não dá sinal de vida? Então ele foi
 * destruído/descarregado sem fechar o registro: pode ser recriado sem risco.
 */
function heartbeatIsStale(): boolean {
  const last = parseInt(safeSessionGet(SESSION_HEARTBEAT_KEY) || '', 10)
  if (isNaN(last)) return true
  return Date.now() - last > HEARTBEAT_STALE_MS
}

/**
 * Aplica a intenção de ocultação sem tocar no Owlbear Rodeo.
 * Usado no boot para nascer já oculto (sem flash de 1 frame).
 */
export function syncSheetWindowVisibility(): boolean {
  const hidden = isSheetWindowHidden()
  applyHiddenClass(hidden)
  return hidden
}

/**
 * Colapsa a janela do Owlbear para 0×0.
 *
 * Isto é o equivalente possível, de dentro do iframe, ao `display: none` no
 * elemento `<iframe class="extension-frame">`: esse iframe pertence ao DOM do
 * Owlbear Rodeo (outra origem), então a única forma de removê-lo do layout é
 * pelos setters do SDK. Com 0×0 o iframe perde área e deixa de interceptar
 * cliques no canvas — que é o efeito prático pretendido.
 *
 * O documento NÃO é destruído: o contexto continua vivo e sincronizado.
 */
async function collapsePopoverSize(): Promise<void> {
  if (!OBR.isAvailable) return
  if (!(await ensureObrReady())) return
  try {
    await OBR.popover.setWidth(OBR_MAIN_WINDOW_POPOVER_ID, 0)
    await OBR.popover.setHeight(OBR_MAIN_WINDOW_POPOVER_ID, 0)
  } catch (e) {
    console.warn('[MainWindow] Falha ao colapsar a janela da ficha:', e)
  }
}

/** Reaplica o tamanho salvo da janela (usado ao restaurar). */
async function applyPersistedSize(): Promise<void> {
  if (!isSheetWindowContext()) return
  if (!(await ensureObrReady())) return
  // Sempre pela `computeGeometry`: é ela que sabe que uma janela minimizada tem
  // 100×48 no left especial, e não a largura cheia na lateral direita.
  const { width, height } = await computeGeometry()
  try {
    await OBR.popover.setHeight(OBR_MAIN_WINDOW_POPOVER_ID, height)
    await OBR.popover.setWidth(OBR_MAIN_WINDOW_POPOVER_ID, width)
  } catch (e) {
    console.warn('[MainWindow] Falha ao aplicar dimensões salvas:', e)
  }
}

/**
 * A janela existe no Owlbear Rodeo?
 *
 * Uma janela OCULTA tem 0×0 de propósito (ver `collapsePopoverSize`), então
 * largura zero conta como existente-porém-oculta: `isMainWindowOpen` responde
 * pelo registro do popover e `isSheetWindowHidden` diz se ela está fora da tela.
 */
export async function isMainWindowOpen(): Promise<boolean> {
  if (!OBR.isAvailable) return false
  if (!(await ensureObrReady())) return false
  try {
    const width = await OBR.popover.getWidth(OBR_MAIN_WINDOW_POPOVER_ID).catch(() => undefined)
    if (width === undefined || width === null) return false
    return true
  } catch {
    return false
  }
}

export async function hideSheetWindow(): Promise<void> {
  if (!isSheetWindowContext()) return
  // Garante que nenhum save agendado (throttle) fique pendente.
  flushPendingSaves()
  safeSessionSet(SESSION_HIDDEN_KEY, 'true')
  // Ordem: primeiro o display:none no DOM (feedback imediato), depois o colapso
  // do popover no Owlbear (o iframe sai do layout de fato).
  applyHiddenClass(true)
  await collapsePopoverSize()
  console.log('[MainWindow] Janela da ficha ocultada (display:none + 0×0, iframe preservado).')
}

/**
 * Torna a janela visível novamente. Não recria nem recarrega o iframe:
 * restaura as dimensões salvas no Owlbear Rodeo e então remove o `display:none`.
 *
 * A ordem importa: a janela estava em 0×0, então precisa voltar a ter área
 * antes de reaparecer — caso contrário o conteúdo ficaria montado dentro de uma
 * caixa sem tamanho por um frame.
 */
export async function restoreSheetWindow(): Promise<boolean> {
  if (!isSheetWindowContext()) return false
  safeSessionSet(SESSION_HIDDEN_KEY, 'false')
  await applyPersistedSize()
  applyHiddenClass(false)
  console.log('[MainWindow] Janela da ficha restaurada (mesmo iframe).')
  return true
}

export async function toggleSheetWindow(): Promise<void> {
  if (isSheetWindowHidden()) {
    await restoreSheetWindow()
  } else {
    await hideSheetWindow()
  }
}

/**
 * Avisa a janela persistente (em outro iframe) que ela deve se reexibir.
 *
 * O CSS de ocultação é aplicado dentro da própria janela, então limpar a
 * intenção aqui não basta: precisamos que ela execute `restoreSheetWindow()`.
 * Usa o mesmo envelope do bridge, com `postMessage` para os iframes irmãos.
 */
function broadcastRestoreToSheetWindow(): void {
  if (typeof window === 'undefined') return
  const envelope = {
    obrBridgeBroadcast: true,
    payload: { type: 'RESTORE_MAIN_WINDOW', msgId: `restore_${Date.now()}` },
  }
  const origin = window.location.origin
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(envelope, origin)
    for (let i = 0; i < window.frames.length; i++) {
      try {
        window.frames[i].postMessage(envelope, origin)
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Abrir / reutilizar a janela
// ---------------------------------------------------------------------------

export interface OpenMainWindowOptions {
  /** Reexibe a janela mesmo que o usuário a tenha ocultado. */
  restoreIfHidden?: boolean
  /** Rota interna a ser aberta (ex.: `/active-mode/npc-runner/xyz`). */
  targetRoute?: string
}

const DEFAULT_WINDOW_URL = '/?windowType=floating#/active-mode'

/**
 * Abre a janela persistente se ela ainda não existir; caso exista, apenas
 * reexibe (sem `OBR.popover.open`, que recarregaria o iframe).
 */
export async function openMainWindow(options: OpenMainWindowOptions = {}): Promise<void> {
  const { restoreIfHidden = false, targetRoute } = options

  if (typeof window === 'undefined') return

  if (!OBR.isAvailable) {
    if (!isSheetWindowContext()) window.open(DEFAULT_WINDOW_URL, '_blank')
    return
  }

  if (!(await ensureObrReady())) return

  const alreadyOpen = await isMainWindowOpen()
  const inSheetWindow = isSheetWindowContext()
  // De dentro da própria janela não faz sentido checar batimento (somos nós).
  const needsRecreate = alreadyOpen && !inSheetWindow && heartbeatIsStale()

  if (alreadyOpen && !needsRecreate) {
    if (isSheetWindowHidden()) {
      if (!restoreIfHidden) {
        // Respeita a escolha do usuário de manter a ficha fora da tela.
        console.log('[MainWindow] Janela já existe e está oculta; reexibição não solicitada.')
        return
      }
      if (inSheetWindow) {
        await restoreSheetWindow()
      } else {
        // Estamos em outro iframe: a própria janela precisa remover a classe CSS.
        safeSessionSet(SESSION_HIDDEN_KEY, 'false')
        broadcastRestoreToSheetWindow()
      }
    }
    if (targetRoute) await requestMainWindowNavigation(targetRoute)
    return
  }

  if (needsRecreate) {
    console.warn('[MainWindow] Popover registrado sem batimento de vida; recriando a janela da ficha.')
  }

  // Primeira abertura: cria o único iframe da janela da ficha.
  const { left, top, width, height } = await computeGeometry()
  const url = targetRoute
    ? `/?windowType=floating#${targetRoute}`
    : DEFAULT_WINDOW_URL

  try {
    await OBR.popover.open({
      id: OBR_MAIN_WINDOW_POPOVER_ID,
      url,
      width,
      height,
      disableClickAway: true,
      hidePaper: true,
      marginThreshold: 0,
      anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
      transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
      anchorReference: 'POSITION',
      anchorPosition: { left: Math.round(left), top: Math.round(top) },
    })
    await restoreSheetWindow()
    console.log('[MainWindow] Janela persistente da ficha criada.')
  } catch (err) {
    console.warn('[MainWindow] Erro ao abrir popover principal:', err)
  }
}

/** Alias mantido para a UI antiga: "fechar" agora significa ocultar. */
export async function closeMainWindow(): Promise<void> {
  await hideSheetWindow()
}

// ---------------------------------------------------------------------------
// Navegação sem reload
// ---------------------------------------------------------------------------

function normalizeRoute(route: string): string {
  if (!route) return ''
  return route.startsWith('/') ? route : `/${route}`
}

/**
 * Pede à janela persistente que navegue para uma rota SEM recarregar o iframe.
 * Aplica direto quando estamos dentro dela; caso contrário, tenta `postMessage`
 * para a janela nomeada e por fim deixa a intenção no storage para o próximo boot.
 */
export async function requestMainWindowNavigation(route: string): Promise<boolean> {
  const path = normalizeRoute(route)
  if (!path) return false

  if (isSheetWindowContext()) {
    if (window.location.hash !== `#${path}`) window.location.hash = path
    return true
  }

  let delivered = false
  try {
    const targetName = safeSessionGet(SESSION_WINDOW_NAME_KEY)
    if (targetName) {
      const target = window.open('', targetName)
      if (target && !target.closed) {
        target.postMessage({ obrBridgeBroadcast: true, payload: { type: 'NAVIGATE', path } }, window.location.origin)
        target.focus()
        delivered = true
      }
    }
  } catch {
    // ignore
  }

  if (!delivered) {
    safeSessionSet(SESSION_RESTORE_INTENT_KEY, path)
    await openMainWindow({ restoreIfHidden: true })
  }
  return delivered
}

function consumeRestoreIntent(): string {
  const intent = safeSessionGet(SESSION_RESTORE_INTENT_KEY) || ''
  safeSessionRemove(SESSION_RESTORE_INTENT_KEY)
  return intent
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export interface SheetWindowInit {
  /** Navega para uma rota interna (o boot pode aguardar a intenção pendente). */
  navigate?: (route: string) => void
}

/**
 * Prepara a intenção de visibilidade ANTES da montagem do Vue (evita flash).
 * Retorna `true` se este contexto é a janela persistente da ficha.
 */
export function initSheetWindowVisibility(): boolean {
  const isSheetWindow = isSheetWindowContext()
  if (!isSheetWindow) return false
  try {
    safeSessionSet(SESSION_WINDOW_NAME_KEY, window.name || '')
  } catch {
    // ignore
  }
  // Enquanto esta janela viver, ela anuncia presença: se o Owlbear a destruir,
  // os iframes irmãos percebem e recriam a ficha automaticamente.
  startHeartbeat()
  try {
    window.addEventListener('pagehide', stopHeartbeat)
  } catch {
    // ignore
  }
  syncSheetWindowVisibility()
  return true
}

/**
 * Reaplica o estado visual no boot e executa qualquer navegação pendente
 * (ficha pedida enquanto a janela estava oculta).
 */
export async function bootSheetWindow(init: SheetWindowInit = {}): Promise<void> {
  if (!isSheetWindowContext()) return
  const hidden = syncSheetWindowVisibility()
  // Se a janela está visível mas ficou em 0×0 (colapso anterior, troca de cena,
  // recarga do host), recupera as dimensões salvas — autocorreção do colapso.
  if (!hidden) await applyPersistedSize()

  const intent = consumeRestoreIntent()
  if (intent && init.navigate) init.navigate(intent)
}

/**
 * Garante que a janela persistente da ficha exista assim que a sala carrega.
 *
 * É chamado de todo iframe que NÃO seja a própria janela da ficha — inclusive da
 * janela de chat/ações (`/table-chat`), que é o iframe que o Owlbear abre sozinho
 * ao entrar na sala. Era exatamente esse caminho que estava bloqueado, o que
 * deixava o botão "Abrir Janela da Ficha" como único jeito de criar o iframe.
 *
 * Se a janela já existe, apenas reexibe (mesmo iframe, sem recarregar); se não
 * existe, cria. Também limpa a intenção de ocultação: entrar na sala devolve a
 * ficha à tela.
 */
export async function ensureSheetWindowOnRoomJoin(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (isSheetWindowContext()) return false
  if (!OBR.isAvailable) return false

  // Uma tentativa por carga de iframe: o Owlbear pode montar mais de um iframe
  // irmão (chat + ferramentas) e não queremos rajada de aberturas.
  if (safeSessionGet(SESSION_AUTO_OPEN_KEY) === 'true') return false
  safeSessionSet(SESSION_AUTO_OPEN_KEY, 'true')

  const ready = await ensureObrReady()
  if (!ready) return false

  // Reexibe sempre: o iframe já montado é reaproveitado, então isto não custa
  // uma recarga e garante a ficha na tela ao entrar na sala.
  safeSessionSet(SESSION_HIDDEN_KEY, 'false')
  broadcastRestoreToSheetWindow()
  await openMainWindow({ restoreIfHidden: true })

  console.log('[MainWindow] Janela persistente da ficha garantida ao abrir a sala.')
  return true
}
