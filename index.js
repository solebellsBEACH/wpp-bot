// index.js (Node 18+)
import { DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { createSocket } from './whatsapp.js'

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}
const now = () => new Date().toLocaleTimeString('pt-BR', { hour12: false })
const mask = (jid = '') => {
  const n = jid.split('@')[0]
  if (!/^\d+$/.test(n) || n.length < 7) return jid
  return `${n.slice(0,3)}****${n.slice(-2)}@${jid.split('@')[1]}`
}
const log = {
  ok:   (...a) => console.log(`${C.green}[${now()}] ✅${C.reset}`, ...a),
  info: (...a) => console.log(`${C.cyan}[${now()}] ℹ️ ${C.reset}`, ...a),
  warn: (...a) => console.log(`${C.yellow}[${now()}] ⚠️ ${C.reset}`, ...a),
  err:  (...a) => console.log(`${C.red}[${now()}] ❌${C.reset}`, ...a),
  msgIn: (from, name, text) =>
    console.log(`${C.magenta}[${now()}] 📩 IN${C.reset} ${mask(from)} ${name ? `(${name}) ` : ''}- ${text}`),
  msgOut: (to, text) =>
    console.log(`${C.green}[${now()}] 📤 OUT${C.reset} ${mask(to)} - ${text}`)
}

let retries = 0
const backoff = () => Math.min(30_000, 2_000 * Math.pow(2, retries++)) // até 30s

async function start() {
  const { sock } = await createSocket()

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u

    if (qr) {
      console.clear()
      log.info('Escaneie o QR abaixo para parear esta sessão')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      log.ok('Bot conectado')
      const me = sock.user?.id || '5527995260672@s.whatsapp.net'
      try {
        await sock.assertSessions([me], true)
        await sock.sendMessage(me, { text: '✅ Bot online (auto-teste).' }, { forceNewSession: true })
        log.msgOut(me, '✅ Bot online (auto-teste).')
      } catch (e) {
        log.err('Falha auto-teste:', e?.message || e)
      }
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      const reason = lastDisconnect?.error?.message || 'desconhecido'
      log.warn(`Conexão fechada | status=${status} | reason=${reason}`)

      if (status === DisconnectReason.loggedOut || status === 515) {
        log.info('Reiniciando sessão')
      }

      setTimeout(start, backoff())
    }
  })

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const jid = update.key?.remoteJid
      const errorName = update.error?.name
      if (!jid || !errorName) continue

      if (errorName === 'SessionError' || errorName === 'PreKeyError') {
        log.warn(`Recriando sessão com ${mask(jid)} após ${errorName}`)
        try {
          await sock.assertSessions([jid], true)
        } catch (err) {
          log.err(`Falha ao recriar sessão com ${mask(jid)}:`, err?.message || err)
        }
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages?.[0]
    if (!m?.message) return

    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message?.ephemeralMessage?.message?.conversation ||
      ''

    if (m.key.fromMe) {
      if (text?.trim()) log.msgOut(m.key.remoteJid || 'desconhecido', text.trim())
      return
    }

    const from = m.key.remoteJid
    const name = m.pushName || ''

    if (text?.trim()) log.msgIn(from, name, text.trim())

    if (text?.trim().toLowerCase() === 'hello') {
      const reply = '👋 Hello, world!'
      try {
        await sock.sendMessage(from, { text: reply }, { forceNewSession: true })
        log.msgOut(from, reply)
      } catch (e) {
        log.err('Falha ao enviar resposta:', e?.message || e)
      }
    }
  })
}

start()
