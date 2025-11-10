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

  it('starts a new conversation and asks for the plate first', async () => {
    await manager.handleMessage(JID, 'confiaVeiculos')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Por favor, informe a placa do veículo'),
      undefined
    )
  })

  it('accepts trigger with accents, spaces or punctuation', async () => {
    await manager.handleMessage(JID, 'Confia Veículos!')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Por favor, informe a placa do veículo'),
      undefined
    )
  })

  it('handles the full flow collecting plate and km before the options', async () => {
    await manager.handleMessage(JID, 'confiaVeiculos')
    sendText.mockClear()

    await manager.handleMessage(JID, '123')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Placa inválida'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'ABC1D23')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Agora, informe a quilometragem'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'km desconhecida')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Não consegui identificar a quilometragem'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, '45210')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Como podemos ajudar hoje?'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'abc')
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      JID,
      expect.stringContaining('Não entendi sua escolha'),
      undefined
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      JID,
      expect.stringContaining('Responda com 1 para urgência'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, '2')
    expect(sendText).toHaveBeenNthCalledWith(
      1,
      JID,
      expect.stringContaining('Registramos o veículo ABC1D23'),
      undefined
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      JID,
      expect.stringContaining('Deseja continuar o atendimento?'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'sim')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Por favor, informe a placa do veículo'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'DEF2G34')
    await manager.handleMessage(JID, '654321')
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
      expect.stringContaining('Deseja continuar o atendimento?'),
      undefined
    )

    sendText.mockClear()
    await manager.handleMessage(JID, 'não')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Quando quiser retomar'),
      undefined
    )
    sendText.mockClear()
    await manager.handleMessage(JID, '1')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Por favor, informe a placa do veículo'),
      undefined
    )
  })

  it('emits ticket details after the user selects the service type', async () => {
    const onTicketCreated = vi.fn()
    manager = new ConversationManager({ sendText, onTicketCreated })

    await manager.handleMessage(JID, 'confiaVeiculos', { name: 'Cliente' })
    await manager.handleMessage(JID, 'ABC1D23')
    await manager.handleMessage(JID, '50000')
    await manager.handleMessage(JID, '1')

    expect(onTicketCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        jid: JID,
        plate: 'ABC1D23',
        km: '50000',
        name: 'Cliente',
        type: 'urgent'
      })
    )
  })

  it('resets the flow when user asks to restart', async () => {
    await manager.handleMessage(JID, 'confiaVeiculos')
    sendText.mockClear()

    await manager.handleMessage(JID, 'reiniciar')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Por favor, informe a placa do veículo'),
      undefined
    )
  })

  it('uses custom configuration overrides', async () => {
    const customConfig: Partial<ConversationConfig> = {
      initialMessage: 'Oi, vamos começar?',
      greeting: 'Olá!'
    }
    const customManager = new ConversationManager({ sendText, config: customConfig })
    await customManager.handleMessage(JID, 'oi, vamos começar?')
    expect(sendText).toHaveBeenCalledWith(
      JID,
      expect.stringContaining('Olá!'),
      undefined
    )
  })
})
