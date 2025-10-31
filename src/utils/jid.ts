const LID_DOMAIN = 'lid'
const DEFAULT_DOMAIN = 's.whatsapp.net'

export function normalizeJid(jid: string | undefined | null): string {
  if (!jid) return ''

  const [userAndDevice, domain] = jid.split('@')
  if (!domain) {
    return userAndDevice
  }

  const [user] = userAndDevice.split(':')
  const normalizedDomain = domain === LID_DOMAIN ? DEFAULT_DOMAIN : domain

  return `${user}@${normalizedDomain}`
}

