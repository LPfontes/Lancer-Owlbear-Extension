import OBR, { buildImage, type Item } from '@owlbear-rodeo/sdk'
import {
  getStatusDefinition,
  getStatusBadgeUrl,
  normalizeStatusId,
} from './statusIcons'

export const STATUS_MARKER_METADATA_KEY = 'com.compcon.status_marker'
export const STATUS_MARKER_ID_KEY = 'com.compcon.status_id'
export const STATUS_MARKER_PARENT_KEY = 'com.compcon.parent_token'

export class StatusMarkerService {
  /**
   * Sincroniza os marcadores de status visuais anexados a um token no mapa
   */
  public async syncTokenStatusMarkers(tokenId: string, rawStatusIds: string[]): Promise<void> {
    if (!OBR.isAvailable) return

    try {
      // 1. Busca os dados do token e seus limites visuais
      const tokens = await OBR.scene.items.getItems([tokenId])
      if (!tokens.length) return

      const bounds = await OBR.scene.items.getItemBounds([tokenId])
      if (!bounds || bounds.width <= 0) return

      const dpi = (await OBR.scene.grid.getDpi().catch(() => 150)) || 150

      // 2. Filtra e normaliza a lista de status desejada
      const normalizedStatusIds = Array.from(
        new Set(
          rawStatusIds
            .map(id => normalizeStatusId(id))
            .filter((id): id is string => id !== null)
        )
      )

      // 3. Obtém anexos existentes vinculados ao token
      const attachments = await OBR.scene.items.getItemAttachments([tokenId])
      const existingMarkers = attachments.filter(
        item =>
          item.id.startsWith('cc_st_') ||
          (item.metadata &&
            (item.metadata[STATUS_MARKER_METADATA_KEY] === true ||
             item.metadata[STATUS_MARKER_ID_KEY] !== undefined))
      )

      // 4. Remove marcadores que não estão mais ativos ou que possuem URL legada (data: URL ou não HTTP)
      const markersToRemove = existingMarkers.filter(item => {
        const markerStatusId = item.metadata?.[STATUS_MARKER_ID_KEY] as string
        const img = (item as any).image
        const urlStr = img?.url ? String(img.url) : ''
        const isLegacyOrDataUrl = !urlStr.startsWith('http') || urlStr.startsWith('data:')
        return !markerStatusId || !normalizedStatusIds.includes(markerStatusId) || isLegacyOrDataUrl
      })

      if (markersToRemove.length > 0) {
        await OBR.scene.items.deleteItems(markersToRemove.map(m => m.id))
      }

      if (normalizedStatusIds.length === 0) return

      // 5. Calcula layout dos badges no topo do token
      // O tamanho do badge é proporcional à largura do token (entre 26 e 44 unidades de cena)
      const targetSize = Math.max(26, Math.min(44, bounds.width * 0.28))
      const spacing = 4
      const count = normalizedStatusIds.length

      // Calcula posições das fileiras (máx 4 badges por fileira para não vazar)
      const maxPerRow = 4

      const itemsToAdd: Item[] = []
      const itemsToUpdatePositions: { id: string; position: { x: number; y: number } }[] = []

      // Escala para a imagem SVG de 100x100 px
      const scaleFactor = targetSize / 100

      for (let i = 0; i < count; i++) {
        const statusId = normalizedStatusIds[i]
        const def = getStatusDefinition(statusId)
        if (!def) continue

        const rowIndex = Math.floor(i / maxPerRow)
        const colIndex = i % maxPerRow
        const itemsInThisRow = Math.min(count - rowIndex * maxPerRow, maxPerRow)

        const rowWidth = itemsInThisRow * targetSize + (itemsInThisRow - 1) * spacing
        const startX = bounds.center.x - rowWidth / 2 + targetSize / 2
        const posX = startX + colIndex * (targetSize + spacing)

        // Posicionado no topo do token, subindo em novas fileiras se houver muitos status
        const posY = bounds.min.y + targetSize / 2 - rowIndex * (targetSize + spacing) + 2

        const existing = existingMarkers.find(
          m =>
            m.metadata[STATUS_MARKER_ID_KEY] === statusId &&
            !markersToRemove.some(rem => rem.id === m.id)
        )

        if (existing) {
          // Atualiza posição se mudou
          if (
            Math.abs(existing.position.x - posX) > 1 ||
            Math.abs(existing.position.y - posY) > 1
          ) {
            itemsToUpdatePositions.push({ id: existing.id, position: { x: posX, y: posY } })
          }
        } else {
          // Cria novo marcador anexo com URL HTTP estática válida
          const badgeUrl = getStatusBadgeUrl(statusId)
          const newMarker = buildImage(
            {
              width: 100,
              height: 100,
              mime: 'image/svg+xml',
              url: badgeUrl,
            },
            {
              offset: { x: 50, y: 50 },
              dpi: dpi,
            }
          )
            .id(`cc_st_${tokenId.substring(0, 6)}_${statusId}_${Date.now()}`)
            .name(`[Estado] ${def.label}`)
            .position({ x: posX, y: posY })
            .scale({ x: scaleFactor, y: scaleFactor })
            .layer('ATTACHMENT')
            .attachedTo(tokenId)
            .locked(true)
            .disableHit(true)
            .disableAttachmentBehavior(['ROTATION']) // Mantém o ícone ereto mesmo se o token girar
            .metadata({
              [STATUS_MARKER_METADATA_KEY]: true,
              [STATUS_MARKER_ID_KEY]: statusId,
              [STATUS_MARKER_PARENT_KEY]: tokenId,
            })
            .build()

          itemsToAdd.push(newMarker)
        }
      }

      // Executa adições e atualizações no Owlbear Rodeo
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

  /**
   * Limpa quaisquer marcadores legados antigos com formato de URL inválido na cena
   */
  public async cleanupLegacyMarkers(): Promise<void> {
    if (!OBR.isAvailable) return
    try {
      const isReady = await OBR.scene.isReady().catch(() => false)
      if (!isReady) return

      const items = await OBR.scene.items.getItems((item) => {
        const img = (item as any).image
        if (!img || !img.url) return false
        const urlStr = String(img.url)

        // 1. Qualquer URL do tipo data: (data:image/svg...) causa "Invalid URL" no loader do Owlbear Rodeo!
        if (urlStr.startsWith('data:')) return true

        // 2. Qualquer URL de imagem contendo ";utf8"
        if (urlStr.includes(';utf8')) return true

        // 3. Detecta marcadores de status do COMP/CON com formato legado ou sem URL HTTP válida
        const isMarker =
          item.id.startsWith('cc_st_') ||
          (item.metadata &&
            (item.metadata[STATUS_MARKER_METADATA_KEY] === true ||
             item.metadata[STATUS_MARKER_ID_KEY] !== undefined))

        if (isMarker && !urlStr.startsWith('http')) {
          return true
        }

        // 4. Testa se new URL() aceita a URL
        try {
          new URL(urlStr)
        } catch {
          return true
        }

        return false
      })

      if (items.length > 0) {
        console.log(`[StatusMarkerService] Removendo ${items.length} itens/marcadores com URL inválida da cena`)
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
    try {
      const attachments = await OBR.scene.items.getItemAttachments([tokenId])
      const markers = attachments.filter(
        item => item.metadata && item.metadata[STATUS_MARKER_METADATA_KEY] === true
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
