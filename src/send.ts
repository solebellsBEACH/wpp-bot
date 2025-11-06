import qrcode from 'qrcode-terminal'
import { log } from './logger.js'
import { closeSocket, createSocket, waitForConnectionOpen } from './whatsapp/index.js'
import { DEFAULT_LOG_RECIPIENT, DEFAULT_MESSAGE } from './shared/constants/settings.js'
import { SEND_MESSAGES } from './shared/constants/messages.js'
import { mask, normalizeRecipient } from './shared/utils/format.js'

type WhatsAppSocket = Awaited<ReturnType<typeof createSocket>>['sock']

const CONNECTION_TIMEOUT_MS = 60_000
const SOCKET_CLOSE_DELAY_MS = 500
const LOG_HEADER = '📤 LOG DE ENVIO'

async function main(): Promise<void> {
  const { to, text } = parseArgs(process.argv)

  let sock: WhatsAppSocket | undefined
  let unregisterConnectionLogger: (() => void) | undefined

  try {
    ;({ sock } = await createSocket())
    unregisterConnectionLogger = registerConnectionLogger(sock)

    await waitForConnectionOpen(sock, CONNECTION_TIMEOUT_MS)
    await sendText(sock, to, text)
    await sendLogSummaryIfNeeded(sock, to, text)
  } catch (err) {
    log.err(SEND_MESSAGES.sendFailure, (err as Error)?.message ?? err)
    process.exitCode = 1
  } finally {
    unregisterConnectionLogger?.()
    if (sock) {
      await delay(SOCKET_CLOSE_DELAY_MS)
      closeSocket(sock)
    }
  }
}

function parseArgs(argv: string[]): { to: string; text: string } {
  const [, , rawRecipient, ...messageParts] = argv
  const to = normalizeRecipient(rawRecipient)
  const text = messageParts.length ? messageParts.join(' ') : DEFAULT_MESSAGE
  return { to, text }
}

function registerConnectionLogger(sock: WhatsAppSocket): () => void {
  const listener = ({ qr, connection }: { qr?: string | null; connection?: string }) => {
    if (qr) {
      console.clear()
      log.info(SEND_MESSAGES.scanQrPrompt)
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      log.info(SEND_MESSAGES.sessionOpen)
    }
  }

  sock.ev.on('connection.update', listener)
  return () => sock.ev.off('connection.update', listener)
}

async function sendText(sock: WhatsAppSocket, recipient: string, text: string): Promise<void> {
  await sock.assertSessions([recipient]).catch(() => undefined)
  await sock.sendMessage(recipient, { text }, { forceNewSession: true } as any)
  log.msgOut(recipient, text)
}

async function sendLogSummaryIfNeeded(
  sock: WhatsAppSocket,
  to: string,
  text: string
): Promise<void> {
  const logRecipient = DEFAULT_LOG_RECIPIENT
  if (!logRecipient || logRecipient === to) return

  const summary = [LOG_HEADER, `Destino: ${mask(to)}`, `Conteúdo: ${text}`].join('\n')

  try {
    await sendText(sock, logRecipient, summary)
  } catch (error) {
    log.err(SEND_MESSAGES.logSendFailure, (error as Error)?.message ?? error)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

void main()




