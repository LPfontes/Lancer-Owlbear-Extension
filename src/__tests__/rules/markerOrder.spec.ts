import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CoverType } from '@/classes/components/combat/CombatController'
import { mech } from './_helpers'
import type { Mech } from '@/classes/mech/Mech'

/**
 * Ordem dos marcadores no token.
 *
 * `syncTokenStatusMarkers` distribui os badges na coluna à direita do token
 * seguindo o índice da lista recebida: índice 0 é o badge do TOPO. A Cobertura
 * precisa vir na frente para não ficar abaixo das condições.
 */
let m: Mech
const cc = () => m.CombatController

beforeEach(() => {
  m = mech()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ordem dos marcadores de status', () => {
  it('T-MARKER-order-01: condição fica acima da cobertura mesmo com o cover ativo depois', () => {
    cc().AddStatus('impaired')
    cc().Cover = CoverType.Soft

    const ids = cc().StatusController.MarkerStatusIds()

    expect(ids).toEqual(['softcover', 'impaired'])
    expect(ids.indexOf('softcover')).toBeLessThan(ids.indexOf('impaired'))
  })

  it('T-MARKER-order-02: a cobertura não pode ser duplicada na lista', () => {
    cc().Cover = CoverType.Hard
    const once = cc().StatusController.MarkerStatusIds()
    expect(once).toEqual(['hardcover'])

    // uma nova leitura não pode empilhar o mesmo id
    expect(cc().StatusController.MarkerStatusIds()).toEqual(once)
  })

  it('T-MARKER-order-03: trocar a cobertura substitui o id, não acumula', () => {
    cc().Cover = CoverType.Soft
    expect(cc().StatusController.MarkerStatusIds()).toEqual(['softcover'])

    cc().Cover = CoverType.Hard
    expect(cc().StatusController.MarkerStatusIds()).toEqual(['hardcover'])

    cc().Cover = CoverType.None
    expect(cc().StatusController.MarkerStatusIds()).not.toContain('softcover')
    expect(cc().StatusController.MarkerStatusIds()).not.toContain('hardcover')
  })

  it('T-MARKER-order-04: sem cobertura, os status mantêm a ordem natural', () => {
    cc().AddStatus('slow')
    cc().AddStatus('impaired')

    expect(cc().StatusController.MarkerStatusIds()).toEqual(['slow', 'impaired'])
  })
})

