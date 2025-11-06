import { describe, expect, it } from 'vitest'
import { maskJid } from '../src/shared/utils/jid.js'
import { DEFAULT_PRIMARY_JID } from '../src/shared/constants/settings.js'

describe('maskJid', () => {
  it('masks numeric JIDs with default length', () => {
    const [number] = DEFAULT_PRIMARY_JID.split('@')
    const expected = `${number.slice(0, 3)}****${number.slice(-2)}@s.whatsapp.net`
    expect(maskJid(DEFAULT_PRIMARY_JID)).toBe(expected)
  })

  it('returns original JID when local part is too short', () => {
    expect(maskJid('12345@s.whatsapp.net')).toBe('12345@s.whatsapp.net')
  })

  it('returns original value for non-numeric local part', () => {
    expect(maskJid('user@s.whatsapp.net')).toBe('user@s.whatsapp.net')
  })

  it('returns input when JID is falsy or malformed', () => {
    expect(maskJid()).toBe('')
    expect(maskJid('invalid')).toBe('invalid')
  })
})
