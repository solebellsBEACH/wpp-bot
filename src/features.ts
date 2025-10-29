import type { WASocket, proto } from '@whiskeysockets/baileys'

export interface MessageContext {
  sock: WASocket
  message: proto.IWebMessageInfo
  text: string
  from: string
  name?: string
  reply: (payload: string) => Promise<void>
}

export type FeatureHandler = (context: MessageContext) => Promise<void> | void

export interface FeatureDefinition {
  key: string
  description: string
  handler: FeatureHandler
}

export class FeatureRegistry {
  private readonly features = new Map<string, FeatureDefinition>()

  private normalize(key: string): string {
    return key.toLowerCase().trim()
  }

  set(definition: FeatureDefinition): void {
    const key = this.normalize(definition.key)
    if (!key) {
      throw new Error('Feature key cannot be empty')
    }
    this.features.set(key, { ...definition, key })
  }

  get(key: string): FeatureDefinition | undefined {
    if (!key) return undefined
    return this.features.get(this.normalize(key))
  }

  has(key: string): boolean {
    if (!key) return false
    return this.features.has(this.normalize(key))
  }

  delete(key: string): boolean {
    if (!key) return false
    return this.features.delete(this.normalize(key))
  }

  list(): FeatureDefinition[] {
    return Array.from(this.features.values())
  }
}

export const featureRegistry = new FeatureRegistry()
