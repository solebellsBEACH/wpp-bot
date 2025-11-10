export type ConversationStep =
  | 'awaitingPlate'
  | 'awaitingKm'
  | 'awaitingSelection'
  | 'awaitingContinue'

export interface ConversationData {
  plate?: string
  km?: string
  name?: string
}

export interface ConversationState {
  step: ConversationStep
  data: ConversationData
}

export interface ConversationConfig {
  initialMessage: string
  greeting: string
  menuTitle: string
  urgentOptionLabel: string
  maintenanceOptionLabel: string
  selectionPrompt: string
  invalidSelection: string
  urgentIntro: string
  urgentOutro: string
  urgentPhones: string[]
  askPlate: string
  askKm: string
  invalidPlate: string
  invalidKm: string
  maintenanceConfirmation: string
  fallbackMessage: string
  continueInvalid: string
  continueGoodbye: string
}

export interface ConversationManagerOptions {
  sendText: (jid: string, text: string, options?: { forwardToLog?: boolean }) => Promise<void>
  logger?: {
    error: (message: string, err: unknown) => void
  }
  config?: Partial<ConversationConfig>
  onTicketCreated?: (ticket: ConversationTicket) => Promise<void> | void
}

export interface ConversationMessageMeta {
  name?: string
}

export interface ConversationTicket {
  jid: string
  plate?: string
  km?: string
  name?: string
  type: 'urgent' | 'maintenance'
}
