import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FeatureDefinition } from './features.js'
import type { Bot } from './bot.js'
import { FEATURE_LOADER_ERROR_MESSAGES } from './shared/contants/messages.js'

interface FeatureModule {
  default?: FeatureDefinition[] | (() => FeatureDefinition[] | Promise<FeatureDefinition[]>)
  features?: FeatureDefinition[]
  loadFeatures?: () => FeatureDefinition[] | Promise<FeatureDefinition[]>
}

const isFunction = <T extends (...args: never[]) => unknown>(
  value: unknown
): value is T => typeof value === 'function'

export class FeatureLoader {
  private readonly loadedKeys = new Set<string>()
  private watchHandle?: fs.FSWatcher
  private reloadTimer?: NodeJS.Timeout

  constructor(private readonly bot: Bot, private readonly moduleUrl: URL) {}

  static fromRelative(bot: Bot, modulePath: string, baseUrl: string): FeatureLoader {
    const url = new URL(modulePath, baseUrl)
    return new FeatureLoader(bot, url)
  }

  async load(): Promise<void> {
    const result = await this.importModule()
    const definitions = await this.extractDefinitions(result)
    this.applyDefinitions(definitions)
  }

  watch(): void {
    if (this.watchHandle) return

    const filePath = this.filePath()

    try {
      this.watchHandle = fs.watch(filePath, { persistent: process.env.NODE_ENV !== 'production' }, () => {
        this.scheduleReload()
      })
    } catch (err) {
      console.warn(
        `Não foi possível observar alterações em ${filePath}:`,
        (err as Error)?.message ?? err
      )
    }
  }

  dispose(): void {
    this.watchHandle?.close()
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = undefined
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined
      void this.load().catch((err) => {
        console.error(FEATURE_LOADER_ERROR_MESSAGES.reloadFailure, err)
      })
    }, 200)
  }

  private async importModule(): Promise<FeatureModule> {
    const cacheBuster = `?update=${Date.now()}`
    const href = `${this.moduleUrl.href}${cacheBuster}`
    const imported = await import(href)
    return imported as FeatureModule
  }

  private async extractDefinitions(module: FeatureModule): Promise<FeatureDefinition[]> {
    if (Array.isArray(module.features)) return module.features
    if (isFunction(module.loadFeatures)) {
      return await module.loadFeatures()
    }
    if (Array.isArray(module.default)) return module.default
    if (isFunction(module.default)) {
      return await module.default()
    }
    throw new Error(
      `O módulo ${this.moduleUrl.pathname} não exporta funcionalidades válidas.`
    )
  }

  private applyDefinitions(definitions: FeatureDefinition[]): void {
    const normalized = new Map<string, FeatureDefinition>()
    for (const definition of definitions) {
      const key = definition.key.toLowerCase().trim()
      if (!key) {
        throw new Error('Feature key não pode ser vazia.')
      }
      normalized.set(key, { ...definition, key })
    }

    for (const key of this.loadedKeys) {
      if (!normalized.has(key)) {
        this.bot.removeFeature(key)
      }
    }

    this.loadedKeys.clear()

    for (const definition of normalized.values()) {
      this.bot.setFeature(definition)
      this.loadedKeys.add(definition.key)
    }
  }

  private filePath(): string {
    if (this.moduleUrl.protocol !== 'file:') {
      throw new Error('Somente caminhos locais podem ser observados.')
    }
    const resolved = fileURLToPath(this.moduleUrl)
    if (fs.existsSync(resolved)) {
      return resolved
    }

    const tsCandidate = resolved.replace(/\.js$/i, '.ts')
    if (fs.existsSync(tsCandidate)) {
      return tsCandidate
    }

    return resolved
  }
}
