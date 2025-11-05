import { type proto, type WASocket } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'

import {
  ConversationManager,
  type ConversationConfig
} from '../conversation/manager.js'
import {
  featureRegistry,
  type FeatureDefinition,
  type FeatureRegistry,
  type MessageContext
} from '../features.js'
import { log, maskJid } from '../logger.js'
import { BOT_LOG_MESSAGES } from '../shared/constants/messages.js'
import { createSocket, type CreateSocketOptions } from '../whatsapp/index.js'
import { createInitialGroupState, ensureManagedGroups, isAllowedChat } from './group-management.js'
import { MessageService, type SendTextOptions } from './message-service.js'

const AUTO_TEST_MESSAGE = '✅ Bot online (auto-teste).'
const STARTUP_LOG_MESSAGE = '🚀 Bot iniciado e pronto para uso.'

export interface BotHooks {
  onQrCode?: (qr: string) => void
  onConnectionOpen?: (jid: string) => void
  onConnectionClose?: (reason: { status?: number; message: string }) => void
}

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
  private readonly groupState = createInitialGroupState()

  constructor(
    private readonly options: BotOptions = {},
    private readonly features: FeatureRegistry = featureRegistry
  ) {
    this.ensureDefaultFeatures()

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
    this.registerEventHandlers(sock)
    return sock
  }

  private registerEventHandlers(sock: WASocket): void {
    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update

      if (qr) {
        this.showQrCode(qr)
        this.options.hooks?.onQrCode?.(qr)
      }

      if (connection === 'open') {
        this.retries = 0
        const me = sock.user?.id ?? this.options.autoTestJid
        log.ok('Bot conectado')
        if (me) {
          this.options.hooks?.onConnectionOpen?.(me)
          await this.runHealthCheck(sock, me)
        }
        await this.ensureManagedGroups()
        this.conversationManager.clearAll()
        await this.notifyStartup()
        await this.greetDefaultRecipient()
      }

      if (connection === 'close') {
        const lastError = lastDisconnect?.error as
          | {
              output?: { statusCode?: number }
              message?: string
            }
          | undefined
        const status = lastError?.output?.statusCode
        const reason = lastError?.message ?? 'desconhecido'
        log.warn(`Conexão fechada | status=${status} | reason=${reason}`)
        this.options.hooks?.onConnectionClose?.({ status, message: reason })
        this.sock = undefined
        setTimeout(() => {
          void this.start().catch((err) => {
            log.err(BOT_LOG_MESSAGES.restartFailure, (err as Error)?.message ?? err)
          })
        }, this.nextBackoff())
      }
    })

    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        const jid = update.key?.remoteJid
        const errorName = (update as unknown as { error?: { name?: string } }).error?.name
        if (!jid || !errorName) continue

        if (errorName === 'SessionError' || errorName === 'PreKeyError') {
          log.warn(`${BOT_LOG_MESSAGES.reconnectingSession} ${maskJid(jid)} após ${errorName}`)
          try {
            await sock.assertSessions([jid])
          } catch (err) {
            log.err(
              `${BOT_LOG_MESSAGES.failingReconnectSession} ${maskJid(jid)}:`,
              (err as Error)?.message ?? err
            )
          }
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const message = messages?.[0]
      if (!message?.message) return
      await this.handleIncomingMessage(message)
    })
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

  private async handleIncomingMessage(message: proto.IWebMessageInfo): Promise<void> {
    const text = this.extractMessageText(message)
    const from = message.key?.remoteJid ?? undefined
    const name = message.pushName ?? undefined

    if (!from || !text) return
    if (!(await this.isAllowedChat(from))) {
      return
    }

    await this.messageService.ensureSession(from)

    const isFromMe = Boolean(message.key?.fromMe)
    const messageId = message.key?.id
    if (isFromMe && messageId && this.messageService.consumeOutboundMessage(messageId)) {
      log.msgOut(from, text)
      return
    }

    log.msgIn(from, name, text)

    if (isFromMe) {
      // Mensagens enviadas manualmente pelo mesmo número devem continuar o fluxo
    }

    await this.messageService.forwardLogMessage(from, name, text)

    if (await this.conversationManager.handleMessage(from, text)) {
      return
    }

    const normalized = text.trim().toLowerCase()
    const feature = this.features.get(normalized)

    if (!feature) {
      if (normalized === 'menu' || normalized === 'ajuda') {
        await this.triggerFeature('help', message, from, text)
        return
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
    const feature = this.features.get(key)
    if (!feature || !this.sock) return

    const context: MessageContext = {
      sock: this.sock,
      message,
      text,
      from,
      name: message.pushName ?? undefined,
      reply: async (payload: string) => {
        await this.sendText(from, payload)
      }
    }

    try {
      await feature.handler(context)
    } catch (err) {
      log.err(`Falha na funcionalidade "${feature.key}":`, (err as Error)?.message ?? err)
    }
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

  private extractMessageText(message: proto.IWebMessageInfo): string {
    return (
      message.message?.conversation ??
      message.message?.extendedTextMessage?.text ??
      message.message?.ephemeralMessage?.message?.conversation ??
      ''
    ).trim()
  }

  private ensureDefaultFeatures(): void {
    if (!this.features.has('help')) {
      this.setFeature({
        key: 'help',
        description: 'Mostra os comandos disponíveis',
        handler: async ({ reply }) => {
          const others = this.features
            .list()
            .filter((feature) => feature.key !== 'help')
          if (others.length === 0) {
            await reply('Ainda não há funcionalidades disponíveis.')
            return
          }

          const lines = others.map((feature) => `• ${feature.key} — ${feature.description}`)
          await reply(['Funcionalidades disponíveis:', ...lines].join('\n'))
        }
      })
    }
  }
}
