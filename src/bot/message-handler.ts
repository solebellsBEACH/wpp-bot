import { type proto, type WASocket } from '@whiskeysockets/baileys'

import { type ConversationManager } from '../conversation/manager.js'
import { type FeatureRegistry, type MessageContext } from '../features.js'
import { log } from '../logger.js'
import { MessageService } from './message-service.js'

interface MessageHandlerDependencies {
  conversationManager: ConversationManager
  features: FeatureRegistry
  messageService: MessageService
  getSock: () => WASocket | undefined
  isAllowedChat: (jid: string) => Promise<boolean>
  sendText: (jid: string, text: string) => Promise<void>
}

export class BotMessageHandler {
  constructor(private readonly deps: MessageHandlerDependencies) {}

  async handle(message: proto.IWebMessageInfo): Promise<void> {
    const text = this.extractMessageText(message)
    const from = message.key?.remoteJid ?? undefined
    const name = message.pushName ?? undefined

    if (!from || !text) return
    if (!(await this.deps.isAllowedChat(from))) return

    await this.deps.messageService.ensureSession(from)

    const isFromMe = Boolean(message.key?.fromMe)
    const messageId = message.key?.id
    if (
      isFromMe &&
      messageId &&
      this.deps.messageService.consumeOutboundMessage(messageId)
    ) {
      log.msgOut(from, text)
      return
    }

    log.msgIn(from, name, text)

    if (isFromMe) {
      // Mensagens enviadas manualmente pelo mesmo número devem continuar o fluxo
    }

    await this.deps.messageService.forwardLogMessage(from, name, text)

    if (await this.deps.conversationManager.handleMessage(from, text)) {
      return
    }

    const normalized = text.trim().toLowerCase()
    const feature = this.deps.features.get(normalized)

    if (!feature) {
      if (normalized === 'menu' || normalized === 'ajuda') {
        await this.triggerFeature('help', message, from, text)
      }
      return
    }

    await this.triggerFeature(feature.key, message, from, text)
  }

  private async triggerFeature(
    key: string,
    message: proto.IWebMessageInfo,
    from: string,
    text: string
  ): Promise<void> {
    const feature = this.deps.features.get(key)
    const sock = this.deps.getSock()
    if (!feature || !sock) return

    const context: MessageContext = {
      sock,
      message,
      text,
      from,
      name: message.pushName ?? undefined,
      reply: async (payload: string) => {
        await this.deps.sendText(from, payload)
      }
    }

    try {
      await feature.handler(context)
    } catch (err) {
      log.err(
        `Falha na funcionalidade "${feature.key}":`,
        (err as Error)?.message ?? err
      )
    }
  }

  private extractMessageText(message: proto.IWebMessageInfo): string {
    return (
      message.message?.conversation ??
      message.message?.extendedTextMessage?.text ??
      message.message?.ephemeralMessage?.message?.conversation ??
      ''
    ).trim()
  }
}
