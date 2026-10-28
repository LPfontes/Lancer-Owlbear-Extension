import OBR, { buildImage, buildText, type Item } from '@owlbear-rodeo/sdk'
import {
  getStatusDefinition,
  getStatusBadgeUrl,
  getCustomStatusBadgeUrl,
  customStatusMarkerId,
  normalizeStatusId,
  parseCustomStatusMarkerId,
  parseBurnMarkerId,
  sortStatusMarkers,
} from './statusIcons'
import { currentIconsConfig, isStatusCentered } from './statusIconConfig'
import { isSheetReadOnlySession } from './sheetReadOnlySession'

export const STATUS_MARKER_METADATA_KEY = 'com.compcon.status_marker'
export const STATUS_MARKER_ID_KEY = 'com.compcon.status_id'
export const STATUS_MARKER_PARENT_KEY = 'com.compcon.parent_token'
export const STATUS_MARKER_LABEL_KEY = 'com.compcon.status_label'

export const LEGACY_STATUS_MARKER_METADATA_KEY = 'com.lancer.status_markers/is_marker'
export const LEGACY_STATUS_MARKER_ID_KEY = 'com.lancer.status_markers/status_id'

export interface ImageDimensions {
  width: number
  height: number
  mime: string
}

const imageDimensionsCache = new Map<string, ImageDimensions>()

export function inferImageMime(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  if (clean.endsWith('.png')) return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg'
  if (clean.endsWith('.gif')) return 'image/gif'
  return 'image/svg+xml'
}

export async function resolveImageDimensions(url: string): Promise<ImageDimensions> {
  const cached = imageDimensionsCache.get(url)
  if (cached) return cached

  const mime = inferImageMime(url)
  if (url.includes('/status-icons/') && mime === 'image/svg+xml') {
    const def = { width: 100, height: 100, mime }
    imageDimensionsCache.set(url, def)
    return def
  }

  if (typeof Image === 'undefined') {
    return { width: 100, height: 100, mime }
  }

  return new Promise<ImageDimensions>(resolve => {
    const img = new Image()
    let settled = false
    const finish = (dims: ImageDimensions) => {
      if (settled) return
      settled = true
      imageDimensionsCache.set(url, dims)
      resolve(dims)
    }
    const timer = setTimeout(() => {
      finish({ width: 100, height: 100, mime })
    }, 2500)

    img.onload = () => {
      clearTimeout(timer)
      const w = img.naturalWidth || img.width || 100
      const h = img.naturalHeight || img.height || 100
      finish({ width: w, height: h, mime })
    }
    img.onerror = () => {
      clearTimeout(timer)
      finish({ width: 100, height: 100, mime })
    }
    img.src = url
  })
}

export function getTokenOwnBounds(
  token: any,
  sceneDpi: number,
  fallbackBounds: { min: { x: number; y: number }; max: { x: number; y: number }; width: number; height: number }
) {
  const img = token?.image
  const grid = token?.grid
  const pos = token?.position
  const scale = token?.scale ?? { x: 1, y: 1 }

  if (
    img &&
    typeof img.width === 'number' &&
    img.width > 0 &&
    typeof img.height === 'number' &&
    img.height > 0 &&
    grid &&
    typeof grid.dpi === 'number' &&
    grid.dpi > 0 &&
    pos &&
    typeof pos.x === 'number' &&
    typeof pos.y === 'number'
  ) {
    const ratioX = (sceneDpi / grid.dpi) * Math.abs(scale.x ?? 1)
    const ratioY = (sceneDpi / grid.dpi) * Math.abs(scale.y ?? 1)
    const width = img.width * ratioX
    const height = img.height * ratioY
    const offsetX = typeof grid.offset?.x === 'number' ? grid.offset.x : img.width / 2
    const offsetY = typeof grid.offset?.y === 'number' ? grid.offset.y : img.height / 2
    const minX = pos.x - offsetX * ratioX
    const minY = pos.y - offsetY * ratioY
    return {
      min: { x: minX, y: minY },
      max: { x: minX + width, y: minY + height },
      width,
      height,
      center: { x: minX + width / 2, y: minY + height / 2 },
    }
  }

  return {
    ...fallbackBounds,
    center: {
      x: (fallbackBounds.min.x + fallbackBounds.max.x) / 2,
      y: (fallbackBounds.min.y + fallbackBounds.max.y) / 2,
    },
  }
}

export class StatusMarkerService {
  /**
   * Fila de sincronizações em andamento, por token.
   *
   * `syncTokenStatusMarkers` é async e lê os anexos antes de escrever: duas
   * chamadas concorrentes para o mesmo token (o evento de status + o watcher do
   * seletor disparavam juntos) não enxergavam uma à outra e cada uma criava o
   * seu próprio marcador — resultando em dois badges empilhados na mesma
   * posição, um cobrindo o outro. Serializar por token elimina a corrida.
   */
  private syncQueues = new Map<string, Promise<void>>()

  /**
   * Sincroniza os marcadores de status visuais anexados a um token no mapa
   */
  public async syncTokenStatusMarkers(tokenId: string, rawStatusIds: string[]): Promise<void> {
    // Ficha em modo leitura nesta janela: nenhuma escrita de marcador no token.
    if (isSheetReadOnlySession()) return

    const previous = this.syncQueues.get(tokenId) ?? Promise.resolve()

    const next = previous
      .catch(() => {})
      .then(() => this.applyTokenStatusMarkers(tokenId, rawStatusIds))
      .catch(err => {
        console.warn('[StatusMarkerService] Erro ao sincronizar marcadores de status no token:', err)
      })
      .finally(() => {
        if (this.syncQueues.get(tokenId) === next) this.syncQueues.delete(tokenId)
      })

    this.syncQueues.set(tokenId, next)
    return next
  }

  /**
   * Trabalho efetivo de uma sincronização (ver `syncTokenStatusMarkers`)
   */
  private async applyTokenStatusMarkers(tokenId: string, rawStatusIds: string[]): Promise<void> {
    if (!OBR.isAvailable) return

    try {
      // 1. Busca os dados do token e seus limites visuais próprios (sem anexos)
      const tokens = await OBR.scene.items.getItems([tokenId])
      if (!tokens.length) return

      const rawBounds = await OBR.scene.items.getItemBounds([tokenId])
      if (!rawBounds || rawBounds.width <= 0) return

      const dpi = (await OBR.scene.grid.getDpi().catch(() => 150)) || 150
      const bounds = getTokenOwnBounds(tokens[0], dpi, rawBounds)

      // 2. Filtra e normaliza a lista de status desejada.
      // - Os status PERSONALIZADOS (prefixo `custom:`) passam intactos.
      // - Os status de QUEIMADURA com quantidade (prefixo `burn:`) passam intactos.
      // - Os demais são normalizados pelo catálogo.
      const normalizedStatusIds = sortStatusMarkers(
        Array.from(
          new Set(
            rawStatusIds
              .map(id => {
                if (parseCustomStatusMarkerId(id)) return id.trim()
                if (parseBurnMarkerId(id)) return id.trim()
                return normalizeStatusId(id)
              })
              .filter((id): id is string => id !== null)
          )
        )
      )

      // Pré-carrega dimensões reais das imagens para calcular o offset central e a escala exata
      const dimsByStatusId = new Map<string, ImageDimensions>()
      await Promise.all(
        normalizedStatusIds.map(async statusId => {
          const url = parseCustomStatusMarkerId(statusId)
            ? getCustomStatusBadgeUrl()
            : parseBurnMarkerId(statusId)
              ? getStatusBadgeUrl('burn')
              : getStatusBadgeUrl(statusId)
          if (url) {
            const dims = await resolveImageDimensions(url)
            dimsByStatusId.set(statusId, dims)
          }
        })
      )

      // 3. Obtém anexos existentes vinculados ao token (incluindo legados do lancer-token-status)
      const attachments = await OBR.scene.items.getItemAttachments([tokenId])
      const existingMarkers = attachments.filter(
        item =>
          item.id.startsWith('cc_st_') ||
          item.id.startsWith('ls_st_') ||
          (item.metadata &&
            (item.metadata[STATUS_MARKER_METADATA_KEY] === true ||
              item.metadata[STATUS_MARKER_ID_KEY] !== undefined ||
              item.metadata[LEGACY_STATUS_MARKER_METADATA_KEY] === true ||
              item.metadata[LEGACY_STATUS_MARKER_ID_KEY] !== undefined))
      )

      const scaleMult = currentIconsConfig.value.badgeScale ?? 0.28
      const targetSize = Math.max(20, Math.min(64, bounds.width * scaleMult))

      const overlayMult = currentIconsConfig.value.overlayScale ?? 1.15
      const overlayTargetSize = Math.max(bounds.width, bounds.height) * overlayMult

      // 4. Remove marcadores que não estão mais ativos, que possuem URL legada/diferente da config,
      // dimensão/offset/escala diferente ou que estão DUPLICADOS.
      const seenStatusIds = new Set<string>()
      const markersToRemove = existingMarkers.filter(item => {
        const markerStatusId =
          (item.metadata?.[STATUS_MARKER_ID_KEY] as string) ||
          (item.metadata?.[LEGACY_STATUS_MARKER_ID_KEY] as string)
        const isLegacyItem =
          item.id.startsWith('ls_st_') ||
          item.metadata?.[LEGACY_STATUS_MARKER_METADATA_KEY] === true
        const isLabel = item.metadata?.[STATUS_MARKER_LABEL_KEY] === true
        const isText = (item as any).type === 'TEXT' || isLabel
        const img = (item as any).image
        const urlStr = img?.url ? String(img.url) : ''
        const isLegacyOrDataUrl = !isText && (!urlStr.startsWith('http') || urlStr.startsWith('data:'))

        if (
          isLegacyItem ||
          !markerStatusId ||
          !normalizedStatusIds.includes(markerStatusId) ||
          isLegacyOrDataUrl
        ) {
          return true
        }

        if (!isText) {
          const expectedUrl = parseCustomStatusMarkerId(markerStatusId)
            ? getCustomStatusBadgeUrl()
            : parseBurnMarkerId(markerStatusId)
              ? getStatusBadgeUrl('burn')
              : getStatusBadgeUrl(markerStatusId)
          if (expectedUrl && urlStr && urlStr !== expectedUrl) {
            return true
          }

          const dims = dimsByStatusId.get(markerStatusId) ?? {
            width: 100,
            height: 100,
            mime: 'image/svg+xml',
          }
          const currentImgW = img?.width
          const currentImgH = img?.height
          const currentOffsetX = (item as any).grid?.offset?.x
          const currentOffsetY = (item as any).grid?.offset?.y
          if (
            currentImgW !== dims.width ||
            currentImgH !== dims.height ||
            Math.abs((currentOffsetX ?? 0) - dims.width / 2) > 0.5 ||
            Math.abs((currentOffsetY ?? 0) - dims.height / 2) > 0.5
          ) {
            return true
          }

          const centeredKey = parseCustomStatusMarkerId(markerStatusId)
            ? 'customstatus'
            : parseBurnMarkerId(markerStatusId)
              ? 'burn'
              : markerStatusId
          const desiredWorldSize = isStatusCentered(centeredKey) ? overlayTargetSize : targetSize
          const expectedScale = desiredWorldSize / Math.max(dims.width, dims.height)
          const itemScaleX = (item as any).scale?.x
          if (typeof itemScaleX === 'number' && Math.abs(itemScaleX - expectedScale) > 0.015) {
            return true
          }
        }

        const seenKey = isLabel ? `${markerStatusId}_label` : markerStatusId
        if (seenStatusIds.has(seenKey)) return true
        seenStatusIds.add(seenKey)
        return false
      })

      if (markersToRemove.length > 0) {
        const removedIds = new Set(markersToRemove.map(m => m.id))
        await OBR.scene.items.deleteItems([...removedIds])
        for (let i = existingMarkers.length - 1; i >= 0; i--) {
          if (removedIds.has(existingMarkers[i].id)) existingMarkers.splice(i, 1)
        }
      }

      if (normalizedStatusIds.length === 0) return

      // 5. Calcula layout dos badges conforme a posição configurada na sala
      const spacing = 10
      const count = normalizedStatusIds.length
      const maxPerColumn = 6
      const placement = currentIconsConfig.value.placement || 'right'
      const centerX = bounds.center.x
      const centerY = bounds.center.y

      const itemsToAdd: Item[] = []
      const itemsToUpdatePositions: { id: string; position: { x: number; y: number } }[] = []

      let sideIndex = 0

      for (let i = 0; i < count; i++) {
        const statusId = normalizedStatusIds[i]
        const customName = parseCustomStatusMarkerId(statusId)
        const burnInfo = parseBurnMarkerId(statusId)
        const centeredKey = customName ? 'customstatus' : burnInfo ? 'burn' : statusId
        const centered = isStatusCentered(centeredKey)

        const dims = dimsByStatusId.get(statusId) ?? {
          width: 100,
          height: 100,
          mime: 'image/svg+xml',
        }
        const baseMaxDim = Math.max(dims.width, dims.height)

        let posX = centerX
        let posY = centerY
        let itemTargetSize = overlayTargetSize
        let itemScaleFactor = overlayTargetSize / baseMaxDim

        if (!centered) {
          itemTargetSize = targetSize
          itemScaleFactor = targetSize / baseMaxDim
          const columnIndex = Math.floor(sideIndex / maxPerColumn)
          const rowIndex = sideIndex % maxPerColumn
          sideIndex++

          if (placement === 'left') {
            posX = bounds.min.x + 12 - targetSize / 2 - columnIndex * (targetSize + spacing)
            posY = bounds.min.y + targetSize / 2 + rowIndex * (targetSize + spacing)
          } else if (placement === 'bottom') {
            posX = bounds.min.x + targetSize / 2 + rowIndex * (targetSize + spacing)
            posY = bounds.max.y - 12 + targetSize / 2 + columnIndex * (targetSize + spacing)
          } else if (placement === 'top') {
            posX = bounds.min.x + targetSize / 2 + rowIndex * (targetSize + spacing)
            posY = bounds.min.y + 12 - targetSize / 2 - columnIndex * (targetSize + spacing)
          } else {
            // 'right' (padrão)
            posX = bounds.max.x - 40 + targetSize / 2 + columnIndex * (targetSize + spacing)
            posY = bounds.min.y + targetSize / 2 + rowIndex * (targetSize + spacing)
          }
        }

        // Status personalizado (nome livre): badge próprio + rótulo de texto ao lado
        if (customName) {
          itemsToAdd.push(
            ...this.ensureCustomStatusMarker({
              tokenId,
              name: customName,
              posX,
              posY,
              targetSize: itemTargetSize,
              scaleFactor: itemScaleFactor,
              dims,
              dpi,
              existingMarkers,
              itemsToUpdatePositions,
            })
          )
          continue
        }

        // Status de Queimadura (QMD com quantidade): badge 'burn.svg' + número ao lado
        if (burnInfo) {
          itemsToAdd.push(
            ...this.ensureBurnStatusMarker({
              tokenId,
              amount: burnInfo.amount,
              statusId,
              posX,
              posY,
              targetSize: itemTargetSize,
              scaleFactor: itemScaleFactor,
              dims,
              dpi,
              existingMarkers,
              itemsToUpdatePositions,
            })
          )
          continue
        }

        const def = getStatusDefinition(statusId)
        if (!def) continue

        const existing = existingMarkers.find(
          m => m.metadata[STATUS_MARKER_ID_KEY] === statusId
        )

        if (existing) {
          if (
            Math.abs(existing.position.x - posX) > 1 ||
            Math.abs(existing.position.y - posY) > 1
          ) {
            itemsToUpdatePositions.push({ id: existing.id, position: { x: posX, y: posY } })
          }
        } else {
          const badgeUrl = getStatusBadgeUrl(statusId)
          const newMarker = buildImage(
            {
              width: dims.width,
              height: dims.height,
              mime: dims.mime,
              url: badgeUrl,
            },
            {
              offset: { x: dims.width / 2, y: dims.height / 2 },
              dpi: dpi,
            }
          )
            .id(`cc_st_${tokenId.substring(0, 6)}_${statusId}_${Date.now()}`)
            .name(`[Estado] ${def.label}`)
            .position({ x: posX, y: posY })
            .scale({ x: itemScaleFactor, y: itemScaleFactor })
            .layer('ATTACHMENT')
            .attachedTo(tokenId)
            .locked(true)
            .disableHit(true)
            .disableAttachmentBehavior(['ROTATION'])
            .metadata({
              [STATUS_MARKER_METADATA_KEY]: true,
              [STATUS_MARKER_ID_KEY]: statusId,
              [STATUS_MARKER_PARENT_KEY]: tokenId,
            })
            .build()

          itemsToAdd.push(newMarker)
        }
      }

      if (itemsToAdd.length > 0) {
        await OBR.scene.items.addItems(itemsToAdd)
      }

      if (itemsToUpdatePositions.length > 0) {
        const ids = itemsToUpdatePositions.map(u => u.id)
        const posMap = new Map(itemsToUpdatePositions.map(u => [u.id, u.position]))
        await OBR.scene.items.updateItems(ids, draftItems => {
          for (const item of draftItems) {
            const pos = posMap.get(item.id)
            if (pos) {
              item.position = pos
            }
          }
        })
      }
    } catch (err) {
      console.warn('[StatusMarkerService] Erro ao sincronizar marcadores de status no token:', err)
    }
  }

  private ensureCustomStatusMarker(ctx: {
    tokenId: string
    name: string
    posX: number
    posY: number
    targetSize: number
    scaleFactor: number
    dims: ImageDimensions
    dpi: number
    existingMarkers: Item[]
    itemsToUpdatePositions: { id: string; position: { x: number; y: number } }[]
  }): Item[] {
    const {
      tokenId,
      name,
      posX,
      posY,
      targetSize,
      scaleFactor,
      dims,
      dpi,
      existingMarkers,
      itemsToUpdatePositions,
    } = ctx

    const markerId = customStatusMarkerId(name)
    const suffix = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40)
    const badgeItemId = `cc_st_${tokenId.substring(0, 6)}_${suffix || 'custom'}`
    const labelItemId = `${badgeItemId}_label`
    const fontSize = Math.max(12, Math.min(18, Math.round(targetSize * 0.45)))

    const badgeMeta = {
      [STATUS_MARKER_METADATA_KEY]: true,
      [STATUS_MARKER_ID_KEY]: markerId,
      [STATUS_MARKER_PARENT_KEY]: tokenId,
    }
    const labelMeta = {
      [STATUS_MARKER_METADATA_KEY]: true,
      [STATUS_MARKER_ID_KEY]: markerId,
      [STATUS_MARKER_PARENT_KEY]: tokenId,
      [STATUS_MARKER_LABEL_KEY]: true,
    }

    const labelWidth = 120
    const labelX = posX + targetSize / 2

    const existingBadge = existingMarkers.find(
      m => m.metadata?.[STATUS_MARKER_ID_KEY] === markerId && !m.metadata?.[STATUS_MARKER_LABEL_KEY]
    )
    const existingLabel = existingMarkers.find(
      m => m.metadata?.[STATUS_MARKER_ID_KEY] === markerId && m.metadata?.[STATUS_MARKER_LABEL_KEY]
    )

    if (existingBadge) {
      if (
        Math.abs(existingBadge.position.x - posX) > 1 ||
        Math.abs(existingBadge.position.y - posY) > 1
      ) {
        itemsToUpdatePositions.push({ id: existingBadge.id, position: { x: posX, y: posY } })
      }
    }
    if (existingLabel) {
      if (
        Math.abs(existingLabel.position.x - labelX) > 1 ||
        Math.abs(existingLabel.position.y - (posY - 10)) > 1
      ) {
        itemsToUpdatePositions.push({ id: existingLabel.id, position: { x: labelX, y: posY - 10 } })
      }
    }

    if (existingBadge && existingLabel) {
      return []
    }

    const created: Item[] = []

    if (!existingBadge) {
      const badge = buildImage(
        {
          width: dims.width,
          height: dims.height,
          mime: dims.mime,
          url: getCustomStatusBadgeUrl(),
        },
        { offset: { x: dims.width / 2, y: dims.height / 2 }, dpi }
      )
        .id(badgeItemId)
        .name(`[Estado] ${name}`)
        .position({ x: posX, y: posY })
        .scale({ x: scaleFactor, y: scaleFactor })
        .layer('ATTACHMENT')
        .attachedTo(tokenId)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(['ROTATION'])
        .metadata(badgeMeta)
        .build()

      created.push(badge)
      existingMarkers.push(badge)
    }

    if (!existingLabel) {
      const label = buildText()
        .id(labelItemId)
        .name(`[Estado] ${name}`)
        .plainText(name)
        .width(labelWidth)
        .height('AUTO')
        .textType('PLAIN')
        .fontSize(fontSize)
        .fontWeight(600)
        .textAlign('LEFT')
        .textAlignVertical('TOP')
        .fillColor('#FFFFFF')
        .fillOpacity(1)
        .strokeColor('#000000')
        .strokeOpacity(0.85)
        .strokeWidth(2)
        .lineHeight(1)
        .padding(0)
        .position({ x: labelX, y: posY - 10 })
        .layer('ATTACHMENT')
        .attachedTo(tokenId)
        .locked(true)
        .disableHit(true)
        .metadata(labelMeta)
        .build()

      created.push(label)
      existingMarkers.push(label)
    }

    return created
  }

  private ensureBurnStatusMarker(ctx: {
    tokenId: string
    amount: number
    statusId: string
    posX: number
    posY: number
    targetSize: number
    scaleFactor: number
    dims: ImageDimensions
    dpi: number
    existingMarkers: Item[]
    itemsToUpdatePositions: { id: string; position: { x: number; y: number } }[]
  }): Item[] {
    const {
      tokenId,
      amount,
      statusId,
      posX,
      posY,
      targetSize,
      scaleFactor,
      dims,
      dpi,
      existingMarkers,
      itemsToUpdatePositions,
    } = ctx

    const badgeItemId = `cc_st_${tokenId.substring(0, 6)}_burn_${amount}`
    const labelItemId = `${badgeItemId}_label`
    const fontSize = Math.max(13, Math.min(22, Math.round(targetSize * 0.55)))

    const badgeMeta = {
      [STATUS_MARKER_METADATA_KEY]: true,
      [STATUS_MARKER_ID_KEY]: statusId,
      [STATUS_MARKER_PARENT_KEY]: tokenId,
    }
    const labelMeta = {
      [STATUS_MARKER_METADATA_KEY]: true,
      [STATUS_MARKER_ID_KEY]: statusId,
      [STATUS_MARKER_PARENT_KEY]: tokenId,
      [STATUS_MARKER_LABEL_KEY]: true,
    }

    const labelX = posX + targetSize / 2 + 3
    const labelY = posY - Math.round(fontSize * 0.55)

    const existingBadge = existingMarkers.find(
      m => m.metadata?.[STATUS_MARKER_ID_KEY] === statusId && !m.metadata?.[STATUS_MARKER_LABEL_KEY]
    )
    const existingLabel = existingMarkers.find(
      m => m.metadata?.[STATUS_MARKER_ID_KEY] === statusId && m.metadata?.[STATUS_MARKER_LABEL_KEY]
    )

    if (existingBadge) {
      if (
        Math.abs(existingBadge.position.x - posX) > 1 ||
        Math.abs(existingBadge.position.y - posY) > 1
      ) {
        itemsToUpdatePositions.push({ id: existingBadge.id, position: { x: posX, y: posY } })
      }
    }

    if (existingLabel) {
      if (
        Math.abs(existingLabel.position.x - labelX) > 1 ||
        Math.abs(existingLabel.position.y - labelY) > 1
      ) {
        itemsToUpdatePositions.push({ id: existingLabel.id, position: { x: labelX, y: labelY } })
      }
    }

    if (existingBadge && existingLabel) {
      return []
    }

    const created: Item[] = []

    if (!existingBadge) {
      const badgeUrl = getStatusBadgeUrl('burn')
      const badge = buildImage(
        {
          width: dims.width,
          height: dims.height,
          mime: dims.mime,
          url: badgeUrl,
        },
        { offset: { x: dims.width / 2, y: dims.height / 2 }, dpi }
      )
        .id(badgeItemId)
        .name(`[Estado] Queimadura (${amount})`)
        .position({ x: posX, y: posY })
        .scale({ x: scaleFactor, y: scaleFactor })
        .layer('ATTACHMENT')
        .attachedTo(tokenId)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(['ROTATION'])
        .metadata(badgeMeta)
        .build()

      created.push(badge)
      existingMarkers.push(badge)
    }

    if (!existingLabel) {
      const label = buildText()
        .id(labelItemId)
        .name(`[Estado] Queimadura (${amount})`)
        .plainText(String(amount))
        .width(40)
        .height('AUTO')
        .textType('PLAIN')
        .fontSize(fontSize)
        .fontWeight(800)
        .textAlign('LEFT')
        .textAlignVertical('TOP')
        .fillColor('#FFB74D')
        .fillOpacity(1)
        .strokeColor('#000000')
        .strokeOpacity(0.9)
        .strokeWidth(2.5)
        .lineHeight(1)
        .padding(0)
        .position({ x: labelX, y: labelY })
        .layer('ATTACHMENT')
        .attachedTo(tokenId)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(['ROTATION'])
        .metadata(labelMeta)
        .build()

      created.push(label)
      existingMarkers.push(label)
    }

    return created
  }

  /**
   * Limpa quaisquer marcadores legados antigos com formato de URL inválido na cena
   */
  public async cleanupLegacyMarkers(): Promise<void> {
    if (!OBR.isAvailable) return
    try {
      const isReady = await OBR.scene.isReady().catch(() => false)
      if (!isReady) return

      const items = await OBR.scene.items.getItems(item => {
        const img = (item as any).image
        if (!img || !img.url) return false
        const urlStr = String(img.url)

        if (urlStr.startsWith('data:')) return true
        if (urlStr.includes(';utf8')) return true

        const isMarker =
          item.id.startsWith('cc_st_') ||
          item.id.startsWith('ls_st_') ||
          (item.metadata &&
            (item.metadata[STATUS_MARKER_METADATA_KEY] === true ||
              item.metadata[STATUS_MARKER_ID_KEY] !== undefined ||
              item.metadata[LEGACY_STATUS_MARKER_METADATA_KEY] === true ||
              item.metadata[LEGACY_STATUS_MARKER_ID_KEY] !== undefined))

        if (isMarker && !urlStr.startsWith('http')) {
          return true
        }

        try {
          new URL(urlStr)
        } catch {
          return true
        }

        return false
      })

      if (items.length > 0) {
        await OBR.scene.items.deleteItems(items.map(i => i.id))
      }
    } catch (err) {
      console.warn('[StatusMarkerService] Erro ao limpar marcadores legados:', err)
    }
  }

  /**
   * Remove todos os marcadores de status vinculados a um token
   */
  public async clearTokenStatusMarkers(tokenId: string): Promise<void> {
    if (!OBR.isAvailable) return
    if (isSheetReadOnlySession()) return
    try {
      const attachments = await OBR.scene.items.getItemAttachments([tokenId])
      const markers = attachments.filter(
        item =>
          item.id.startsWith('cc_st_') ||
          item.id.startsWith('ls_st_') ||
          (item.metadata &&
            (item.metadata[STATUS_MARKER_METADATA_KEY] === true ||
              item.metadata[LEGACY_STATUS_MARKER_METADATA_KEY] === true))
      )
      if (markers.length > 0) {
        await OBR.scene.items.deleteItems(markers.map(m => m.id))
      }
    } catch (err) {
      console.warn('[StatusMarkerService] Erro ao limpar marcadores de status do token:', err)
    }
  }
}

export const statusMarkerService = new StatusMarkerService()
