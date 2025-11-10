import {
  type FeatureDefinition,
  type FeatureRegistry
} from '../features.js'

export function ensureDefaultFeatures(registry: FeatureRegistry): void {
  if (registry.has('help')) return

  const definition: FeatureDefinition = {
    key: 'help',
    description: 'Mostra os comandos disponíveis',
    handler: async ({ reply }) => {
      const others = registry
        .list()
        .filter((feature) => feature.key !== 'help')
      if (others.length === 0) {
        await reply('Ainda não há funcionalidades disponíveis.')
        return
      }

      const lines = others.map(
        (feature) => `• ${feature.key} — ${feature.description}`
      )
      await reply(['Funcionalidades disponíveis:', ...lines].join('\n'))
    }
  }

  registry.set(definition)
}
