import { describe, expect, it, vi } from 'vitest'
import { layoutTokenTrackers } from '@/services/tokenTrackerLayout'
import {
  DEFAULT_TOKEN_TRACKER_CONFIG,
  TOKEN_TRACKER_ITEM_METADATA_KEY,
  TOKEN_TRACKER_ITEM_SLOT_KEY,
  type TokenTrackerValues,
} from '@/types/token-tracker'

/**
 * Os builders reais do SDK exigem o `playerId` do message bus, que só existe
 * dentro de uma sala do Owlbear. Aqui o SDK entra como um mock ESTRITO: qualquer
 * método que a implementação chame e o mock não conheça estoura, então a spec
 * continua valendo como contrato de qual API fluente usamos (e com quais valores).
 */
vi.mock('@owlbear-rodeo/sdk', () => {
  const ALLOWED = new Set([
    'id', 'metadata', 'attachedTo', 'layer', 'locked', 'visible', 'disableAttachmentBehavior',
    'disableHit', 'position', 'points', 'tension', 'closed', 'fillColor', 'fillOpacity',
    'strokeColor', 'strokeOpacity', 'strokeWidth', 'width', 'height', 'shapeType', 'plainText',
    'textType', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'textAlignVertical',
    'scale',
  ])

  function makeBuilder(type: string, extra: Record<string, unknown> = {}) {
    const state: Record<string, unknown> = { type, ...extra }
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, property: string) {
          if (property === 'build') return () => state
          if (!ALLOWED.has(property)) {
            throw new Error(`Método do SDK usado sem estar no mock: ${property}`)
          }
          return (value?: unknown) => {
            state[property] = value
            return proxy
          }
        },
      }
    )
    return proxy
  }

  return {
    buildCurve: () => makeBuilder('CURVE'),
    buildShape: () => makeBuilder('SHAPE'),
    buildText: () => makeBuilder('TEXT'),
    buildImage: (image: { url?: string }) => makeBuilder('IMAGE', { url: image?.url }),
  }
})

const { buildTokenTrackerItems, findStaleTokenTrackerItemIds, isTokenTrackerItem, tokenTrackerItemId } =
  await import('@/services/tokenTrackerRender')

const TOKEN_ID = 'token-1'

const VALUES: TokenTrackerValues = {
  pv: { current: 12, max: 20 },
  overshield: { current: 4, max: 0 },
  heat: { current: 3, max: 8 },
  speed: { current: 4, max: 6 },
  structure: { current: 2, max: 4 },
  stress: { current: 1, max: 4 },
}

interface MockItem {
  type: string
  id: string
  attachedTo: string
  layer: string
  locked: boolean
  visible: boolean
  disableHit: boolean
  disableAttachmentBehavior: string[]
  metadata: Record<string, unknown>
  points?: unknown[]
  shapeType?: string
}

function build(visible = true) {
  const { commands } = layoutTokenTrackers({
    bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
    values: VALUES,
    config: DEFAULT_TOKEN_TRACKER_CONFIG,
  })
  const items = buildTokenTrackerItems(TOKEN_ID, commands, { visible }) as unknown as MockItem[]
  return { commands, items }
}

describe('buildTokenTrackerItems — ligação com o token', () => {
  it('cria um item para cada comando de desenho', () => {
    const { commands, items } = build()
    expect(items).toHaveLength(commands.length)
    expect(items.length).toBeGreaterThan(0)
  })

  it('todos ficam anexados ao token, travados e sem hit', () => {
    for (const item of build().items) {
      expect(item.attachedTo).toBe(TOKEN_ID)
      expect(item.locked).toBe(true)
      expect(item.disableHit).toBe(true)
    }
  })

  it('não gira nem escala junto com o token', () => {
    for (const item of build().items) {
      expect(item.disableAttachmentBehavior).toEqual(
        expect.arrayContaining(['ROTATION', 'SCALE', 'VISIBLE', 'COPY'])
      )
    }
  })

  it('acompanha a visibilidade do token', () => {
    expect(build(true).items.every(item => item.visible === true)).toBe(true)
    expect(build(false).items.every(item => item.visible === false)).toBe(true)
  })

  it('marca cada item com metadata do serviço e o slot de origem', () => {
    const { items } = build()
    for (const item of items) {
      expect(item.metadata[TOKEN_TRACKER_ITEM_METADATA_KEY]).toBe(true)
      expect(typeof item.metadata[TOKEN_TRACKER_ITEM_SLOT_KEY]).toBe('string')
    }
    const slots = new Set(items.map(item => item.metadata[TOKEN_TRACKER_ITEM_SLOT_KEY]))
    expect(slots).toEqual(new Set(['pv', 'overshield', 'heat', 'speed', 'structure', 'stress']))
  })
})

describe('buildTokenTrackerItems — ids determinísticos e camadas', () => {
  it('gera o mesmo id para os mesmos comandos (permite update em vez de recriar)', () => {
    expect(build().items.map(item => item.id)).toEqual(build().items.map(item => item.id))
  })

  it('prefixa o id com o token', () => {
    for (const item of build().items) {
      expect(item.id.startsWith(`cc_tt_${TOKEN_ID}_`)).toBe(true)
    }
  })

  it('ids são únicos dentro do token', () => {
    const ids = build().items.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('formas vão para ATTACHMENT e textos para TEXT', () => {
    const { items } = build()
    for (const item of items) {
      expect(item.layer).toBe(item.type === 'TEXT' ? 'TEXT' : 'ATTACHMENT')
    }
    expect(items.some(item => item.type === 'TEXT')).toBe(true)
    expect(items.some(item => item.type === 'SHAPE')).toBe(true)
    expect(items.some(item => item.type === 'CURVE')).toBe(true)
  })

  it('Estrutura e Estresse vão para posições DIFERENTES no canvas', () => {
    const squares = build().items.filter(item => item.type === 'SHAPE') as unknown as Array<{
      id: string
      position: { x: number; y: number }
    }>

    const structure = squares.filter(item => item.id.includes('_structure_sq_'))
    const stress = squares.filter(item => item.id.includes('_stress_sq_'))

    expect(structure).toHaveLength(4)
    expect(stress).toHaveLength(4)

    const structureY = new Set(structure.map(item => item.position.y))
    const stressY = new Set(stress.map(item => item.position.y))
    expect(structureY.size).toBe(1)
    expect(stressY.size).toBe(1)
    // Se estivessem no mesmo lugar, o Estresse sumiria atrás da Estrutura.
    expect([...structureY][0]).not.toBe([...stressY][0])
  })

  it('nenhum item do painel compartilha o mesmo id', () => {
    const ids = build().items.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('círculo para numérico, retângulo para quadrado', () => {
    const shapes = build().items.filter(item => item.type === 'SHAPE')
    expect(shapes.some(shape => shape.shapeType === 'CIRCLE')).toBe(true)
    expect(shapes.some(shape => shape.shapeType === 'RECTANGLE')).toBe(true)
  })

  it('o ícone do Movimento vira item de IMAGEM apontando para o SVG estático', () => {
    const images = build().items.filter(item => item.type === 'IMAGE') as unknown as Array<{
      id: string
      url: string
      scale: { x: number }
    }>
    expect(images).toHaveLength(1)
    expect(images[0].id).toBe(`cc_tt_${TOKEN_ID}_speed_icon`)
    // URL absoluta http(s): o loader do Owlbear não renderiza `data:` URL.
    expect(images[0].url).toMatch(/\/tracker-icons\/speed\.svg$/)
    expect(images[0].url.startsWith('http')).toBe(true)
    expect(images[0].scale.x).toBeGreaterThan(0)
  })

  it('desenha pontos no fundo e no preenchimento da barra', () => {
    const curves = build().items.filter(item => item.type === 'CURVE')
    const background = curves.find(curve => curve.id.endsWith('pv_bg'))
    const fill = curves.find(curve => curve.id.endsWith('pv_fill'))
    expect(background?.points?.length).toBeGreaterThan(3)
    expect(fill?.points?.length).toBeGreaterThan(3)
  })

  it('não cria item de preenchimento quando o valor é zero', () => {
    const { commands } = layoutTokenTrackers({
      bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
      values: { pv: { current: 0, max: 20 } },
      config: DEFAULT_TOKEN_TRACKER_CONFIG,
    })
    const items = buildTokenTrackerItems(TOKEN_ID, commands, { visible: true }) as unknown as MockItem[]
    expect(items.some(item => item.id.endsWith('pv_fill'))).toBe(false)
  })
})

describe('tokenTrackerItemId / isTokenTrackerItem', () => {
  it('monta o id no formato canônico', () => {
    expect(tokenTrackerItemId('abc', 'pv_bg')).toBe('cc_tt_abc_pv_bg')
  })

  it('reconhece item do painel pelo id ou pela metadata', () => {
    const { items } = build()
    expect(isTokenTrackerItem(items[0] as never)).toBe(true)
    expect(isTokenTrackerItem({ id: 'cc_tt_x_y', metadata: {} } as never)).toBe(true)
    expect(
      isTokenTrackerItem({ id: 'outro', metadata: { [TOKEN_TRACKER_ITEM_METADATA_KEY]: true } } as never)
    ).toBe(true)
    expect(isTokenTrackerItem({ id: 'outro', metadata: {} } as never)).toBe(false)
  })
})

describe('findStaleTokenTrackerItemIds', () => {
  it('aponta o que existe no token e não é mais desejado', () => {
    expect(
      findStaleTokenTrackerItemIds(
        ['cc_tt_t_pv_bg', 'cc_tt_t_pv_fill', 'cc_tt_t_sobra'],
        ['cc_tt_t_pv_bg', 'cc_tt_t_pv_fill']
      )
    ).toEqual(['cc_tt_t_sobra'])
  })

  it('sem sobras devolve vazio', () => {
    expect(findStaleTokenTrackerItemIds(['a'], ['a', 'b'])).toEqual([])
    expect(findStaleTokenTrackerItemIds([], ['a'])).toEqual([])
  })
})
