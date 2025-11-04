import { SEND_MESSAGES } from "../shared/constants/messages.js"
import { DEFAULT_RECIPIENT } from "../shared/constants/settings.js"

export function formatKilometers(km?: string): string {
  if (!km) return ''
  const numeric = Number.parseInt(km, 10)
  if (Number.isNaN(numeric)) {
    return `${km} km`
  }
  return `${numeric.toLocaleString('pt-BR')} km`
}

export function normalizeRecipient(input?: string): string {
  if (!input) return DEFAULT_RECIPIENT
  if (input.includes('@')) return input
  const digits = input.replace(/\D/g, '')
  if (!digits) {
    throw new Error(SEND_MESSAGES.invalidRecipient)
  }
  return `${digits}@s.whatsapp.net`
}

export function mask(jid = ''): string {
  const [raw, domain] = jid.split('@')
  if (!raw || !domain) return jid
  if (!/^\d+$/.test(raw) || raw.length < 7) return jid
  return `${raw.slice(0, 3)}****${raw.slice(-2)}@${domain}`
}

