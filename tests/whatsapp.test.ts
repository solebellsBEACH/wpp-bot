import { describe, expect, it, vi } from 'vitest'
import { closeSocket, waitForConnectionOpen } from '../src/whatsapp/index.js'

describe('waitForConnectionOpen', () => {
  it('resolves immediately when websocket is already open', async () => {
    const sock = { ws: { readyState: 1 } }
    await expect(waitForConnectionOpen(sock as any)).resolves.toBeUndefined()
  })

  it('waits for connection update when necessary', async () => {
    const waitForConnectionUpdate = vi.fn().mockImplementation(
      async (check: (update: { connection?: string }) => boolean, timeout: number) => {
        expect(timeout).toBe(42)
        expect(check({ connection: 'open' })).toBe(true)
      }
    )
    const sock = { ws: {}, waitForConnectionUpdate }

    await waitForConnectionOpen(sock as any, 42)

    expect(waitForConnectionUpdate).toHaveBeenCalledTimes(1)
  })

  it('throws a wrapped error when connection fails', async () => {
    const original = new Error('boom')
    const waitForConnectionUpdate = vi.fn().mockRejectedValue(original)
    const sock = { ws: {}, waitForConnectionUpdate }

    await expect(waitForConnectionOpen(sock as any, 1)).rejects.toThrowError('boom')
  })
})

describe('closeSocket', () => {
  it('calls end when available', () => {
    const end = vi.fn()
    closeSocket({ end } as any)
    expect(end).toHaveBeenCalled()
  })

  it('falls back to ws.close when end throws', () => {
    const close = vi.fn()
    const end = vi.fn(() => {
      throw new Error('fail')
    })
    closeSocket({ end, ws: { close } } as any)
    expect(close).toHaveBeenCalled()
  })

  it('does nothing when socket is missing', () => {
    expect(() => closeSocket(undefined)).not.toThrow()
    expect(() => closeSocket(null)).not.toThrow()
  })
})
