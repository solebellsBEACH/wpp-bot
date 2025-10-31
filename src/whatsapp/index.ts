import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type SocketConfig,
  type WASocket
} from '@whiskeysockets/baileys'
import pino, { type Logger as PinoLogger, type LoggerOptions as PinoLoggerOptions } from 'pino'

const DEFAULT_SESSION_PATH = 'auth_info'
const DEFAULT_LOGGER_LEVEL: pino.LevelWithSilent = 'error'
const DEFAULT_SOCKET_OPTIONS: Partial<SocketConfig> = {
  syncFullHistory: false,
  emitOwnEvents: false,
  markOnlineOnConnect: false,
  defaultQueryTimeoutMs: 60_000
}



export interface CreateSocketOptions {
  sessionPath?: string
  loggerLevel?: pino.LevelWithSilent
  socketOptions?: Partial<SocketConfig>
}

export async function createSocket({
  sessionPath = DEFAULT_SESSION_PATH,
  loggerLevel = DEFAULT_LOGGER_LEVEL,
  socketOptions = {}
}: CreateSocketOptions = {}): Promise<{ sock: WASocket }> {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  const createLogger = pino as unknown as (options?: PinoLoggerOptions) => PinoLogger
  const logger = createLogger({ level: loggerLevel })

  const sock = makeWASocket({
    ...DEFAULT_SOCKET_OPTIONS,
    ...socketOptions,
    auth: state,
    version,
    logger
  })

  sock.ev.on('creds.update', saveCreds)

  try {
    await sock.uploadPreKeysToServerIfRequired?.()
  } catch (err) {
    const message = (err as Error)?.message ?? 'Falha ao garantir pre-keys no servidor'
    logger.warn({ err: message }, 'uploadPreKeysToServerIfRequired falhou')
  }

  return { sock }
}

export async function waitForConnectionOpen(
  sock: WASocket,
  timeoutMs = 30_000
): Promise<void> {
  if (!sock) throw new Error('WhatsApp socket instance is required')

  const readyState = (sock.ws as { readyState?: number } | undefined)?.readyState
  if (readyState === 1) {
    return
  }

  try {
    const waitForConnection = sock.waitForConnectionUpdate as unknown as (
      check: (update: { connection?: string }) => boolean,
      timeout?: number
    ) => Promise<void>

    await waitForConnection(({ connection }) => connection === 'open', timeoutMs)
  } catch (err) {
    const message =
      (err as Error)?.message ?? 'Falha ao estabelecer conexão com o WhatsApp'
    const error = new Error(message)
    if (err instanceof Error) {
      ;(error as Error & { cause?: Error }).cause = err
    }
    throw error
  }
}

export function closeSocket(sock: WASocket | undefined | null): void {
  try {
    ;(sock as unknown as { end?: () => void })?.end?.()
  } catch {
    ;(sock?.ws as { close?: () => void } | undefined)?.close?.()
  }
}

export const sessionPath = DEFAULT_SESSION_PATH
