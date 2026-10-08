import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RELOAD_FLUSH_EVENT, reloadExtensionWindow } from './windowReload'

describe('reloadExtensionWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('avisa os listeners antes de recarregar e só recarrega depois da espera', () => {
    const events: string[] = []
    const onFlush = () => events.push('flush')
    const reload = vi.fn(() => events.push('reload'))
    window.addEventListener(RELOAD_FLUSH_EVENT, onFlush)

    try {
      reloadExtensionWindow({ delayMs: 350, reload })

      // O aviso é síncrono: quem tem timer pendente grava já.
      expect(events).toEqual(['flush'])
      expect(reload).not.toHaveBeenCalled()

      vi.advanceTimersByTime(349)
      expect(reload).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(reload).toHaveBeenCalledTimes(1)
      expect(events).toEqual(['flush', 'reload'])
    } finally {
      window.removeEventListener(RELOAD_FLUSH_EVENT, onFlush)
    }
  })

  it('recarrega mesmo sem ninguém ouvindo o evento', () => {
    const reload = vi.fn()

    reloadExtensionWindow({ delayMs: 0, reload })
    vi.runAllTimers()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
