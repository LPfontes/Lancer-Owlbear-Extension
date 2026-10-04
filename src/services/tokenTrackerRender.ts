import { buildCurve, buildImage, buildShape, buildText, type Item } from '@owlbear-rodeo/sdk'
import type { DrawCommand } from '@/services/tokenTrackerLayout'
import { roundedBarPoints } from '@/services/tokenTrackerLayout'
import { getTrackerIconUrl } from '@/services/tokenTrackerIcons'
import {
  TOKEN_TRACKER_ITEM_METADATA_KEY,
  TOKEN_TRACKER_ITEM_SLOT_KEY,
} from '@/types/token-tracker'

/**
 * Converte os comandos de desenho em itens do Owlbear (plano §6.2).
 *
 * Todos os itens são LOCAIS por decisão de projeto: cada janela desenha com o que
 * sabe, e nada do painel é compartilhado com a mesa.
 *
 * Ids são determinísticos (`cc_tt_<tokenId>_<key>`) para o serviço poder atualizar
 * um item em vez de apagar e recriar a cada mudança de valor.
 */

const FONT = 'Roboto, sans-serif'
const PREFIX = 'cc_tt_'

/** Behaviors desligados: o painel não gira, não escala junto e não some sozinho. */
const DISABLED_ATTACHMENT_BEHAVIORS = ['ROTATION', 'SCALE', 'VISIBLE', 'COPY'] as const

const TEXT_STROKE_COLOR = '#000000'
const TEXT_STROKE_OPACITY = 0.7
const TEXT_STROKE_WIDTH = 2

/** Id determinístico de um item do painel. */
export function tokenTrackerItemId(tokenId: string, key: string): string {
  return `${PREFIX}${tokenId}_${key}`
}

/** O item pertence ao painel de trackers? (metadata e id, para pegar sobras antigas) */
export function isTokenTrackerItem(item: Item): boolean {
  if (item.metadata && item.metadata[TOKEN_TRACKER_ITEM_METADATA_KEY] === true) return true
  return item.id.startsWith(PREFIX)
}

export interface BuildTokenTrackerItemsOptions {
  /** Visibilidade do token — o painel acompanha. */
  visible: boolean
  /** DPI da cena (`OBR.scene.grid.getDpi`), usado para dimensionar os ícones. */
  sceneDpi?: number
}

/** Lado do SVG dos ícones (todos são 100x100). */
const ICON_VIEWBOX = 100
const DEFAULT_SCENE_DPI = 150

/**
 * Materializa os comandos em itens anexados ao token. Itens vêm na ordem de
 * desenho (fundo → preenchimento → texto), que é a ordem de inserção na camada.
 */
export function buildTokenTrackerItems(
  tokenId: string,
  commands: DrawCommand[],
  options: BuildTokenTrackerItemsOptions
): Item[] {
  const items: Item[] = []

  for (const command of commands) {
    const id = tokenTrackerItemId(tokenId, command.key)
    const metadata = {
      [TOKEN_TRACKER_ITEM_METADATA_KEY]: true,
      [TOKEN_TRACKER_ITEM_SLOT_KEY]: command.slot,
    }

    if (command.kind === 'rect') {
      items.push(
        buildCurve()
          .fillColor(command.fill)
          .fillOpacity(command.opacity)
          .strokeWidth(0)
          .tension(0)
          .closed(true)
          .points(roundedBarPoints(command.width, command.height, command.radius, command.fillPortion))
          .position({ x: command.x, y: command.y })
          .attachedTo(tokenId)
          .layer('ATTACHMENT')
          .locked(true)
          .id(id)
          .metadata(metadata)
          .visible(options.visible)
          .disableAttachmentBehavior([...DISABLED_ATTACHMENT_BEHAVIORS])
          .disableHit(true)
          .build()
      )
      continue
    }

    if (command.kind === 'icon') {
      // Ícone do canto (Movimento): a fonte MDI não existe no canvas, então vai como
      // IMAGEM apontando para um SVG estático — mesmo caminho dos marcadores de
      // status. `offset` no centro + `scale` dão o tamanho em unidades de cena.
      items.push(
        buildImage(
          {
            width: ICON_VIEWBOX,
            height: ICON_VIEWBOX,
            mime: 'image/svg+xml',
            url: getTrackerIconUrl(command.icon),
          },
          { offset: { x: ICON_VIEWBOX / 2, y: ICON_VIEWBOX / 2 }, dpi: options.sceneDpi ?? DEFAULT_SCENE_DPI }
        )
          .scale({ x: command.size / ICON_VIEWBOX, y: command.size / ICON_VIEWBOX })
          .position({ x: command.cx, y: command.cy })
          .attachedTo(tokenId)
          .layer('ATTACHMENT')
          .locked(true)
          .id(id)
          .metadata(metadata)
          .visible(options.visible)
          .disableAttachmentBehavior([...DISABLED_ATTACHMENT_BEHAVIORS])
          .disableHit(true)
          .build()
      )
      continue
    }

    if (command.kind === 'circle' || command.kind === 'square') {
      const size = command.kind === 'circle' ? command.diameter : command.size
      items.push(
        buildShape()
          .shapeType(command.kind === 'circle' ? 'CIRCLE' : 'RECTANGLE')
          .width(size)
          .height(size)
          .fillColor(command.fill)
          .fillOpacity(command.opacity)
          .strokeWidth(0)
          // Shapes do OBR são desenhadas centradas na posição.
          .position({ x: command.cx, y: command.cy })
          .attachedTo(tokenId)
          .layer('ATTACHMENT')
          .locked(true)
          .id(id)
          .metadata(metadata)
          .visible(options.visible)
          .disableAttachmentBehavior([...DISABLED_ATTACHMENT_BEHAVIORS])
          .disableHit(true)
          .build()
      )
      continue
    }

    items.push(
      buildText()
        .plainText(command.text)
        .textType('PLAIN')
        .fontFamily(FONT)
        .fontSize(command.fontSize)
        .fontWeight(400)
        .width(command.width)
        .height(command.height)
        .textAlign(command.align.toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT')
        .textAlignVertical(command.verticalAlign.toUpperCase() as 'TOP' | 'MIDDLE' | 'BOTTOM')
        .fillColor(command.color)
        .fillOpacity(1)
        .strokeColor(TEXT_STROKE_COLOR)
        .strokeOpacity(TEXT_STROKE_OPACITY)
        .strokeWidth(TEXT_STROKE_WIDTH)
        .position({ x: command.x, y: command.y })
        .attachedTo(tokenId)
        .layer('TEXT')
        .locked(true)
        .id(id)
        .metadata(metadata)
        .visible(options.visible)
        .disableAttachmentBehavior([...DISABLED_ATTACHMENT_BEHAVIORS])
        .disableHit(true)
        .build()
    )
  }

  return items
}

/**
 * Itens que precisam ser apagados: tudo que existe no token com o nosso prefixo e
 * não está na lista de comandos atual (inclusive sobras de versões anteriores).
 */
export function findStaleTokenTrackerItemIds(existingIds: string[], wantedIds: string[]): string[] {
  const wanted = new Set(wantedIds)
  return existingIds.filter(id => !wanted.has(id))
}
