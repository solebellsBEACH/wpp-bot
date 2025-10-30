const LID_DOMAIN = 'lid'
const DEFAULT_DOMAIN = 's.whatsapp.net'

/**
 * Normaliza um JID removendo o sufixo de dispositivo (`:number`) e convertendo domínios
 * alternativos (ex.: `@lid`) para o domínio padrão do WhatsApp.
 */
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

