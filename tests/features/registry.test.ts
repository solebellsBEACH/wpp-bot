import { describe, expect, it } from 'vitest'
import { FeatureRegistry, type FeatureDefinition } from '../../src/features.js'

const buildFeature = (overrides: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
  key: 'sample',
  description: 'desc',
  handler: () => undefined,
  ...overrides
})

describe('FeatureRegistry', () => {
  it('normalizes keys to lowercase and trimmed', () => {
    const registry = new FeatureRegistry()
    const feature = buildFeature({ key: ' Sample ' })
    registry.set(feature)
    expect(registry.get('sample')?.key).toBe('sample')
    expect(registry.get(' SAMPLE ')?.key).toBe('sample')
  })

  it('replaces features with the same normalized key', () => {
    const registry = new FeatureRegistry()
    registry.set(buildFeature({ key: 'one', description: 'first' }))
    registry.set(buildFeature({ key: 'One', description: 'second' }))
    expect(registry.list()).toHaveLength(1)
    expect(registry.get('one')?.description).toBe('second')
  })

  it('deletes features by normalized key', () => {
    const registry = new FeatureRegistry()
    registry.set(buildFeature({ key: 'one' }))
    expect(registry.delete(' ONE ')).toBe(true)
    expect(registry.list()).toHaveLength(0)
  })

  it('lists registered features', () => {
    const registry = new FeatureRegistry()
    registry.set(buildFeature({ key: 'first' }))
    registry.set(buildFeature({ key: 'second' }))
    const keys = registry.list().map((feature) => feature.key).sort()
    expect(keys).toEqual(['first', 'second'])
  })

  it('throws when registering an empty key', () => {
    const registry = new FeatureRegistry()
    expect(() => registry.set(buildFeature({ key: '   ' }))).toThrowError(
      'Feature key cannot be empty'
    )
  })
})
