import * as _ from 'lodash-es'
import { i18n } from '@/i18n'
export const StatKey = {
  ACTIVATIONS: 'activations',
  SIZE: 'size',
  SIZES: 'sizes',
  STRUCTURE: 'structure',
  HP: 'hp',
  ARMOR: 'armor',
  STRESS: 'stress',
  HEAT: 'heat',
  HEATCAP: 'heatcap',
  REPAIR_CAPACITY: 'repairCapacity',
  ATTACK_BONUS: 'attackBonus',
  TECH_ATTACK: 'techAttack',
  LIMITED_BONUS: 'limitedBonus',
  SPEED: 'speed',
  EVASION: 'evasion',
  EDEF: 'edef',
  SENSOR_RANGE: 'sensorRange',
  SAVE_BONUS: 'saveBonus',
  SAVE_TARGET: 'saveTarget',
  GRAPPLE: 'grapple',
  RAM: 'ram',
  HULL: 'hull',
  AGI: 'agi',
  SYS: 'sys',
  ENG: 'eng',
  OVERCHARGE: 'overcharge',
  BURN: 'burn',
  OVERSHIELD: 'overshield',
} as const

export type StatKeyType = (typeof StatKey)[keyof typeof StatKey]

class Stats {
  public static get DefaultStats(): any {
    return {
      activations: 1,
      size: 1,
      sizes: [0.5, 1, 2, 3],
      structure: 0,
      hp: 0,
      armor: 0,
      stress: 0,
      heat: 0,
      heatcap: 0,
      repairCapacity: 0,
      attackBonus: 0,
      techAttack: 0,
      limitedBonus: 0,
      speed: 0,
      evasion: 0,
      edef: 0,
      sensorRange: 0,
      saveBonus: 0,
      saveTarget: 0,
      grapple: 0,
      ram: 0,
      hull: 0,
      agi: 0,
      sys: 0,
      eng: 0,
      overcharge: 0,
      burn: 0,
      overshield: 0,
    }
  }

  public static IconMap = {
    activations: 'cc:activate',
    size: 'cc:size_1',
    structure: 'cc:structure',
    hp: 'mdi-heart',
    armor: 'mdi-shield',
    stress: 'cc:reactor',
    burn: 'mdi-fire',
    heat: 'cc:heat',
    heatcap: 'cc:heat',
    repairCapacity: 'cc:repair',
    attackBonus: 'cc:weapon',
    techAttack: 'cc:quick_tech',
    limitedBonus: 'cc:ammo',
    speed: 'mdi-arrow-right-bold-hexagon-outline',
    evasion: 'cc:evasion',
    edef: 'cc:edef',
    sensorRange: 'cc:sensor',
    saveBonus: 'cc:save',
    saveTarget: 'cc:save',
    grapple: 'mdi-carabiner',
    ram: 'mdi-car-brake-low-pressure',
    hull: 'mdi-alpha-h-box-outline',
    agi: 'mdi-alpha-a-box-outline',
    sys: 'mdi-alpha-s-box-outline',
    eng: 'mdi-alpha-e-box-outline',
    overshield: 'mdi-hexagon-multiple-outline',
    overcharge: 'cc:overcharge',
    grit: 'mdi-star-four-points-outline',
  }

  public static TieredDefaults: Record<string, string> = {
    activations: '0/0/0',
    size: '1/1/1',
    sizes: '0/0/0',
    structure: '0/0/0',
    hp: '0/0/0',
    armor: '0/0/0',
    stress: '0/0/0',
    heat: '0/0/0',
    heatcap: '0/0/0',
    repairCapacity: '0/0/0',
    attackBonus: '1/2/3',
    techAttack: '0/0/0',
    limitedBonus: '0/0/0',
    speed: '0/0/0',
    evasion: '0/0/0',
    edef: '0/0/0',
    sensorRange: '0/0/0',
    saveBonus: '0/0/0',
    saveTarget: '0/0/0',
    grapple: '1/2/3',
    ram: '1/2/3',
    hull: '0/0/0',
    agi: '0/0/0',
    sys: '0/0/0',
    eng: '0/0/0',
    overcharge: '0/0/0',
    burn: '0/0/0',
    overshield: '0/0/0',
  }

  public static SortMap = {
    activations: 1,
    size: 2,
    structure: 4,
    hp: 5,
    overshield: 6,
    armor: 6,
    stress: 7,
    heat: 8,
    heatcap: 8,
    repairCapacity: 10,
    attackBonus: 11,
    techAttack: 12,
    limitedBonus: 13,
    speed: 14,
    evasion: 15,
    edef: 16,
    sensorRange: 17,
    saveBonus: 18,
    saveTarget: 19,
    grapple: 20,
    ram: 21,
    hull: 22,
    agi: 23,
    sys: 24,
    eng: 25,
    burn: 26,
  }

  private static readonly KEY_ALIASES: Record<string, string> = {
    repcap: 'repairCapacity',
    repaircapacity: 'repairCapacity',
    savebonus: 'saveBonus',
    save: 'saveTarget',
    savetarget: 'saveTarget',
    sensor: 'sensorRange',
    sensors: 'sensorRange',
    sensorrange: 'sensorRange',
    edefense: 'edef',
    agility: 'agi',
    systems: 'sys',
    engineering: 'eng',
    techattack: 'techAttack',
    limitedbonus: 'limitedBonus',
    attackbonus: 'attackBonus',
    heatcapacity: 'heatcap',
  }

  private static readonly KEY_LABELS: Record<string, string> = {
    hull: 'Casco',
    casco: 'Casco',
    agi: 'Agilidade',
    agility: 'Agilidade',
    agilidade: 'Agilidade',
    sys: 'Sistemas',
    systems: 'Sistemas',
    sistemas: 'Sistemas',
    eng: 'Engenharia',
    engineering: 'Engenharia',
    engenharia: 'Engenharia',
    evasion: 'Evasão',
    evasao: 'Evasão',
    edef: 'Defesa-E',
    edefense: 'Defesa-E',
    sensorrange: 'Alcance dos Sensores',
    sensor_range: 'Alcance dos Sensores',
    sensors: 'Sensores',
    savetarget: 'Alvo de Salvaguarda',
    save_target: 'Alvo de Salvaguarda',
    save: 'Alvo de Salvaguarda',
    hp: 'PV',
    armor: 'Armadura',
    speed: 'Velocidade',
    heat: 'Capacidade de Calor',
    heatcap: 'Capacidade de Calor',
    heatcapacity: 'Capacidade de Calor',
    techattack: 'Ataque Tecnológico',
    tech_attack: 'Ataque Tecnológico',
    attackbonus: 'Bônus de Ataque',
    repaircapacity: 'Capacidade de Reparos',
    grapple: 'Agarrar',
    ram: 'Empurrar',
    overshield: 'Escudo Provisório',
    structure: 'Estrutura',
    stress: 'Estresse',
    burn: 'Queimadura',
    size: 'Tamanho',
    activations: 'Ativações',
  }

  public static cleanKey(key: string): string {
    const stripped = key.replace(/[\s_-]/g, '')
    const k = Stats.KEY_ALIASES[stripped.toLowerCase()] ?? stripped
    return k.charAt(0).toLowerCase() + k.slice(1)
  }

  public static expandKey(key: string): string {
    const stripped = key.replace(/[\s_-]/g, '').toLowerCase()
    const lower = key.toLowerCase()

    try {
      const g: any = i18n.global
      if (g) {
        const locale = typeof g.locale === 'object' ? g.locale.value : g.locale
        const candidates = [
          `stats.${key}`,
          `stats.${lower}`,
          `stats.${stripped}`,
          `ui.titles.${key}`,
          `ui.titles.${lower}`,
        ]
        for (const cand of candidates) {
          if (typeof g.te === 'function') {
            if (g.te(cand, locale) || g.te(cand, 'en')) {
              return g.t(cand)
            }
          } else if (typeof g.t === 'function') {
            const res = g.t(cand)
            if (res && res !== cand) return res
          }
        }
      }
    } catch (_e) {}

    const label = Stats.KEY_LABELS[stripped] || Stats.KEY_LABELS[lower]
    if (label) return label

    let k = key
    if (['grapple', 'ram'].includes(lower)) k += ' bonus'

    return _.upperFirst(k)
      .replace(/([A-Z])/g, ' $1')
      .trim()
  }
}

export { Stats }
