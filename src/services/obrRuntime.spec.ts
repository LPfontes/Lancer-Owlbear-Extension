import { describe, it, expect, beforeEach } from 'vitest'
import { computed, nextTick } from 'vue'
import { isGmClient, obrPlayerId, obrReady, obrRole, resetObrRuntime } from '@/services/obrRuntime'

describe('obrRuntime', () => {
  beforeEach(() => {
    resetObrRuntime()
  })

  it('começa fechado (ninguém é Mestre antes do SDK confirmar)', () => {
    expect(obrReady.value).toBe(false)
    expect(obrRole.value).toBe('PLAYER')
    expect(isGmClient()).toBe(false)
  })

  it('só libera privilégio quando prontidão E papel batem', () => {
    obrRole.value = 'GM'
    expect(isGmClient()).toBe(false) // pronto ainda não

    obrReady.value = true
    expect(isGmClient()).toBe(true)

    obrRole.value = 'PLAYER'
    expect(isGmClient()).toBe(false)
  })

  /**
   * Regressão do bug original: o `computed` era avaliado no primeiro render, antes do
   * handshake, e ficava congelado em `false` porque lia campos não-reativos.
   */
  it('um computed avaliado antes do handshake passa a ver o Mestre depois', async () => {
    const isGM = computed(() => isGmClient())

    expect(isGM.value).toBe(false) // primeiro render: bridge ainda não respondeu

    obrReady.value = true
    obrRole.value = 'GM'
    await nextTick()

    expect(isGM.value).toBe(true)
  })

  it('volta a fechar se o papel mudar para PLAYER', async () => {
    obrReady.value = true
    obrRole.value = 'GM'
    const isGM = computed(() => isGmClient())
    expect(isGM.value).toBe(true)

    obrRole.value = 'PLAYER'
    await nextTick()

    expect(isGM.value).toBe(false)
  })

  it('guarda o playerId do handshake', () => {
    expect(obrPlayerId.value).toBe('')
    obrPlayerId.value = 'player-1'
    expect(obrPlayerId.value).toBe('player-1')
  })
})
