import qrcode from 'qrcode-terminal'
import { closeSocket, createSocket, waitForConnectionOpen } from './whatsapp.js'

const DEFAULT_RECIPIENT = '5527995260672@s.whatsapp.net'
const DEFAULT_MESSAGE = '👋 Teste manual!'

function normalizeRecipient(input) {
  if (!input) return DEFAULT_RECIPIENT
  if (input.includes('@')) return input
  const digits = input.replace(/\D/g, '')
  if (!digits) throw new Error('Informe um número ou JID válido.')
  return `${digits}@s.whatsapp.net`
}

function mask(jid = '') {
  const [raw, domain] = jid.split('@')
  if (!/^\d+$/.test(raw) || raw.length < 7 || !domain) return jid
  return `${raw.slice(0, 3)}****${raw.slice(-2)}@${domain}`
}

async function main() {
  const [, , rawRecipient, ...messageParts] = process.argv
  const to = normalizeRecipient(rawRecipient)
  const text = messageParts.length ? messageParts.join(' ') : DEFAULT_MESSAGE

  let sock
  let onConnectionUpdate

  try {
    ({ sock } = await createSocket())

    onConnectionUpdate = ({ qr, connection }) => {
      if (qr) {
        console.clear()
        console.log('Escaneie o QR abaixo para autorizar esta sessão:')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        console.log('Sessão conectada, enviando mensagem...')
      }
    }

    sock.ev.on('connection.update', onConnectionUpdate)

    await waitForConnectionOpen(sock, 60_000)

    await sock.assertSessions([to], true).catch(() => {})

    await sock.sendMessage(to, { text }, { forceNewSession: true })
    console.log(`Mensagem enviada para ${mask(to)}!`)
  } catch (err) {
    console.error('Falha ao enviar mensagem:', err?.message || err)
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

main()
