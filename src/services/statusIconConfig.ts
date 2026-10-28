import OBR, { type Metadata } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'

/**
 * Chave nativa do COMP/CON para configuração visual dos marcadores de status na sala.
 * Mantém compatibilidade de leitura com `com.lancer.status_markers/custom_icons`.
 */
export const ROOM_STATUS_ICONS_KEY = 'com.compcon.activemode/status_icons'
export const LEGACY_ROOM_STATUS_ICONS_KEY = 'com.lancer.status_markers/custom_icons'

export type BadgePlacement = 'right' | 'left' | 'bottom' | 'top'

export interface RoomStatusIconsConfig {
  v: 1
  customUrls: Record<string, string>
  badgeScale?: number
  placement?: BadgePlacement
}

export const DEFAULT_BADGE_SCALE = 0.28
export const MIN_BADGE_SCALE = 0.18
export const MAX_BADGE_SCALE = 0.45

export const currentIconsConfig = ref<RoomStatusIconsConfig>({
  v: 1,
  customUrls: {},
  badgeScale: DEFAULT_BADGE_SCALE,
  placement: 'right',
})

export function sanitizeStatusIconsConfig(raw: unknown): RoomStatusIconsConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawUrls =
    obj.customUrls && typeof obj.customUrls === 'object'
      ? (obj.customUrls as Record<string, unknown>)
      : {}
  const customUrls: Record<string, string> = {}
  for (const [key, val] of Object.entries(rawUrls)) {
    if (typeof val === 'string' && val.trim().startsWith('http')) {
      customUrls[key.trim().toLowerCase()] = val.trim()
    }
  }

  let badgeScale = DEFAULT_BADGE_SCALE
  if (typeof obj.badgeScale === 'number' && Number.isFinite(obj.badgeScale)) {
    badgeScale = Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, obj.badgeScale))
  }

  const validPlacements: BadgePlacement[] = ['right', 'left', 'bottom', 'top']
  const placement: BadgePlacement = validPlacements.includes(obj.placement as BadgePlacement)
    ? (obj.placement as BadgePlacement)
    : 'right'

  return {
    v: 1,
    customUrls,
    badgeScale,
    placement,
  }
}

export function applyStatusIconsConfigFromMetadata(metadata: Metadata | Record<string, unknown>): boolean {
  const raw = metadata?.[ROOM_STATUS_ICONS_KEY] ?? metadata?.[LEGACY_ROOM_STATUS_ICONS_KEY]
  const next = sanitizeStatusIconsConfig(raw)
  const prev = currentIconsConfig.value
  const changed =
    prev.badgeScale !== next.badgeScale ||
    prev.placement !== next.placement ||
    JSON.stringify(prev.customUrls) !== JSON.stringify(next.customUrls)

  currentIconsConfig.value = next
  return changed
}

/**
 * Carrega a configuração de ícones personalizados dos metadados da sala.
 */
export async function loadRoomIconsConfig(): Promise<RoomStatusIconsConfig> {
  if (!OBR.isAvailable) return currentIconsConfig.value
  try {
    const metadata = await OBR.room.getMetadata()
    applyStatusIconsConfigFromMetadata(metadata)
  } catch (err) {
    console.warn('[StatusIconConfig] Falha ao carregar ícones da sala:', err)
  }
  return currentIconsConfig.value
}

/**
 * Salva a configuração de ícones personalizados nos metadados da sala.
 */
export async function saveRoomIconsConfig(config: RoomStatusIconsConfig): Promise<void> {
  const sanitized = sanitizeStatusIconsConfig(config)
  currentIconsConfig.value = sanitized
  if (!OBR.isAvailable) return
  try {
    await OBR.room.setMetadata({
      [ROOM_STATUS_ICONS_KEY]: JSON.parse(JSON.stringify(sanitized)),
    })
  } catch (err) {
    console.error('[StatusIconConfig] Erro ao salvar ícones da sala:', err)
  }
}

export async function setCustomStatusUrl(statusId: string, url: string): Promise<void> {
  const normalizedId = statusId.trim().toLowerCase()
  const nextUrls = { ...currentIconsConfig.value.customUrls }
  if (url && url.trim().startsWith('http')) {
    nextUrls[normalizedId] = url.trim()
  } else {
    delete nextUrls[normalizedId]
  }
  await saveRoomIconsConfig({
    ...currentIconsConfig.value,
    v: 1,
    customUrls: nextUrls,
  })
}

export async function resetCustomStatusUrl(statusId: string): Promise<void> {
  await setCustomStatusUrl(statusId, '')
}

export async function resetAllCustomUrls(): Promise<void> {
  await saveRoomIconsConfig({
    ...currentIconsConfig.value,
    v: 1,
    customUrls: {},
  })
}

