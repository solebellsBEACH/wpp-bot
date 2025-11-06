import { type proto, type WASocket } from '@whiskeysockets/baileys'

import { log } from '../logger.js'
import { BOT_LOG_MESSAGES } from '../shared/constants/messages.js'
import { type ConversationManager } from '../conversation/manager.js'
import { type BotHooks } from './types.js'
import { maskJid } from '../shared/utils/jid.js'

interface RegisterSocketEventsParams {
  sock: WASocket
  hooks?: BotHooks
  autoTestJid?: string
  showQrCode: (qr: string) => void
  resetRetries: () => void
  runHealthCheck: (sock: WASocket, jid: string) => Promise<void>
  ensureManagedGroups: () => Promise<void>
  conversationManager: ConversationManager
  notifyStartup: () => Promise<void>
  greetDefaultRecipient: () => Promise<void>
  setSocketUnavailable: () => void
  restartBot: () => Promise<WASocket>
  nextBackoff: () => number
  handleIncomingMessage: (message: proto.IWebMessageInfo) => Promise<void>
}

export function registerSocketEvents({
  sock,
  hooks,
  autoTestJid,
  showQrCode,
  resetRetries,
  runHealthCheck,
  ensureManagedGroups,
  conversationManager,
  notifyStartup,
  greetDefaultRecipient,
  setSocketUnavailable,
  restartBot,
  nextBackoff,
  handleIncomingMessage
}: RegisterSocketEventsParams): void {
  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update

    if (qr) {
      showQrCode(qr)
      hooks?.onQrCode?.(qr)
    }

    if (connection === 'open') {
      resetRetries()
      const me = sock.user?.id ?? autoTestJid
      log.ok('Bot conectado')
      if (me) {
        hooks?.onConnectionOpen?.(me)
        await runHealthCheck(sock, me)
      }
      await ensureManagedGroups()
      conversationManager.clearAll()
      await notifyStartup()
      await greetDefaultRecipient()
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
      hooks?.onConnectionClose?.({ status, message: reason })
      setSocketUnavailable()
      setTimeout(() => {
        void restartBot().catch((err) => {
          log.err(
            BOT_LOG_MESSAGES.restartFailure,
            (err as Error)?.message ?? err
          )
        })
      }, nextBackoff())
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
    await handleIncomingMessage(message)
  })
}
