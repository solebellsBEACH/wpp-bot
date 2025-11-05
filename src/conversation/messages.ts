import { formatKilometers } from '../utils/format.js'
import type { ConversationConfig, ConversationData, ConversationState } from './types.js'

export const buildMenuMessage = (
  config: ConversationConfig,
  includeGreeting = false
): string => {
  const parts: string[] = []
  if (includeGreeting) {
    parts.push(config.greeting)
  }
  parts.push(
    config.menuTitle,
    config.urgentOptionLabel,
    config.maintenanceOptionLabel,
    config.selectionPrompt
  )
  return parts.join('\n')
}

export const buildUrgentMessage = (config: ConversationConfig): string => {
  const phones = config.urgentPhones.map((phone, index) => `${index + 1}. ${phone}`)
  return [config.urgentIntro, ...phones, config.urgentOutro].join('\n')
}

export const buildMaintenanceConfirmation = (
  config: ConversationConfig,
  data: ConversationData
): string => {
  const plate = data.plate ?? 'não informado'
  const kmLabel = data.km ? formatKilometers(data.km) : 'quilometragem não informada'
  return config.maintenanceConfirmation.replace('{plate}', plate).replace('{km}', kmLabel)
}

export const promptForState = (
  config: ConversationConfig,
  state: ConversationState
): string | undefined => {
  switch (state.step) {
    case 'awaitingSelection':
      return buildMenuMessage(config)
    case 'awaitingPlate':
      return config.askPlate
    case 'awaitingKm':
      return config.askKm
    default:
      return config.fallbackMessage
  }
}
