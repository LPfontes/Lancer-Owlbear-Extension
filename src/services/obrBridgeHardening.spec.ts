import { describe, it, expect, vi, beforeEach } from 'vitest'
import { obrBridge } from './obrBridge'

const HANDLER = 'handleBroadcastMessage'

const envelope = (payload: any) => ({ obrBridgeBroadcast: true, payload })

// happy-dom does not always honour MessageEventInit.origin, so pin it explicitly.
function postFrom(origin: string, data: any): void {
  const event = new MessageEvent('message', { data, origin })
  if (event.origin !== origin) Object.defineProperty(event, 'origin', { value: origin })
  window.dispatchEvent(event)
}

describe('obrBridge cross-window message handling', () => {
  let handler: any

  beforeEach(async () => {
    vi.restoreAllMocks()
    handler = vi.spyOn(obrBridge as any, HANDLER).mockResolvedValue(undefined)
    await obrBridge.init()
  })

  it('ignores an enveloped message from another origin', () => {
    postFrom('https://evil.example', envelope({ type: 'TABLE_ACTION', action: {} }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores a bare payload from its own origin', () => {
    postFrom(window.location.origin, { type: 'TABLE_ACTION', action: {} })

    expect(handler).not.toHaveBeenCalled()
  })

  it('accepts an enveloped message from its own origin', () => {
    const payload = { type: 'TABLE_ACTION', action: {} }

    postFrom(window.location.origin, envelope(payload))

    expect(handler).toHaveBeenCalledWith(payload)
  })
})
