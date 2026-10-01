import { reactive, ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import { windowManager } from '@/services/windowManager'

export interface DddiceDie {
  type: string // e.g. 'd20', 'd6', 'd4', 'd8', 'd10', 'd12', 'd100', 'mod'
  theme?: string
  value?: number
}

export interface DddiceRollValue {
  id?: string
  type: string
  value: number
  label?: string
  theme?: string
  is_dropped?: boolean
}

export interface DddiceRollData {
  uuid?: string
  slug?: string
  room?: any
  user?: any
  values: DddiceRollValue[]
  [key: string]: any
}

export interface DddiceConfig {
  version?: number
  enabled: boolean
  roomSlug: string
  passcode?: string
  apiKey: string
  theme: string
  autoDetectRoom: boolean
  showNotification: boolean
  minimizeOnRoll: boolean
  minimizeDuration: number
}

export interface DddiceRollParams {
  dice?: DddiceDie[]
  diceString?: string // e.g. "1d20+2d6+4", "1d6+3", "2d6-1"
  flatBonus?: number // positive or negative flat modifier
  accuracy?: number // positive = accuracy, negative = difficulty (rolls d6s)
  operator?: any
  label?: string
  external_id?: string
  whisper?: string[]
}

const STORAGE_KEY_CONFIG = 'compcon_dddice_config'
const STORAGE_KEY_GUEST_TOKEN = 'compcon_dddice_guest_token'
const API_BASE = 'https://dddice.com/api/1.0'
const DEFAULT_THEME = 'dddice-bees'
const CONFIG_VERSION = 2

class DddiceService {
  public config = reactive<DddiceConfig>({
    version: CONFIG_VERSION,
    enabled: true,
    roomSlug: '',
    passcode: '',
    apiKey: '',
    theme: DEFAULT_THEME,
    autoDetectRoom: true,
    showNotification: true,
    minimizeOnRoll: true,
    minimizeDuration: 4,
  })

  public isConnected = ref<boolean>(false)
  public isRolling = ref<boolean>(false)
  public lastRoll = ref<any>(null)
  public lastError = ref<string | null>(null)
  public availableThemes = ref<Array<{ id: string; name: string }>>([
    { id: 'dddice-bees', name: 'Bees (Standard Gratuito)' },
    { id: 'dddice-digital', name: 'Digital (Sci-Fi)' },
    { id: 'dddice-black', name: 'Black' },
    { id: 'dddice-red', name: 'Red' },
    { id: 'dddice-blue', name: 'Blue' },
  ])

  private guestToken: string | null = null
  private joinedRooms = new Set<string>()
  private isInitialized = false

  public init() {
    if (this.isInitialized) return
    this.isInitialized = true

    this.loadConfig()
    this.guestToken = localStorage.getItem(STORAGE_KEY_GUEST_TOKEN)

    if (this.config.autoDetectRoom && this.config.enabled && OBR.isAvailable) {
      void this.detectRoomFromObr()
    }
  }

  public loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (!parsed.version || parsed.version < CONFIG_VERSION) {
          parsed.enabled = true
          parsed.version = CONFIG_VERSION
        }
        Object.assign(this.config, parsed)
      } else {
        this.config.enabled = true
        this.config.version = CONFIG_VERSION
        this.saveConfig()
      }
    } catch (e) {
      console.warn('[dddice] Erro ao carregar configurações salvas:', e)
    }
  }

  public saveConfig(newConfig?: Partial<DddiceConfig>) {
    if (newConfig) {
      if (newConfig.roomSlug && newConfig.roomSlug !== this.config.roomSlug) {
        this.joinedRooms.delete(this.config.roomSlug)
      }
      Object.assign(this.config, newConfig)
    }
    this.config.version = CONFIG_VERSION
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config))
    } catch (e) {
      console.warn('[dddice] Erro ao salvar configurações:', e)
    }
  }

  /**
   * Entra na sala dddice como participante.
   * Obrigatório pela API do dddice para autorizar o usuário (guest ou autenticado)
   * a arremessar dados na sala, evitando erros HTTP 403 (Forbidden).
   */
  public async joinRoom(roomSlug?: string, passcode?: string): Promise<boolean> {
    if (!this.config.enabled) return false
    const slug = roomSlug || this.config.roomSlug
    if (!slug) return false

    // Se já ingressamos com sucesso nesta sala, não repete a chamada de rede
    if (this.joinedRooms.has(slug)) {
      this.isConnected.value = true
      return true
    }

    const token = await this.getAuthToken()
    if (!token) {
      if (this.config.apiKey) {
        console.warn('[dddice] Impossível entrar na sala sem token de autenticação válido.')
      }
      return false
    }

    try {
      const body: Record<string, any> = {}
      const pass = passcode !== undefined ? passcode : this.config.passcode
      if (pass && pass.trim()) {
        body.passcode = pass.trim()
      }

      const res = await fetch(`${API_BASE}/room/${slug}/participant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })

      // 200/201 = Ingressou agora; 409 = Já era participante da sala (ambos são sucesso)
      if (res.ok || res.status === 200 || res.status === 201 || res.status === 409) {
        this.joinedRooms.add(slug)
        this.isConnected.value = true
        this.lastError.value = null
        return true
      } else {
        const errJson = await res.json().catch(() => ({}))
        const msg = errJson?.data?.message || `Erro ao ingressar na sala (${res.status})`
        console.warn(`[dddice] Resposta ao ingressar na sala ${slug}:`, msg)
        return false
      }
    } catch (e: any) {
      console.warn(`[dddice] Exceção ao ingressar na sala ${slug}:`, e)
      return false
    }
  }

  /**
   * Obtém token de autorização: API key informada pelo usuário ou token guest temporário
   */
  public async getAuthToken(): Promise<string | null> {
    if (this.config.apiKey && this.config.apiKey.trim()) {
      return this.config.apiKey.trim()
    }

    if (this.guestToken) {
      return this.guestToken
    }

    try {
      const response = await fetch(`${API_BASE}/user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
      if (response.ok) {
        const data = await response.json()
        const rawToken = data?.data
        const token =
          typeof rawToken === 'string'
            ? rawToken
            : (rawToken?.secret || rawToken?.token || rawToken?.uuid || null)
        if (token && typeof token === 'string') {
          this.guestToken = token
          localStorage.setItem(STORAGE_KEY_GUEST_TOKEN, token)
          return token
        }
      }
    } catch {
      // Silencioso se offline
    }

    return null
  }

  /**
   * Detecta automaticamente o roomSlug a partir dos metadados da sala ou cena do Owlbear Rodeo
   */
  public async detectRoomFromObr(): Promise<string | null> {
    if (!OBR.isAvailable || !this.config.enabled) return null

    try {
      const [roomMeta, sceneMeta] = await Promise.all([
        OBR.room.getMetadata().catch(() => ({})),
        OBR.scene.getMetadata().catch(() => ({})),
      ])

      const allMeta: Record<string, any> = { ...roomMeta, ...sceneMeta }
      const slug = this.extractSlugFromMetadata(allMeta)

      if (slug) {
        console.log(`[dddice] Sala detectada automaticamente via Owlbear Rodeo: ${slug}`)
        this.config.roomSlug = slug
        this.saveConfig()
        this.isConnected.value = true
        void this.joinRoom(slug)
        return slug
      }
    } catch (e) {
      console.warn('[dddice] Erro ao inspecionar metadados do Owlbear:', e)
    }

    return null
  }

  private extractSlugFromMetadata(meta: Record<string, any>): string | null {
    // 1. Checagem direta de chaves conhecidas
    const directKeys = [
      'com.dddice/room',
      'com.dddice.owlbear/room',
      'com.dddice/roomSlug',
      'com.dddice.room',
      'dddice/room',
      'dddice_room',
      'dddiceRoom',
      'dddice',
    ]

    for (const k of directKeys) {
      if (meta[k]) {
        const val = meta[k]
        if (typeof val === 'string' && val.trim()) return this.cleanSlug(val)
        if (typeof val === 'object' && val !== null) {
          const inner = val.slug || val.room || val.roomSlug || val.roomId
          if (typeof inner === 'string' && inner.trim()) return this.cleanSlug(inner)
        }
      }
    }

    // 2. Busca genérica em chaves contendo "dddice"
    for (const [key, val] of Object.entries(meta)) {
      if (key.toLowerCase().includes('dddice')) {
        if (typeof val === 'string') {
          const s = this.cleanSlug(val)
          if (s) return s
        } else if (typeof val === 'object' && val !== null) {
          const inner = val.slug || val.room || val.roomSlug || val.roomId || val.id
          if (typeof inner === 'string') {
            const s = this.cleanSlug(inner)
            if (s) return s
          }
        }
      }

      // 3. Procura por URLs do dddice em qualquer valor string
      if (typeof val === 'string' && val.includes('dddice.com/room')) {
        const match = /dddice\.com\/rooms?\/([a-zA-Z0-9_-]+)/.exec(val)
        if (match && match[1]) return match[1]
      }
    }

    return null
  }

  private cleanSlug(raw: string): string {
    const trimmed = raw.trim()
    const urlMatch = /dddice\.com\/rooms?\/([a-zA-Z0-9_-]+)/.exec(trimmed)
    if (urlMatch && urlMatch[1]) return urlMatch[1]
    return trimmed.replace(/^https?:\/\/[^/]+\/rooms?\/?/, '').replace(/\/.*$/, '')
  }

  /**
   * Converte strings de dados (ex: "1d20+2d6+4", "1d6+3", "2d6-1", "3") e modificadores em objetos de dados para o dddice
   */
  public parseDiceString(diceString: string, accuracy = 0, flatBonus = 0): DddiceDie[] {
    const dice: DddiceDie[] = []
    const theme = this.config.theme || DEFAULT_THEME
    let totalMod = flatBonus || 0

    if (diceString) {
      const s = diceString.trim()
      // Regex para encontrar padrões [+-]? NdX (ex: 1d20, +2d6, d6, etc.)
      const dieRegex = /([+-]?)\s*(\d*)d(\d+)/gi
      let match: RegExpExecArray | null
      const matchedRanges: Array<[number, number]> = []

      while ((match = dieRegex.exec(s)) !== null) {
        matchedRanges.push([match.index, match.index + match[0].length])
        const count = match[2] ? parseInt(match[2], 10) : 1
        const rawSides = parseInt(match[3], 10)

        // Mapeia lados para dados suportados pelo dddice (d4, d6, d8, d10, d12, d20, d100)
        let sides = rawSides
        if (sides <= 3) {
          sides = 4
          totalMod -= count // usa 1d4 - 1 para 1d3
        }

        const validTypes = [4, 6, 8, 10, 12, 20, 100]
        if (!validTypes.includes(sides)) {
          sides = 6
        }

        const dieType = `d${sides}`
        for (let i = 0; i < count; i++) {
          dice.push({ type: dieType, theme })
        }
      }

      // Agora encontra modificadores numéricos fixos (+/- número) que não fazem parte de dados
      // Mascara as partes já consumidas por dados com espaços para isolar números soltos
      let remaining = s
      for (const [start, end] of [...matchedRanges].reverse()) {
        remaining = remaining.slice(0, start) + ' '.repeat(end - start) + remaining.slice(end)
      }
      const numRegex = /([+-]?)\s*(\d+)/g
      while ((match = numRegex.exec(remaining)) !== null) {
        const sign = match[1] === '-' ? -1 : 1
        const val = parseInt(match[2], 10) * sign
        totalMod += val
      }
    }

    // Adiciona dados de Acurácia ou Dificuldade (sempre d6)
    if (accuracy !== 0) {
      const accCount = Math.abs(accuracy)
      for (let i = 0; i < accCount; i++) {
        dice.push({ type: 'd6', theme })
      }
    }

    // Fallback: se nenhum dado foi parseado e não há modificador, envia ao menos 1d20
    if (dice.length === 0 && totalMod === 0) {
      dice.push({ type: 'd20', theme })
    }

    // Se há bônus flat/modificador diferente de zero, adiciona o dado do tipo 'mod'
    if (totalMod !== 0) {
      dice.push({ type: 'mod', value: totalMod })
    }

    return dice
  }

  /**
   * Dispara a rolagem 3D no dddice com fallback resiliente
   */
  public async rollDice(params: DddiceRollParams): Promise<DddiceRollData | false> {
    // Minimiza temporariamente a janela durante a rolagem para exibir os dados 3D na mesa
    if (this.config.minimizeOnRoll) {
      windowManager.minimizeForRoll(this.config.minimizeDuration || 4)
    }

    if (!this.config.enabled) return false
    if (!this.config.roomSlug) {
      // Se não tiver sala configurada, tenta autodetectar uma vez
      if (this.config.autoDetectRoom) {
        await this.detectRoomFromObr()
      }
      if (!this.config.roomSlug) return false
    }

    const token = await this.getAuthToken()
    if (!token) {
      console.warn('[dddice] Não foi possível autenticar com a API dddice.')
      return false
    }

    // Prepara os dados a serem rolados
    let diceList: DddiceDie[] = []
    if (params.dice && params.dice.length > 0) {
      const theme = this.config.theme || DEFAULT_THEME
      let totalMod = params.flatBonus || 0

      for (const d of params.dice) {
        if (d.type === 'mod') {
          totalMod += (typeof d.value === 'number' ? d.value : 0)
        } else {
          let dieType = d.type
          if (dieType === 'd3' || dieType === 'd2') {
            dieType = 'd4'
            totalMod -= 1 // usa 1d4 - 1 para 1d3
          }
          diceList.push({
            type: dieType,
            theme: d.theme || theme,
            ...(typeof d.value !== 'undefined' ? { value: d.value } : {}),
          })
        }
      }

      if (params.accuracy) {
        for (let i = 0; i < Math.abs(params.accuracy); i++) {
          diceList.push({ type: 'd6', theme })
        }
      }

      if (totalMod !== 0) {
        diceList.push({ type: 'mod', value: totalMod })
      }
    } else {
      diceList = this.parseDiceString(params.diceString || '1d20', params.accuracy || 0, params.flatBonus || 0)
    }

    // Garante que o participante ingressou na sala antes da rolagem para evitar 403
    if (!this.joinedRooms.has(this.config.roomSlug)) {
      await this.joinRoom(this.config.roomSlug)
    }

    this.isRolling.value = true
    this.lastError.value = null

    try {
      const payload: Record<string, any> = {
        dice: diceList,
        room: this.config.roomSlug,
        label: params.label || 'COMP/CON Roll',
        operator: params.operator || {},
      }

      if (params.external_id) {
        payload.external_id = params.external_id
      }
      if (params.whisper && params.whisper.length > 0) {
        payload.whisper = params.whisper
      }

      let res = await this.sendRollRequest(token, payload)

      // Se retornou 403 Forbidden, tenta ingressar como participante e retenta uma vez
      if (res.status === 403) {
        console.info(`[dddice] HTTP 403 Forbidden ao rolar. Tentando entrar na sala '${this.config.roomSlug}' como participante...`)
        const joined = await this.joinRoom(this.config.roomSlug)
        if (joined) {
          res = await this.sendRollRequest(token, payload)
        }
      }

      // Se falhou por permissão de tema, faz fallback para dddice-bees e retenta
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const msg = errJson?.data?.message || ''
        if (msg.includes('Permission denied to roll theme')) {
          console.warn(`[dddice] Permissão negada para tema '${this.config.theme}'. Fazendo fallback para '${DEFAULT_THEME}'...`)
          payload.dice = payload.dice.map((d: DddiceDie) => (d.type === 'mod' ? d : { ...d, theme: DEFAULT_THEME }))
          res = await this.sendRollRequest(token, payload)
        } else {
          throw new Error(msg || `Status ${res.status}`)
        }
      }

      if (res.ok) {
        const json = await res.json()
        this.lastRoll.value = json.data
        this.isConnected.value = true

        if (this.config.showNotification && OBR.isAvailable) {
          const roller = params.external_id ? `${params.external_id}: ` : ''
          void OBR.notification.show(`🎲 ${roller}${params.label || 'Dados rolados'} no dddice!`).catch(() => {})
        }

        return json.data
      } else {
        const errJson = await res.json().catch(() => ({}))
        const msg = errJson?.data?.message || `Erro ${res.status}`
        this.lastError.value = msg
        console.warn('[dddice] Erro na requisição de rolagem:', msg)
        return false
      }
    } catch (e: any) {
      this.lastError.value = e?.message || 'Falha de conexão com dddice'
      console.warn('[dddice] Exceção ao rolar dados:', e)
      return false
    } finally {
      this.isRolling.value = false
    }
  }

  private sendRollRequest(token: string, payload: any): Promise<Response> {
    return fetch(`${API_BASE}/roll`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Rolagem de teste para validação de conectividade
   */
  public async testRoll(): Promise<{ success: boolean; message: string }> {
    if (!this.config.roomSlug) {
      return { success: false, message: 'Informe ou detecte o código da sala (Room Slug) antes de testar.' }
    }

    const wasEnabled = this.config.enabled
    this.config.enabled = true

    try {
      const ok = await this.rollDice({
        diceString: '1d20+1d6',
        label: 'COMP/CON 3D Test Roll',
        external_id: 'COMP/CON System',
      })

      if (ok) {
        return { success: true, message: 'Dados 3D arremessados com sucesso na sala!' }
      } else {
        return { success: false, message: this.lastError.value || 'Falha ao conectar com o dddice.' }
      }
    } finally {
      this.config.enabled = wasEnabled
    }
  }

  /**
   * Carrega lista de temas da conta do usuário (se tiver API key) ou do dice-box
   */
  public async fetchDiceBoxThemes(): Promise<void> {
    const token = await this.getAuthToken()
    if (!token) return

    try {
      const res = await fetch(`${API_BASE}/dice-box`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const json = await res.json()
        const themes = (json.data || []).map((t: any) => ({
          id: t.id,
          name: t.name || t.id,
        }))
        if (themes.length > 0) {
          this.availableThemes.value = themes
        }
      }
    } catch (e) {
      console.warn('[dddice] Erro ao carregar temas do dice-box:', e)
    }
  }
}

export const dddiceService = new DddiceService()
