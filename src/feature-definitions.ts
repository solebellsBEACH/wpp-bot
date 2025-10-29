import type { FeatureDefinition } from './features.js'
import { featureRegistry } from './features.js'

const hello: FeatureDefinition = {
  key: 'hello',
  description: 'Responde com uma saudação padrão',
  handler: async ({ reply, name }) => {
    const greeting = name ? `👋 Olá, ${name.split(' ')[0]}!` : '👋 Olá!'
    await reply(`${greeting} Eu sou um bot pronto para ajudar.`)
  }
}

const menu: FeatureDefinition = {
  key: 'menu',
  description: 'Exibe o menu com as funcionalidades disponíveis',
  handler: async ({ reply }) => {
    const features = featureRegistry
      .list()
      .filter((feature) => !['help', 'menu'].includes(feature.key))

    if (features.length === 0) {
      await reply('Ainda não há outras funcionalidades disponíveis.')
      return
    }

    const lines = features.map(
      (feature) => `• ${feature.key} — ${feature.description}`
    )

    await reply(['Aqui está o que posso fazer:', ...lines].join('\n'))
  }
}

const features: FeatureDefinition[] = [hello, menu]

export default features

