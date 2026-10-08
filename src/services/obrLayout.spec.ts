import { describe, it, expect } from 'vitest'
import {
  OBR_SAFE_MARGIN,
  VIEWPORT_FALLBACK,
  WINDOW_HEIGHT_MIN,
  WINDOW_HEIGHT_VIEWPORT_RATIO,
  WINDOW_WIDTH_MAX,
  WINDOW_WIDTH_MIN,
  clampSheetPosition,
  pickViewportSize,
  sheetWindowHeight,
  sheetWindowWidth,
} from './obrLayout'

describe('pickViewportSize', () => {
  it('prefere o viewport do Owlbear e ignora medidas inválidas', () => {
    expect(
      pickViewportSize({
        obr: { width: 1600, height: 900 },
        inner: { width: 800, height: 600 },
        screen: { width: 2560, height: 1440 },
      })
    ).toEqual({ screenW: 1600, screenH: 900 })

    // Resposta ruim do SDK (0/NaN) não pode virar o tamanho da janela
    expect(
      pickViewportSize({
        obr: { width: 0, height: NaN },
        inner: { width: 1024, height: 768 },
      })
    ).toEqual({ screenW: 1024, screenH: 768 })
  })

  it('cai para a janela do navegador e depois para o monitor', () => {
    expect(pickViewportSize({ screen: { width: 3840, height: 2160 } })).toEqual({
      screenW: 3840,
      screenH: 2160,
    })

    expect(pickViewportSize({})).toEqual({
      screenW: VIEWPORT_FALLBACK.width,
      screenH: VIEWPORT_FALLBACK.height,
    })
  })
})

describe('sheetWindowWidth', () => {
  it('acompanha a largura real do viewport entre o piso e o teto', () => {
    expect(sheetWindowWidth(1920)).toBe(614) // 32%
    expect(sheetWindowWidth(1280)).toBe(WINDOW_WIDTH_MIN) // 410 arredondado cairia abaixo do piso
    expect(sheetWindowWidth(3840)).toBe(WINDOW_WIDTH_MAX)
    expect(sheetWindowWidth(0)).toBe(WINDOW_WIDTH_MIN)
  })
})

describe('sheetWindowHeight', () => {
  it('ocupa o espaço livre real entre o topo e a dock', () => {
    const vp = 1080
    const expected = vp - OBR_SAFE_MARGIN.TOP_RIGHT - OBR_SAFE_MARGIN.BOTTOM
    expect(sheetWindowHeight(vp)).toBe(expected)
    // O teto de 92% do viewport entra quando sobra muito espaço
    expect(sheetWindowHeight(2400)).toBe(Math.round(2400 * WINDOW_HEIGHT_VIEWPORT_RATIO))
  })

  it('nunca encolhe abaixo do piso, mesmo em viewport baixo', () => {
    expect(sheetWindowHeight(500)).toBe(WINDOW_HEIGHT_MIN)
    expect(sheetWindowHeight(0)).toBe(WINDOW_HEIGHT_MIN)
  })

  it('respeita o topo informado', () => {
    const vp = 1000
    expect(sheetWindowHeight(vp, 100)).toBe(vp - 100 - OBR_SAFE_MARGIN.BOTTOM)
  })
})

describe('clampSheetPosition', () => {
  const viewport = { width: 1920, height: 1080 }

  it('reencaixa nas margens uma posição salva com a largura antiga', () => {
    const width = sheetWindowWidth(viewport.width) // 614, antes eram 500 fixos
    const savedLeft = viewport.width - 500 - OBR_SAFE_MARGIN.RIGHT // posição gravada com 500

    const clamped = clampSheetPosition(
      { left: savedLeft, top: 16 },
      { width, height: 900 },
      viewport
    )

    expect(clamped.left).toBe(viewport.width - width - OBR_SAFE_MARGIN.RIGHT)
    expect(clamped.left + width + OBR_SAFE_MARGIN.RIGHT).toBeLessThanOrEqual(viewport.width)
  })

  it('usa o topo folgado quando a janela fica no lado esquerdo', () => {
    expect(clampSheetPosition({ left: 0, top: 0 }, { width: 500, height: 700 }, viewport)).toEqual({
      left: OBR_SAFE_MARGIN.LEFT,
      top: OBR_SAFE_MARGIN.TOP_LEFT,
    })
  })

  it('não deixa a janela passar da dock inferior', () => {
    const height = sheetWindowHeight(viewport.height)
    const clamped = clampSheetPosition({ left: 900, top: 9999 }, { width: 500, height }, viewport)

    expect(clamped.top + height).toBeLessThanOrEqual(viewport.height)
  })
})
