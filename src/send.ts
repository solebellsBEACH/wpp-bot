import qrcode from 'qrcode-terminal'
import { log } from './logger.js'
import { closeSocket, createSocket, waitForConnectionOpen } from './whatsapp/index.js'
import { DEFAULT_PRIMARY_JID } from './shared/contants/settings.js'
import { SEND_MESSAGES } from './shared/contants/messages.js'

const DEFAULT_RECIPIENT = DEFAULT_PRIMARY_JID
const DEFAULT_LOG_RECIPIENT =
  process.env.BOT_LOG_JID ?? process.env.BOT_TEST_JID ?? DEFAULT_RECIPIENT
const DEFAULT_MESSAGE = '👋 Teste manual!'

function normalizeRecipient(input?: string): string {
  if (!input) return DEFAULT_RECIPIENT
  if (input.includes('@')) return input
  const digits = input.replace(/\D/g, '')
  if (!digits) {
    throw new Error(SEND_MESSAGES.invalidRecipient)
  }
  return `${digits}@s.whatsapp.net`
}

function mask(jid = ''): string {
  const [raw, domain] = jid.split('@')
  if (!raw || !domain) return jid
  if (!/^\d+$/.test(raw) || raw.length < 7) return jid
  return `${raw.slice(0, 3)}****${raw.slice(-2)}@${domain}`
}

async function main(): Promise<void> {
  const [, , rawRecipient, ...messageParts] = process.argv
  const to = normalizeRecipient(rawRecipient)
  const text = messageParts.length ? messageParts.join(' ') : DEFAULT_MESSAGE

  let sock: Awaited<ReturnType<typeof createSocket>>['sock'] | undefined
  let onConnectionUpdate:
    | ((update: { qr?: string | null; connection?: string }) => void)
    | undefined

  try {
    ;({ sock } = await createSocket())

    onConnectionUpdate = ({ qr, connection }) => {
      if (qr) {
        console.clear()
        log.info(SEND_MESSAGES.scanQrPrompt)
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        log.info(SEND_MESSAGES.sessionOpen)
      }
    }

    sock.ev.on('connection.update', onConnectionUpdate)

    await waitForConnectionOpen(sock, 60_000)

    await sock.assertSessions([to]).catch(() => undefined)

    await sock.sendMessage(to, { text }, { forceNewSession: true } as any)
    log.msgOut(to, text)

    const logRecipient = DEFAULT_LOG_RECIPIENT
    if (logRecipient && logRecipient !== to) {
      const summary = ['📤 LOG DE ENVIO', `Destino: ${mask(to)}`, `Conteúdo: ${text}`].join('\n')
      try {
        await sock.assertSessions([logRecipient]).catch(() => undefined)
        await sock.sendMessage(logRecipient, { text: summary }, { forceNewSession: true } as any)
        log.msgOut(logRecipient, summary)
      } catch (error) {
        log.err(SEND_MESSAGES.logSendFailure, (error as Error)?.message ?? error)
      }
    }
  } catch (err) {
    log.err(SEND_MESSAGES.sendFailure, (err as Error)?.message ?? err)
    process.exitCode = 1
  } finally {
    if (sock && onConnectionUpdate) {
      sock.ev.off('connection.update', onConnectionUpdate)
    }
    if (sock) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      closeSocket(sock)
    }
  }
}

void main()
