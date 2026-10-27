import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCoalescedDispatcher } from './coalescedDispatcher'

describe('createCoalescedDispatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('agrupa uma rajada de 4 alterações em um único envio com o valor final', () => {
    // Simula PV digitado: 1 -> 2 -> 3 -> 4 em menos de um segundo.
    let hp = 0
    const run = vi.fn(() => hp)
    const dispatcher = createCoalescedDispatcher({ debounceMs: 600, maxWaitMs: 2000, run })

    for (const value of [1, 2, 3, 4]) {
      hp = value
      dispatcher.schedule()
      vi.advanceTimersByTime(50)
    }

    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)

    expect(run).toHaveBeenCalledTimes(1)
    expect(hp).toBe(4)
    expect(dispatcher.pending).toBe(false)
  })

  it('não deixa uma rajada contínua adiar o envio além do teto de espera', () => {
    const run = vi.fn()
    const dispatcher = createCoalescedDispatcher({ debounceMs: 600, maxWaitMs: 2000, run })

    // Alteração a cada 100ms, sem nunca dar 600ms de silêncio.
    for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
      dispatcher.schedule()
      vi.advanceTimersByTime(100)
    }

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('flush executa o pendente na hora e não repete sem rajada', () => {
    const run = vi.fn()
    const dispatcher = createCoalescedDispatcher({ debounceMs: 600, maxWaitMs: 2000, run })

    dispatcher.schedule()
    dispatcher.schedule()
    expect(dispatcher.pending).toBe(true)

    dispatcher.flush()
    expect(run).toHaveBeenCalledTimes(1)
    expect(dispatcher.pending).toBe(false)

    dispatcher.flush()
    vi.advanceTimersByTime(5000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancel descarta a rajada pendente', () => {
    const run = vi.fn()
    const dispatcher = createCoalescedDispatcher({ debounceMs: 600, maxWaitMs: 2000, run })

    dispatcher.schedule()
    dispatcher.cancel()

    vi.advanceTimersByTime(5000)
    expect(run).not.toHaveBeenCalled()
    expect(dispatcher.pending).toBe(false)
  })
})
