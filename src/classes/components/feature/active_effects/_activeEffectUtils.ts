import { ActiveEffect, IActiveEffectData } from './ActiveEffect'
import { keyPrefixes } from '@/i18n/contentKeys'
import { i18n } from '@/i18n'

interface IActiveEffectCallbackData {
  on_miss?: string | IActiveEffectData
  on_attack?: string | IActiveEffectData
  on_hit?: string | IActiveEffectData
  on_crit?: string | IActiveEffectData
}

interface IActiveEffectCallbackTarget {
  OnMiss?: ActiveEffect
  OnAttack?: ActiveEffect
  OnHit?: ActiveEffect
  OnCrit?: ActiveEffect
}

const mkEffect = (
  key: string,
  raw: string | IActiveEffectData | undefined,
  name: string,
  owner: any
): ActiveEffect | undefined => {
  if (!raw) return undefined
  const ownerKey = owner?._lkey ?? owner?.ID
  const effectKey = ownerKey ? `${ownerKey}.${key}` : undefined
  const data =
    typeof raw === 'string'
      ? { name, detail: raw, ...(effectKey ? { id: effectKey } : {}) }
      : { ...raw, ...(effectKey && !raw.id ? { id: effectKey } : {}) }
  if (effectKey) {
    keyPrefixes.set(data as object, effectKey)
  }
  return new ActiveEffect(data, owner, undefined, name)
}

export function initActiveEffectCallbacks(
  data: IActiveEffectCallbackData,
  target: IActiveEffectCallbackTarget,
  owner: any
): void {
  target.OnMiss = mkEffect('on_miss', data.on_miss, 'On Miss Effect', owner)
  target.OnAttack = mkEffect('on_attack', data.on_attack, 'On Attack Effect', owner)
  target.OnHit = mkEffect('on_hit', data.on_hit, 'On Hit Effect', owner)
  target.OnCrit = mkEffect('on_crit', data.on_crit, 'On Crit Effect', owner)
}

export function translateDamageType(type?: string): string {
  if (!type) return ''
  const lower = String(type).trim().toLowerCase()
  const key = `enums.damageType.${lower}`
  if (i18n?.global?.te?.(key)) {
    return i18n.global.t(key)
  }
  const fallbackMap: Record<string, string> = {
    kinetic: 'Cinético',
    energy: 'Energia',
    explosive: 'Explosivo',
    heat: 'Calor',
    burn: 'Queimadura',
    variable: 'Variável',
  }
  const currentLocale = i18n?.global?.locale?.value || i18n?.global?.locale || ''
  if (String(currentLocale).startsWith('pt') && fallbackMap[lower]) {
    return fallbackMap[lower]
  }
  return type
}

