import makeWASocket, { fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'

const DEFAULT_SESSION_PATH = 'auth_info'
const DEFAULT_LOGGER_LEVEL = 'error'
const DEFAULT_SOCKET_OPTIONS = {
  syncFullHistory: false,
  emitOwnEvents: false,
  markOnlineOnConnect: false,
  defaultQueryTimeoutMs: 60_000
}

export async function createSocket({
  sessionPath = DEFAULT_SESSION_PATH,
  loggerLevel = DEFAULT_LOGGER_LEVEL,
  socketOptions = {}
} = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  const logger = pino({ level: loggerLevel })

  const sock = makeWASocket({
    ...DEFAULT_SOCKET_OPTIONS,
    ...socketOptions,
    auth: state,
    version,
    logger
  })

  sock.ev.on('creds.update', saveCreds)

  try {
    await sock.uploadPreKeysToServerIfRequired(true)
  } catch (err) {
    const message = err?.message || 'Falha ao garantir pre-keys no servidor'
    logger.warn({ err: message }, 'uploadPreKeysToServerIfRequired falhou')
  }

  return { sock }
}

export async function waitForConnectionOpen(sock, timeoutMs = 30_000) {
  if (!sock) throw new Error('WhatsApp socket instance is required')

  if (sock.ws?.readyState === 1) {
    return
  }

  try {
    await sock.waitForConnectionUpdate(
      async ({ connection }) => connection === 'open',
      timeoutMs
    )
  } catch (err) {
    const message = err?.message || 'Falha ao estabelecer conexão com o WhatsApp'
    const error = new Error(message)
    if (err) error.cause = err
    throw error
  }
}

export function closeSocket(sock) {
  try {
    sock?.end?.()
  } catch {
    sock?.ws?.close?.()
  }
}

export const sessionPath = DEFAULT_SESSION_PATH
