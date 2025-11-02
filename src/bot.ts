import { type proto, type WASocket } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import {
  featureRegistry,
  type FeatureDefinition,
  type FeatureRegistry,
  type MessageContext
} from './features.js'
import { log, maskJid } from './logger.js'
import { createSocket, type CreateSocketOptions } from './whatsapp/index.js'
import {
  ConversationManager,
  type ConversationConfig
} from './conversation/manager.js'
import { normalizeJid } from './utils/jid.js'
import { DEFAULT_GROUP_NAME, DEFAULT_LOG_GROUP_NAME } from './shared/contants/settings.js'
import { BOT_LOG_MESSAGES, GROUP_START_MESSAGES } from './shared/contants/messages.js'

const AUTO_TEST_MESSAGE = '✅ Bot online (auto-teste).'
const STARTUP_LOG_MESSAGE = '🚀 Bot iniciado e pronto para uso.'

interface SendTextOptions {
  forwardToLog?: boolean
}

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
  private readonly groupNameCache = new Map<string, string>()
  private readonly sentMessageIds = new Set<string>()
  private allowedGroupName = DEFAULT_GROUP_NAME.toLowerCase()
  private allowedGroupJid?: string
  private logGroupJid?: string

  constructor(
    private readonly options: BotOptions = {},
    private readonly features: FeatureRegistry = featureRegistry
  ) {
    this.ensureDefaultFeatures()
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

    type GroupMetadataLite = { id: string; subject?: string }
    const createdGroups: Array<{ jid: string; message: string }> = []
    const desiredGroups: Array<{
      name: string
      onResolved: (metadata: GroupMetadataLite, requestedName: string) => void
      getWelcomeMessage?: () => string
    }> = [
      {
        name: DEFAULT_GROUP_NAME,
        onResolved: (metadata, requestedName) => {
          const subject = (metadata.subject ?? requestedName).trim() || requestedName
          this.allowedGroupName = subject.toLowerCase()
          this.allowedGroupJid = metadata.id
          this.groupNameCache.set(metadata.id, subject)
        },
        getWelcomeMessage: () => GROUP_START_MESSAGES.primary
      },
      {
        name: DEFAULT_LOG_GROUP_NAME,
        onResolved: (metadata, requestedName) => {
          const subject = (metadata.subject ?? requestedName).trim() || requestedName
          this.logGroupJid = metadata.id
          this.groupNameCache.set(metadata.id, subject)
        },
        getWelcomeMessage: () => GROUP_START_MESSAGES.log
      }
    ]

    let allGroups: Record<string, GroupMetadataLite> | undefined
    try {
      allGroups = await sock.groupFetchAllParticipating?.()
    } catch (err) {
      log.warn(
        'Não foi possível listar os grupos atuais:',
        (err as Error)?.message ?? err
      )
    }

    const findExistingByName = (name: string): GroupMetadataLite | undefined => {
      const normalized = name.trim().toLowerCase()
      const groups = allGroups ? Object.values(allGroups) : []
      return groups.find((group) => (group.subject ?? '').trim().toLowerCase() === normalized)
    }

    for (const { name, onResolved, getWelcomeMessage } of desiredGroups) {
      const existing = findExistingByName(name)
      if (existing) {
        onResolved(existing, name)
        continue
      }

      try {
        const created = await sock.groupCreate(name, [])
        onResolved(created, name)
        log.info(`Grupo "${name}" criado com sucesso: ${maskJid(created.id)}`)
        const message = getWelcomeMessage?.()
        if (message) {
          createdGroups.push({ jid: created.id, message })
        }
      } catch (err) {
        log.err(
          `Falha ao criar o grupo "${name}":`,
          (err as Error)?.message ?? err
        )
      }
    }

    for (const { jid, message } of createdGroups) {
      try {
        await this.sendText(jid, message, { forwardToLog: false })
      } catch (err) {
        log.err(BOT_LOG_MESSAGES.groupWelcomeFailure, (err as Error)?.message ?? err)
      }
    }
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

    await this.ensureSession(from)

    const isFromMe = Boolean(message.key?.fromMe)
    const messageId = message.key?.id
    if (isFromMe && messageId && this.sentMessageIds.has(messageId)) {
      this.sentMessageIds.delete(messageId)
      log.msgOut(from, text)
      return
    }

    log.msgIn(from, name, text)

    if (isFromMe) {
      // Mensagens enviadas manualmente pelo mesmo número devem continuar o fluxo
    }

    await this.forwardLogMessage(from, name, text)

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
      log.err(
        `Falha na funcionalidade "${feature.key}":`,
        (err as Error)?.message ?? err
      )
    }
  }

  private getLogRecipient(): string | undefined {
    return (
      this.options.logRecipientJid ??
      this.logGroupJid ??
      this.options.autoTestJid
    )
  }

  private buildOutgoingLogPayload(to: string, text: string): string {
    return ['📤 LOG DE ENVIO', `Destino: ${maskJid(to)}`, `Conteúdo: ${text}`].join('\n')
  }

  private async ensureSession(jid: string): Promise<void> {
    const sock = this.sock
    if (!sock) return
    // Sessões são relevantes apenas para chats diretos; grupos usam sender keys
    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) {
      return
    }
    try {
      await sock.assertSessions([jid])
    } catch (err) {
      log.warn(
        `Falha ao garantir sessão com ${maskJid(jid)}:`,
        (err as Error)?.message ?? err
      )
    }
  }

  private async sendRaw(to: string, text: string): Promise<void> {
    const sock = this.sock
    if (!sock) throw new Error('WhatsApp socket não está conectado')

    const target = normalizeJid(to)
    const isGroup = target.endsWith('@g.us') || target.endsWith('@broadcast')

    if (!isGroup) {
      await this.ensureSession(target)
    }

    const sendOptions = isGroup ? undefined : ({ forceNewSession: true } as any)
    const result = (await sock.sendMessage(target, { text }, sendOptions)) as
      | proto.WebMessageInfo
      | undefined
    const messageId = result?.key?.id
    if (messageId) {
      this.sentMessageIds.add(messageId)
    }
    log.msgOut(to, text)
  }

  private async sendText(
    to: string,
    text: string,
    { forwardToLog = true }: SendTextOptions = {}
  ): Promise<void> {
    if (!text) return

    await this.sendRaw(to, text)

    if (!forwardToLog) return

    const logRecipient = this.getLogRecipient()
    if (!logRecipient || logRecipient === to) return

    const summary = this.buildOutgoingLogPayload(to, text)

    try {
      await this.sendRaw(logRecipient, summary)
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.sendLogFailure, (err as Error)?.message ?? err)
    }
  }

  private async forwardLogMessage(from: string, name: string | undefined, text: string): Promise<void> {
    if (!this.sock) return
    const recipient = this.getLogRecipient()
    if (!recipient) return
    if (!text) return
    if (from === recipient) return

    const bodyLines = [
      '📋 LOG DE MENSAGEM',
      `Origem: ${maskJid(from)}${name ? ` (${name})` : ''}`,
      `Conteúdo: ${text}`
    ]
    const payload = bodyLines.join('\n')

    try {
      await this.sendText(recipient, payload, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.forwardLogFailure, (err as Error)?.message ?? err)
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

  private async isAllowedChat(jid: string): Promise<boolean> {
    if (!jid.endsWith('@g.us')) {
      return false
    }

    if (this.allowedGroupJid) {
      return jid === this.allowedGroupJid
    }

    const groupName = await this.getGroupName(jid)
    return groupName?.trim().toLowerCase() === this.allowedGroupName
  }

  private async getGroupName(jid: string): Promise<string | undefined> {
    const cached = this.groupNameCache.get(jid)
    if (cached) return cached
    const sock = this.sock
    if (!sock) return undefined

    try {
      const metadata = await sock.groupMetadata(jid)
      const name = metadata?.subject
      if (name) {
        this.groupNameCache.set(jid, name)
      }
      return name
    } catch (err) {
      log.warn(`Não foi possível obter o nome do grupo ${maskJid(jid)}:`, (err as Error)?.message ?? err)
      return undefined
    }
  }

  private nextBackoff(): number {
    const delay = Math.min(30_000, 2_000 * Math.pow(2, this.retries++))
    return delay
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

          const lines = others.map(
            (feature) => `• ${feature.key} — ${feature.description}`
          )
          await reply(['Funcionalidades disponíveis:', ...lines].join('\n'))
        }
      })
    }
  }
}
