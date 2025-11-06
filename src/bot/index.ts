import { type WASocket } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'

import {
  ConversationManager,
  type ConversationConfig
} from '../conversation/manager.js'
import {
  featureRegistry,
  type FeatureDefinition,
  type FeatureRegistry
} from '../features.js'
import { log } from '../logger.js'
import { BOT_LOG_MESSAGES } from '../shared/constants/messages.js'
import { createSocket, type CreateSocketOptions } from '../whatsapp/index.js'
import { createInitialGroupState, ensureManagedGroups, isAllowedChat } from './group-management.js'
import { ensureDefaultFeatures } from './default-features.js'
import { MessageService, type SendTextOptions } from './message-service.js'
import { BotMessageHandler } from './message-handler.js'
import { registerSocketEvents } from './socket-events.js'
import { type BotHooks } from './types.js'

const AUTO_TEST_MESSAGE = '✅ Bot online (auto-teste).'
const STARTUP_LOG_MESSAGE = '🚀 Bot iniciado e pronto para uso.'

export interface BotOptions extends CreateSocketOptions {
  autoTestJid?: string
  logRecipientJid?: string
  conversationConfig?: Partial<ConversationConfig>
  hooks?: BotHooks
}

export class Bot {
  private sock?: WASocket
  private startPromise?: Promise<WASocket>
  private retries = 0
  private readonly conversationManager: ConversationManager
  private readonly messageService: MessageService
  private readonly messageHandler: BotMessageHandler
  private readonly groupState = createInitialGroupState()

  constructor(
    private readonly options: BotOptions = {},
    private readonly features: FeatureRegistry = featureRegistry
  ) {
    ensureDefaultFeatures(this.features)

    this.messageService = new MessageService({
      getSock: () => this.sock,
      getLogRecipient: () => this.getLogRecipient()
    })

    this.conversationManager = new ConversationManager({
      sendText: (jid, text, options) => this.sendText(jid, text, options),
      logger: {
        error: (message, err) => log.err(message, (err as Error)?.message ?? err)
      },
      config: this.options.conversationConfig
    })

    this.messageHandler = new BotMessageHandler({
      conversationManager: this.conversationManager,
      features: this.features,
      messageService: this.messageService,
      getSock: () => this.sock,
      isAllowedChat: async (jid) => this.isAllowedChat(jid),
      sendText: async (jid, text) => this.sendText(jid, text)
    })
  }

  setFeature(definition: FeatureDefinition): void {
    this.features.set(definition)
  }

  removeFeature(key: string): void {
    this.features.delete(key)
  }

  getFeature(key: string): FeatureDefinition | undefined {
    return this.features.get(key)
  }

  listFeatures(): FeatureDefinition[] {
    return this.features.list()
  }

  async start(): Promise<WASocket> {
    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.initialize()

    try {
      return await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  private async initialize(): Promise<WASocket> {
    const { sock } = await createSocket(this.options)
    this.sock = sock
    registerSocketEvents({
      sock,
      hooks: this.options.hooks,
      autoTestJid: this.options.autoTestJid,
      showQrCode: (qr) => this.showQrCode(qr),
      resetRetries: () => {
        this.retries = 0
      },
      runHealthCheck: (socket, jid) => this.runHealthCheck(socket, jid),
      ensureManagedGroups: () => this.ensureManagedGroups(),
      conversationManager: this.conversationManager,
      notifyStartup: () => this.notifyStartup(),
      greetDefaultRecipient: () => this.greetDefaultRecipient(),
      setSocketUnavailable: () => {
        this.sock = undefined
      },
      restartBot: () => this.start(),
      nextBackoff: () => this.nextBackoff(),
      handleIncomingMessage: (message) => this.messageHandler.handle(message)
    })
    return sock
  }

  private async ensureManagedGroups(): Promise<void> {
    const sock = this.sock
    if (!sock) return

    await ensureManagedGroups({
      state: this.groupState,
      sock,
      sendText: (jid, text, options) => this.sendText(jid, text, options)
    })
  }

  private async runHealthCheck(sock: WASocket, jid: string): Promise<void> {
    try {
      await sock.assertSessions([jid])
      await this.sendText(jid, AUTO_TEST_MESSAGE, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.autoTestFailure, (err as Error)?.message ?? err)
    }
  }

  private async notifyStartup(): Promise<void> {
    const recipient = this.getLogRecipient()
    if (!recipient) return

    try {
      await this.sendText(recipient, STARTUP_LOG_MESSAGE, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.notifyStartupFailure, (err as Error)?.message ?? err)
    }
  }

  private async greetDefaultRecipient(): Promise<void> {
    // Conversa começa somente após receber o gatilho "confiaVeiculos".
    return
  }

  private showQrCode(qr: string): void {
    console.clear()
    log.info('Escaneie o QR abaixo para parear esta sessão')
    qrcode.generate(qr, { small: true })
  }

  private getLogRecipient(): string | undefined {
    return this.options.logRecipientJid ?? this.groupState.logGroupJid ?? this.options.autoTestJid
  }

  private async isAllowedChat(jid: string): Promise<boolean> {
    return isAllowedChat(this.groupState, this.sock, jid)
  }

  private nextBackoff(): number {
    const delay = Math.min(30_000, 2_000 * Math.pow(2, this.retries++))
    return delay
  }

  private async sendText(to: string, text: string, options?: SendTextOptions): Promise<void> {
    await this.messageService.sendText(to, text, options)
  }

}
