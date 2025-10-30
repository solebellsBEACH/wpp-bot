import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureLoader } from '../src/feature-loader.js'
import type { FeatureDefinition } from '../src/features.js'

const createBot = () => ({
  setFeature: vi.fn(),
  removeFeature: vi.fn()
})

const buildDefinition = (overrides: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
  key: 'example',
  description: 'desc',
  handler: () => undefined,
  ...overrides
})

describe('FeatureLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads feature definitions from module exports', async () => {
    const bot = createBot()
    const loader = new FeatureLoader(bot as any, new URL('file:///features.js'))
    const feature = buildDefinition({ key: ' Test ' })
    vi.spyOn(loader as any, 'importModule').mockResolvedValue({ features: [feature] })

    await loader.load()

    expect(bot.setFeature).toHaveBeenCalledTimes(1)
    expect(bot.setFeature).toHaveBeenCalledWith({ ...feature, key: 'test' })
    expect(bot.removeFeature).not.toHaveBeenCalled()
  })

  it('removes features that are no longer exported', async () => {
    const bot = createBot()
    const loader = new FeatureLoader(bot as any, new URL('file:///features.js'))
    const importMock = vi.spyOn(loader as any, 'importModule')

    importMock.mockResolvedValueOnce({
      features: [buildDefinition({ key: 'first' }), buildDefinition({ key: 'second' })]
    })
    importMock.mockResolvedValueOnce({
      features: [buildDefinition({ key: 'second' }), buildDefinition({ key: 'third' })]
    })

    await loader.load()
    await loader.load()

    expect(bot.removeFeature).toHaveBeenCalledWith('first')
    expect(bot.setFeature).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'third' })
    )
  })

  it('watches file changes and debounces reload calls', async () => {
    const bot = createBot()
    const loader = FeatureLoader.fromRelative(
      bot as any,
      './feature-definitions.js',
      import.meta.url
    )
    const loadMock = vi.spyOn(loader, 'load').mockResolvedValue()
    const closeMock = vi.fn()
    let watchListener: (() => void) | undefined
    const watchMock = vi.spyOn(fs, 'watch').mockImplementation((_path, _options, listener) => {
      watchListener = listener
      return { close: closeMock } as unknown as fs.FSWatcher
    })
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    loader.watch()

    expect(watchMock).toHaveBeenCalledTimes(1)
    watchListener?.()
    watchListener?.()
    await vi.advanceTimersByTimeAsync(200)
    expect(loadMock).toHaveBeenCalledTimes(1)

    loader.dispose()
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
