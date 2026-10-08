import OBR, { buildImage, buildText, type Item } from '@owlbear-rodeo/sdk'
import {
  getStatusDefinition,
  getStatusBadgeUrl,
  getCustomStatusBadgeUrl,
  customStatusMarkerId,
  normalizeStatusId,
  parseCustomStatusMarkerId,
} from './statusIcons'
import { isSheetReadOnlySession } from './sheetReadOnlySession'

export const STATUS_MARKER_METADATA_KEY = 'com.compcon.status_marker'
export const STATUS_MARKER_ID_KEY = 'com.compcon.status_id'
export const STATUS_MARKER_PARENT_KEY = 'com.compcon.parent_token'
export const STATUS_MARKER_LABEL_KEY = 'com.compcon.status_label'

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
      // 1. Busca os dados do token e seus limites visuais
      const tokens = await OBR.scene.items.getItems([tokenId])
      if (!tokens.length) return

      const bounds = await OBR.scene.items.getItemBounds([tokenId])
      if (!bounds || bounds.width <= 0) return

      const dpi = (await OBR.scene.grid.getDpi().catch(() => 150)) || 150

      // 2. Filtra e normaliza a lista de status desejada.
      // Os status PERSONALIZADOS (prefixo `custom:`) passam intactos: o nome é
      // livre e não existe em STATUS_DEFINITIONS.
      const normalizedStatusIds = Array.from(
        new Set(
          rawStatusIds
            .map(id => (parseCustomStatusMarkerId(id) ? id.trim() : normalizeStatusId(id)))
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

      // 4. Remove marcadores que não estão mais ativos, que possuem URL legada
      // (data: URL ou não HTTP) ou que estão DUPLICADOS. O sync já é serializado
      // por token, mas marcadores duplicados podem ter sobrado de corridas
      // anteriores: dois itens com o mesmo `status_id` ficam empilhados na mesma
      // posição e um badge cobre o outro.
      const seenStatusIds = new Set<string>()
      const markersToRemove = existingMarkers.filter(item => {
        const markerStatusId = item.metadata?.[STATUS_MARKER_ID_KEY] as string
        const img = (item as any).image
        const urlStr = img?.url ? String(img.url) : ''
        const isLegacyOrDataUrl = !urlStr.startsWith('http') || urlStr.startsWith('data:')
        if (!markerStatusId || !normalizedStatusIds.includes(markerStatusId) || isLegacyOrDataUrl) {
          return true
        }
        if (seenStatusIds.has(markerStatusId)) return true
        seenStatusIds.add(markerStatusId)
        return false
      })

      if (markersToRemove.length > 0) {
        const removedIds = new Set(markersToRemove.map(m => m.id))
        console.log(`[StatusMarkerService] Removendo ${markersToRemove.length} marcador(es) obsoleto(s)/duplicado(s)`)
        await OBR.scene.items.deleteItems([...removedIds])
        // A lista de anexos veio antes das remoções: descarta o que já foi apagado
        // para o passo 6 não reaproveitar um item que não existe mais.
        for (let i = existingMarkers.length - 1; i >= 0; i--) {
          if (removedIds.has(existingMarkers[i].id)) existingMarkers.splice(i, 1)
        }
      }

      if (normalizedStatusIds.length === 0) return

      // 5. Calcula layout dos badges na lateral direita do token
      // O tamanho do badge é proporcional à largura do token (entre 26 e 44 unidades de cena)
      const targetSize = Math.max(26, Math.min(44, bounds.width * 0.28))
      const spacing = 10
      const count = normalizedStatusIds.length

      // Máximo de badges por coluna antes de quebrar para a próxima coluna à direita
      const maxPerColumn = 6

      const itemsToAdd: Item[] = []
      const itemsToUpdatePositions: { id: string; position: { x: number; y: number } }[] = []

      // Escala para a imagem SVG de 100x100 px
      const scaleFactor = targetSize / 100

      for (let i = 0; i < count; i++) {
        const statusId = normalizedStatusIds[i]

        // Empilha até 6 status por coluna; a partir do 7º abre uma nova coluna à direita
        const columnIndex = Math.floor(i / maxPerColumn)
        const rowIndex = i % maxPerColumn

        const posX = bounds.max.x - 40 + targetSize / 2 + columnIndex * (targetSize + spacing)

        // O primeiro badge fica colado na borda superior do token e os demais descem
        const posY = bounds.min.y + targetSize / 2 + rowIndex * (targetSize + spacing)

        // Status personalizado (nome livre): badge próprio + rótulo de texto ao lado
        const customName = parseCustomStatusMarkerId(statusId)
        if (customName) {
          itemsToAdd.push(
            ...this.ensureCustomStatusMarker({
              tokenId,
              name: customName,
              posX,
              posY,
              targetSize,
              scaleFactor,
              dpi,
              existingMarkers,
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
   * Garante os itens visuais de um Status PERSONALIZADO no token.
   *
   * Diferente dos status de catálogo, o nome é livre — então o identificador do
   * marcador é `custom:<nome>` e o rótulo é um item de TEXTO próprio ao lado do
   * badge, porque a URL do SVG é fixa e não dá para parametrizar o nome numa
   * imagem (o loader do Owlbear não renderiza `data:` URL nem texto externo).
   *
   * Cria o badge (estrela em círculo) e o rótulo na primeira vez, e só reposiciona
   * nas vezes seguintes. Quando cria, registra os itens recém-criados em
   * `existingMarkers` para que outro status personalizado da mesma passada não
   * crie um par duplicado.
   */
  private ensureCustomStatusMarker(ctx: {
    tokenId: string
    name: string
    posX: number
    posY: number
    targetSize: number
    scaleFactor: number
    dpi: number
    existingMarkers: Item[]
  }): Item[] {
    const { tokenId, name, posX, posY, targetSize, scaleFactor, dpi, existingMarkers } = ctx

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

    // O rótulo é uma caixa de largura fixa centrada no item: para o texto começar
    // logo à direita do badge, o centro fica em badge + margem + metade da caixa.
    const labelWidth = 120
    const gap = 6
    const labelX = posX + targetSize / 2

    const existingBadge = existingMarkers.find(
      m => m.metadata[STATUS_MARKER_ID_KEY] === markerId && !m.metadata[STATUS_MARKER_LABEL_KEY]
    )
    const existingLabel = existingMarkers.find(
      m => m.metadata[STATUS_MARKER_ID_KEY] === markerId && m.metadata[STATUS_MARKER_LABEL_KEY]
    )

    if (existingBadge && existingLabel) {
      // Ambos já existem: nada a criar. O reposicionamento é responsabilidade do
      // sync (o rótulo acompanha o badge), então não devolvemos item aqui.
      return []
    }

    const created: Item[] = []

    if (!existingBadge) {
      const badge = buildImage(
        { width: 100, height: 100, mime: 'image/svg+xml', url: getCustomStatusBadgeUrl() },
        { offset: { x: 50, y: 50 }, dpi }
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
        .position({ x: labelX, y: posY - 10})
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
    // Ficha em modo leitura: não mexe nos marcadores do token.
    if (isSheetReadOnlySession()) return
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
