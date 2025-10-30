import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationManager, type ConversationConfig } from '../../src/conversation/manager.js'

const JID = '5511999999999@s.whatsapp.net'

describe('ConversationManager', () => {
  const sendText = vi
    .fn<[string, string, { forwardToLog?: boolean } | undefined], Promise<void>>()
    .mockResolvedValue()

  let manager: ConversationManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new ConversationManager({ sendText })
  })

  it('starts a new conversation and sends greeting', async () => {
    await manager.startConversation(JID)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Olá! Somos a Confia'),
      undefined
    )
  })

  it('handles full flow including validation and options', async () => {
    await manager.startConversation(JID)
    sendText.mockClear()

    await manager.handleMessage(JID, 'abc')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Não reconhecemos a placa informada.'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'ABC1D23')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Agora informe a quilometragem atual'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'km desconhecida')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Não consegui identificar a quilometragem.'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, '45210')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Como podemos ajudar?'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, '1')
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      JID,
      expect.stringContaining('🚨 Atendimento urgente acionado!'),
      undefined
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      JID,
      expect.stringContaining('Como podemos ajudar?'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, '2')
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      JID,
      expect.stringContaining('🛠️ Manutenção preventiva'),
      undefined
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      JID,
      expect.stringContaining('Como podemos ajudar?'),
      undefined
    )
  })

  it('resets the flow when user asks to restart', async () => {
    await manager.startConversation(JID)
    sendText.mockClear()

    await manager.handleMessage(JID, 'reiniciar')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Confia Veículos'),
      undefined
    )
  })

  it('uses custom configuration overrides', async () => {
    const customConfig: Partial<ConversationConfig> = {
      greeting: 'Oi, vamos começar?'
    }
    const customManager = new ConversationManager({ sendText, config: customConfig })
    await customManager.startConversation(JID)
    expect(sendText).toHaveBeenCalledWith(JID, customConfig.greeting, undefined)
  })
})
