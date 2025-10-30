import { describe, expect, it } from 'vitest'
import { maskJid } from '../src/logger.js'

describe('maskJid', () => {
  it('masks numeric JIDs with default length', () => {
    expect(maskJid('5527995260672@s.whatsapp.net')).toBe('552****72@s.whatsapp.net')
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
