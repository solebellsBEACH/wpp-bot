import { type proto, type WASocket } from '@whiskeysockets/baileys'

import { log, maskJid } from '../logger.js'
import { BOT_LOG_MESSAGES } from '../shared/constants/messages.js'
import { normalizeJid } from '../utils/jid.js'

export interface SendTextOptions {
  forwardToLog?: boolean
}

interface MessageServiceDeps {
  getSock: () => WASocket | undefined
  getLogRecipient: () => string | undefined
}

export class MessageService {
  private readonly sentMessageIds = new Set<string>()

  constructor(private readonly deps: MessageServiceDeps) {}

  consumeOutboundMessage(messageId: string): boolean {
    if (this.sentMessageIds.has(messageId)) {
      this.sentMessageIds.delete(messageId)
      return true
    }
    return false
  }

  async ensureSession(jid: string): Promise<void> {
    const sock = this.deps.getSock()
    if (!sock) return
    if (this.isGroupJid(jid)) {
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

  async sendText(to: string, text: string, options: SendTextOptions = {}): Promise<void> {
    if (!text) return

    await this.sendRaw(to, text)

    if (options.forwardToLog === false) return

    const logRecipient = this.deps.getLogRecipient()
    if (!logRecipient || logRecipient === to) return

    const summary = this.buildOutgoingLogPayload(to, text)

    try {
      await this.sendRaw(logRecipient, summary)
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.sendLogFailure, (err as Error)?.message ?? err)
    }
  }

  async forwardLogMessage(from: string, name: string | undefined, text: string): Promise<void> {
    if (!text) return
    const recipient = this.deps.getLogRecipient()
    if (!recipient || from === recipient) return

    const payload = [
      '📋 LOG DE MENSAGEM',
      `Origem: ${maskJid(from)}${name ? ` (${name})` : ''}`,
      `Conteúdo: ${text}`
    ].join('\n')

    try {
      await this.sendText(recipient, payload, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.forwardLogFailure, (err as Error)?.message ?? err)
    }
  }

  private async sendRaw(to: string, text: string): Promise<void> {
    const sock = this.deps.getSock()
    if (!sock) throw new Error('WhatsApp socket não está conectado')

    const target = normalizeJid(to)
    const isGroup = this.isGroupJid(target)

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

  private buildOutgoingLogPayload(to: string, text: string): string {
    return ['📤 LOG DE ENVIO', `Destino: ${maskJid(to)}`, `Conteúdo: ${text}`].join('\n')
  }

  private isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us') || jid.endsWith('@broadcast')
  }
}
