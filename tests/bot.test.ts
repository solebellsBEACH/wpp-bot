import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandleMessage = vi.fn<[string, string], Promise<boolean>>().mockResolvedValue(false)
const mockStartConversation = vi.fn<[string, boolean?], Promise<void>>().mockResolvedValue()

vi.mock('../src/conversation/manager.js', () => ({
  ConversationManager: vi.fn().mockImplementation(() => ({
    handleMessage: mockHandleMessage,
    startConversation: mockStartConversation
  }))
}))

const createSocketMock = vi.fn()

vi.mock('../src/whatsapp.js', () => ({
  createSocket: (...args: unknown[]) => createSocketMock(...args)
}))

import { Bot } from '../src/bot.js'
import { FeatureRegistry } from '../src/features.js'

interface MockSocket {
  ev: {
    on: (event: string, handler: (...args: any[]) => void) => void
    off: (event: string, handler: (...args: any[]) => void) => void
  }
  sendMessage: ReturnType<typeof vi.fn>
  assertSessions: ReturnType<typeof vi.fn>
  ws: { readyState?: number }
  waitForConnectionUpdate?: ReturnType<typeof vi.fn>
  user?: { id?: string }
}

const createMockSocket = (): MockSocket & { emit: (event: string, payload: any) => void } => {
  const emitter = new EventEmitter()
  return {
    ev: {
      on: (event, handler) => {
        emitter.on(event, handler)
      },
      off: (event, handler) => {
        emitter.off(event, handler)
      }
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
    assertSessions: vi.fn().mockResolvedValue(undefined),
    ws: {},
    emit: (event, payload) => {
      emitter.emit(event, payload)
    }
  }
}

const flushAsync = () => new Promise((resolve) => setImmediate(resolve))

describe('Bot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHandleMessage.mockResolvedValue(false)
    mockStartConversation.mockResolvedValue()
  })

  it('starts only once even when called multiple times', async () => {
    const sock = createMockSocket()
    createSocketMock.mockResolvedValue({ sock })
    const bot = new Bot({}, new FeatureRegistry())

    const start1 = bot.start()
    const start2 = bot.start()

    const [result1, result2] = await Promise.all([start1, start2])
    expect(createSocketMock).toHaveBeenCalledTimes(1)
    expect(result1).toBe(sock)
    expect(result2).toBe(sock)
  })

  it('dispatches messages to feature handlers', async () => {
    const sock = createMockSocket()
    sock.user = { id: 'me@s.whatsapp.net' }
    createSocketMock.mockResolvedValue({ sock })
    mockHandleMessage.mockResolvedValue(false)

    const registry = new FeatureRegistry()
    const handler = vi.fn().mockImplementation(async ({ reply }) => {
      await reply('pong')
    })
    registry.set({ key: 'ping', description: 'test', handler })

    const bot = new Bot({ logRecipientJid: undefined }, registry)
    await bot.start()

    const message = {
      key: { remoteJid: '5511999999999@s.whatsapp.net' },
      message: { conversation: 'ping' },
      pushName: 'Tester'
    }

    sock.emit('messages.upsert', { messages: [message] })

    await flushAsync()
    expect(handler).toHaveBeenCalledTimes(1)

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '5511999999999@s.whatsapp.net',
        text: 'ping',
        name: 'Tester'
      })
    )
    expect(sock.sendMessage).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      { text: 'pong' },
      expect.any(Object)
    )
  })

  it('forwards sent messages to default log recipient', async () => {
    const sock = createMockSocket()
    createSocketMock.mockResolvedValue({ sock })
    const bot = new Bot({ logRecipientJid: 'log@s.whatsapp.net' }, new FeatureRegistry())
    ;(bot as any).sock = sock

    await (bot as any).sendText('5511999999999@s.whatsapp.net', 'Olá')

    expect(sock.sendMessage).toHaveBeenNthCalledWith(
      1,
      '5511999999999@s.whatsapp.net',
      { text: 'Olá' },
      expect.any(Object)
    )
    expect(sock.sendMessage).toHaveBeenNthCalledWith(
      2,
      'log@s.whatsapp.net',
      {
        text: expect.stringContaining('📤 LOG DE ENVIO')
      },
      expect.any(Object)
    )
  })
})
