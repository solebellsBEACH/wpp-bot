import { maskJid } from "./shared/utils/jid.js"

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
} as const

const now = () => new Date().toLocaleTimeString('pt-BR', { hour12: false })

export const log = {
  ok: (...args: unknown[]) =>
    console.log(`${COLORS.green}[${now()}] ✅${COLORS.reset}`, ...args),
  info: (...args: unknown[]) =>
    console.log(`${COLORS.cyan}[${now()}] ℹ️ ${COLORS.reset}`, ...args),
  warn: (...args: unknown[]) =>
    console.log(`${COLORS.yellow}[${now()}] ⚠️ ${COLORS.reset}`, ...args),
  err: (...args: unknown[]) =>
    console.log(`${COLORS.red}[${now()}] ❌${COLORS.reset}`, ...args),
  msgIn: (from: string, name: string | undefined, text: string) =>
    console.log(
      `${COLORS.magenta}[${now()}] 📩 IN${COLORS.reset} ${maskJid(from)} ${
        name ? `(${name}) ` : ''
      }- ${text}`
    ),
  msgOut: (to: string, text: string) =>
    console.log(
      `${COLORS.green}[${now()}] 📤 OUT${COLORS.reset} ${maskJid(
        to
      )} - Mensagem enviada: ${text}`
    )
}
