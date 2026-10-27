import { describe, expect, it } from 'vitest'
import {
  changedTokenIds,
  collectBoundTokenIds,
  collectTokenPositions,
  euclideanDistance,
  removedTokenIds,
} from '@/services/tokenMovementGesture'

/**
 * O diff do §13.3 é a única parte da captura que dá para testar sem OBR — e é
 * justamente onde estão as armadilhas (itens do painel contando como movimento,
 * token novo custando movimento).
 */

function token(id: string, x: number, y: number, layer = 'CHARACTER') {
  return { id, layer, position: { x, y } }
}

describe('collectTokenPositions', () => {
  it('lê a posição dos tokens', () => {
    const positions = collectTokenPositions([token('t1', 10, 20), token('t2', 0, 0)])
    expect(positions.get('t1')).toEqual({ x: 10, y: 20 })
    expect(positions.size).toBe(2)
  })

  it('IGNORA os itens do painel (ATTACHMENT/TEXT)', () => {
    // Senão o desenho realimentaria a captura: o painel vive anexado ao token.
    const positions = collectTokenPositions([
      token('t1', 10, 20),
      token('pv_bg', 10, 30, 'ATTACHMENT'),
      token('pv_text', 10, 30, 'TEXT'),
      token('desenho', 1, 1, 'DRAWING'),
    ])
    expect([...positions.keys()]).toEqual(['t1'])
  })

  it('ignora item sem id, sem posição ou com posição inválida', () => {
    const positions = collectTokenPositions([
      { layer: 'CHARACTER', position: { x: 1, y: 1 } },
      { id: 'sem-posicao', layer: 'CHARACTER' },
      { id: 'posicao-ruim', layer: 'CHARACTER', position: { x: 'a', y: 2 } },
      { id: 'nan', layer: 'CHARACTER', position: { x: Number.NaN, y: 2 } },
      token('bom', 5, 5),
    ])
    expect([...positions.keys()]).toEqual(['bom'])
  })

  it('aguenta entrada que não é lista', () => {
    expect(collectTokenPositions(undefined).size).toBe(0)
    expect(collectTokenPositions(null).size).toBe(0)
    expect(collectTokenPositions('nada').size).toBe(0)
  })
})

describe('changedTokenIds', () => {
  const before = collectTokenPositions([token('t1', 0, 0), token('t2', 100, 100)])

  it('UM único evento por arrasto já basta quando o retrato foi semeado', () => {
    // O SDK pode entregar um só `onChange` (no soltar). Com o retrato semeado no
    // start, esse evento único é a divergência que abre e fecha o gesto — sem a
    // semeadura, o primeiro arrasto de cada sessão era engolido.
    const seeded = collectTokenPositions([token('t1', 0, 0), token('t2', 100, 100)])
    const afterDrop = collectTokenPositions([token('t1', 0, 0), token('t2', 250, 100)])
    expect(changedTokenIds(seeded, afterDrop)).toEqual(['t2'])
  })

  it('detecta só quem mudou de posição', () => {
    const after = collectTokenPositions([token('t1', 0, 0), token('t2', 150, 100)])
    expect(changedTokenIds(before, after)).toEqual(['t2'])
  })

  it('token NOVO na cena não conta como movimento', () => {
    // Colocar um token no mapa não pode custar movimento do mecha.
    const after = collectTokenPositions([
      token('t1', 0, 0),
      token('t2', 100, 100),
      token('t3', 7, 7),
    ])
    expect(changedTokenIds(before, after)).toEqual([])
  })

  it('arrastar e voltar ao mesmo pixel não conta', () => {
    const after = collectTokenPositions([token('t1', 0, 0), token('t2', 100, 100)])
    expect(changedTokenIds(before, after)).toEqual([])
  })

  it('mudança fracionária conta (o token anda em unidades de cena)', () => {
    const after = collectTokenPositions([token('t1', 0.5, 0), token('t2', 100, 100)])
    expect(changedTokenIds(before, after)).toEqual(['t1'])
  })

  it('sem retrato anterior, nada mudou', () => {
    expect(changedTokenIds(new Map(), before)).toEqual([])
  })
})

describe('removedTokenIds', () => {
  it('aponta quem saiu da cena (para limpar o retrato)', () => {
    const before = collectTokenPositions([token('t1', 0, 0), token('t2', 1, 1)])
    const after = collectTokenPositions([token('t1', 0, 0)])
    expect(removedTokenIds(before, after)).toEqual(['t2'])
  })
})

describe('collectBoundTokenIds', () => {
  const KEY = 'com.compcon.activemode'

  it('lista só os tokens COM vínculo de ficha', () => {
    const bound = collectBoundTokenIds(
      [
        { id: 't1', layer: 'CHARACTER', metadata: { [KEY]: { sheetId: 's1' } } },
        { id: 't2', layer: 'CHARACTER', metadata: {} },
        { id: 't3', layer: 'CHARACTER' },
      ],
      KEY
    )
    expect([...bound]).toEqual(['t1'])
  })

  it('ignora itens do painel mesmo se tiverem o metadata', () => {
    const bound = collectBoundTokenIds(
      [
        { id: 't1', layer: 'CHARACTER', metadata: { [KEY]: {} } },
        { id: 'pv_bg', layer: 'ATTACHMENT', metadata: { [KEY]: {} } },
      ],
      KEY
    )
    expect([...bound]).toEqual(['t1'])
  })

  it('aguenta entrada que não é lista', () => {
    expect(collectBoundTokenIds(undefined, KEY).size).toBe(0)
    expect(collectBoundTokenIds(null, KEY).size).toBe(0)
  })
})

describe('euclideanDistance', () => {
  it('mede a distância em unidades de cena', () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(euclideanDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
  })
})
