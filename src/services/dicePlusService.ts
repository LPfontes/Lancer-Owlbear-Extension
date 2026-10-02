import { reactive, ref } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import { windowManager } from '@/services/windowManager'
import type { DddiceRollData, DddiceRollParams, DddiceRollValue } from '@/services/dddiceService'

export const COMPCON_SOURCE_ID = 'com.compcon.activemode'

export type DicePlusRollTarget = 'everyone' | 'self' | 'dm' | 'gm_only'

export interface DicePlusConfig {
  enabled: boolean
  rollTarget: DicePlusRollTarget
  showResults: boolean
  showNotification: boolean
  minimizeOnRoll: boolean
  minimizeDuration: number
}

const STORAGE_KEY_DICE_PLUS_CONFIG = 'compcon_dice_plus_config'

class DicePlusService {
  public config = reactive<DicePlusConfig>({
    enabled: true,
    rollTarget: 'everyone',
    showResults: true,
    showNotification: true,
    minimizeOnRoll: true,
    minimizeDuration: 4,
  })

  public isReady = ref<boolean>(false)
  public isRolling = ref<boolean>(false)
  public isChecking = ref<boolean>(false)
  public lastRoll = ref<any>(null)
  public lastError = ref<string | null>(null)

  private isInitialized = false

  public init() {
    if (this.isInitialized) return
    this.isInitialized = true
    this.loadConfig()

    if (OBR.isAvailable) {
      void this.checkReady()
    }
  }

  public loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DICE_PLUS_CONFIG)
      if (raw) {
        const parsed = JSON.parse(raw)
        Object.assign(this.config, parsed)
      } else {
        this.saveConfig()
      }
    } catch (e) {
      console.warn('[Dice+] Erro ao carregar configurações salvas:', e)
    }
  }

  public saveConfig(newConfig?: Partial<DicePlusConfig>) {
    if (newConfig) {
      Object.assign(this.config, newConfig)
    }
    try {
      localStorage.setItem(STORAGE_KEY_DICE_PLUS_CONFIG, JSON.stringify(this.config))
    } catch (e) {
      console.warn('[Dice+] Erro ao salvar configurações:', e)
    }
  }

  /**
   * Verifica se a extensão Dice+ está carregada e respondendo na sala do Owlbear Rodeo
   */
  public async checkReady(timeoutMs = 1500): Promise<boolean> {
    if (!OBR.isAvailable) {
      this.isReady.value = false
      return false
    }

    this.isChecking.value = true
    const requestId = crypto.randomUUID()

    return new Promise((resolve) => {
      let resolved = false
      let unsub: (() => void) | null = null

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (unsub) unsub()
          this.isReady.value = false
          this.isChecking.value = false
          resolve(false)
        }
      }, timeoutMs)

      try {
        unsub = OBR.broadcast.onMessage('dice-plus/isReady', (event) => {
          const data = event.data as any
          if (data && 'ready' in data && data.requestId === requestId) {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              if (unsub) unsub()
              this.isReady.value = true
              this.isChecking.value = false
              resolve(true)
            }
          }
        })

        OBR.broadcast
          .sendMessage(
            'dice-plus/isReady',
            {
              requestId,
              timestamp: Date.now(),
            },
            { destination: 'ALL' }
          )
          .catch((e) => {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              if (unsub) unsub()
              this.isReady.value = false
              this.isChecking.value = false
              console.warn('[Dice+] Erro ao enviar mensagem de isReady:', e)
              resolve(false)
            }
          })
      } catch (err) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          if (unsub) unsub()
          this.isReady.value = false
          this.isChecking.value = false
          resolve(false)
        }
      }
    })
  }

  /**
   * Valida uma notação de dados junto ao parser do Dice+
   */
  public async validateNotation(
    notation: string,
    timeoutMs = 1500
  ): Promise<{ valid: boolean; error?: string }> {
    if (!OBR.isAvailable) return { valid: false, error: 'Owlbear Rodeo não disponível' }

    const requestId = crypto.randomUUID()

    return new Promise((resolve) => {
      let resolved = false
      let unsub: (() => void) | null = null

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (unsub) unsub()
          resolve({ valid: false, error: 'Dice+ não respondeu' })
        }
      }, timeoutMs)

      try {
        unsub = OBR.broadcast.onMessage('dice-plus/validate-notation', (event) => {
          const data = event.data as any
          if (data && 'valid' in data && data.requestId === requestId) {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              if (unsub) unsub()
              resolve({ valid: data.valid, error: data.error?.message })
            }
          }
        })

        OBR.broadcast
          .sendMessage(
            'dice-plus/validate-notation',
            {
              requestId,
              notation,
              timestamp: Date.now(),
            },
            { destination: 'ALL' }
          )
          .catch((e) => {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              if (unsub) unsub()
              resolve({ valid: false, error: String(e) })
            }
          })
      } catch (err) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          if (unsub) unsub()
          resolve({ valid: false, error: String(err) })
        }
      }
    })
  }

  /**
   * Formata os parâmetros de rolagem do Lancer / COMP/CON em notação válida do Dice+
   */
  public formatDiceNotation(params: DddiceRollParams): string {
    let baseNotation = ''

    if (params.diceString) {
      baseNotation = params.diceString.trim()
    } else if (params.dice && params.dice.length > 0) {
      const counts: Record<string, number> = {}
      let mod = 0

      for (const d of params.dice) {
        if (d.type === 'mod') {
          mod += typeof d.value === 'number' ? d.value : 0
        } else {
          let dieType = d.type.toLowerCase()
          if (!dieType.startsWith('d')) dieType = `d${dieType}`
          counts[dieType] = (counts[dieType] || 0) + 1
        }
      }

      const parts: string[] = []
      for (const [type, count] of Object.entries(counts)) {
        parts.push(`${count}${type}`)
      }
      baseNotation = parts.join(' + ')

      if (mod !== 0) {
        baseNotation += mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`
      }
    }

    if (!baseNotation) {
      baseNotation = '1d20'
    }

    // Processa Acurácia ou Dificuldade (em Lancer: Nd6 pegando o maior)
    if (params.accuracy) {
      const count = Math.abs(params.accuracy)
      const accStr = count > 1 ? `${count}d6kh1` : '1d6'
      if (params.accuracy > 0) {
        baseNotation += ` + ${accStr}`
      } else {
        baseNotation += ` - ${accStr}`
      }
    }

    // Processa bônus fixo
    if (params.flatBonus) {
      if (params.flatBonus > 0) {
        baseNotation += ` + ${params.flatBonus}`
      } else {
        baseNotation += ` - ${Math.abs(params.flatBonus)}`
      }
    }

    // Adiciona etiqueta (label) se presente, higienizando caracteres que quebram o parser
    if (params.label) {
      const cleanLabel = params.label
        .replace(/[[\](),+\-*/#{}:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (cleanLabel) {
        baseNotation += ` #${cleanLabel}`
      }
    }

    return baseNotation
  }

  public hasDiceToRoll(params: DddiceRollParams): boolean {
    if (params.accuracy && params.accuracy !== 0) {
      return true
    }
    if (params.dice && params.dice.length > 0) {
      const physicalDice = params.dice.filter((d) => d.type && d.type.toLowerCase() !== 'mod')
      if (physicalDice.length > 0) return true
    }
    if (params.diceString && /\d*d\d+/i.test(params.diceString)) {
      return true
    }
    return false
  }

  /**
   * Executa a rolagem via extensão Dice+ no Owlbear Rodeo
   */
  public async rollDice(params: DddiceRollParams): Promise<DddiceRollData | false> {
    if (!this.config.enabled) return false
    if (!OBR.isAvailable) return false
    if (!this.hasDiceToRoll(params)) return false

    if (this.config.minimizeOnRoll) {
      windowManager.minimizeForRoll(this.config.minimizeDuration || 4)
    }

    const rollId = `roll_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const notation = this.formatDiceNotation(params)

    let playerId = 'player'
    let playerName = 'Piloto'
    try {
      playerId = await OBR.player.getId()
      playerName = (await OBR.player.getName()) || 'Piloto'
    } catch {}

    if (params.external_id) {
      playerName = params.external_id
    }

    this.isRolling.value = true
    this.lastError.value = null

    return new Promise((resolve) => {
      let resolved = false
      let unsubResult: (() => void) | null = null
      let unsubError: (() => void) | null = null

      const cleanup = () => {
        if (unsubResult) unsubResult()
        if (unsubError) unsubError()
        this.isRolling.value = false
      }

      // Timeout de segurança (4s é suficiente para comunicação local via OBR broadcast)
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          console.warn('[Dice+] Tempo esgotado aguardando resposta da extensão Dice+.')
          resolve(false)
        }
      }, 5000)

      try {
        // Escuta resultados no canal dedicado da nossa extensão
        unsubResult = OBR.broadcast.onMessage(`${COMPCON_SOURCE_ID}/roll-result`, (event) => {
          const data = event.data as any
          if (data && data.rollId === rollId) {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              cleanup()

              this.isReady.value = true
              this.lastRoll.value = data

              // Converte a estrutura de grupos do Dice+ para o padrão DddiceRollValue
              const values: DddiceRollValue[] = []
              const groups = data.result?.groups || []

              for (const group of groups) {
                if (group.dice && group.dice.length > 0) {
                  for (const d of group.dice) {
                    values.push({
                      type: d.diceType || group.diceType,
                      value: Number(d.value),
                      is_dropped: d.kept === false,
                    })
                  }
                } else if (group.isCondensed) {
                  values.push({
                    type: group.diceType,
                    value: Number(group.total),
                    is_dropped: false,
                  })
                }
              }

              if (this.config.showNotification && OBR.isAvailable) {
                const roller = params.external_id ? `${params.external_id}: ` : ''
                void OBR.notification
                  .show(`🎲 ${roller}${params.label || 'Dados rolados'} no Dice+!`)
                  .catch(() => {})
              }

              resolve({
                uuid: rollId,
                values,
                totalValue: data.result?.totalValue,
                rollSummary: data.result?.rollSummary,
                result: data.result,
              } as DddiceRollData)
            }
          }
        })

        // Escuta erros de rolagem no canal dedicado
        unsubError = OBR.broadcast.onMessage(`${COMPCON_SOURCE_ID}/roll-error`, (event) => {
          const data = event.data as any
          if (data && data.rollId === rollId) {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              cleanup()
              this.lastError.value = data.error || 'Erro desconhecido no Dice+'
              console.warn('[Dice+] Falha na rolagem:', data.error)
              resolve(false)
            }
          }
        })

        // Dispara a requisição de rolagem para o Dice+
        OBR.broadcast
          .sendMessage(
            'dice-plus/roll-request',
            {
              rollId,
              playerId,
              playerName,
              rollTarget: this.config.rollTarget,
              diceNotation: notation,
              showResults: this.config.showResults,
              timestamp: Date.now(),
              source: COMPCON_SOURCE_ID,
            },
            { destination: 'ALL' }
          )
          .catch((e) => {
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              cleanup()
              this.lastError.value = String(e)
              console.warn('[Dice+] Erro ao enviar mensagem de roll-request:', e)
              resolve(false)
            }
          })
      } catch (e: any) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          cleanup()
          this.lastError.value = e?.message || String(e)
          console.warn('[Dice+] Exceção ao rolar dados:', e)
          resolve(false)
        }
      }
    })
  }

  /**
   * Rolagem de teste para validação de conectividade com o Dice+
   */
  public async testRoll(): Promise<{ success: boolean; message: string }> {
    if (!OBR.isAvailable) {
      return {
        success: false,
        message: 'Owlbear Rodeo SDK não está disponível neste ambiente.',
      }
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
        return {
          success: true,
          message: 'Dados 3D arremessados com sucesso no Dice+!',
        }
      } else {
        return {
          success: false,
          message:
            this.lastError.value ||
            'Não foi possível rolar no Dice+. Certifique-se de que a extensão Dice+ está instalada e aberta na sala.',
        }
      }
    } finally {
      this.config.enabled = wasEnabled
    }
  }
}

export const dicePlusService = new DicePlusService()
