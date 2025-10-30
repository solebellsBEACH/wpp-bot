import { describe, expect, it } from 'vitest'
import { normalizeJid } from '../../src/utils/jid.js'

describe('normalizeJid', () => {
  it('returns empty string when input is missing', () => {
    expect(normalizeJid(undefined)).toBe('')
    expect(normalizeJid(null)).toBe('')
  })

  it('preserves JIDs without domain', () => {
    expect(normalizeJid('12345')).toBe('12345')
  })

  it('removes device suffix from JID', () => {
    expect(normalizeJid('12345:23@s.whatsapp.net')).toBe('12345@s.whatsapp.net')
  })

  it('normalizes lid domain to the default WhatsApp domain', () => {
    expect(normalizeJid('12345@lid')).toBe('12345@s.whatsapp.net')
  })
})
