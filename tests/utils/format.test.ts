import { describe, expect, it } from 'vitest'
import { formatKilometers } from '../../src/shared/utils/format.js'

describe('formatKilometers', () => {
  it('returns empty string when input is falsy', () => {
    expect(formatKilometers()).toBe('')
    expect(formatKilometers('')).toBe('')
  })

  it('appends km when value is not a number', () => {
    expect(formatKilometers('abc')).toBe('abc km')
  })

  it('formats numeric strings using pt-BR locale', () => {
    expect(formatKilometers('12345')).toBe('12.345 km')
  })
})
