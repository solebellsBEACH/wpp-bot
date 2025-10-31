import { normalizeJid } from '../utils/jid.js'
import { formatKilometers } from '../utils/format.js'
import { CONVERSATION_ERROR_MESSAGES } from '../shared/contants/messages.js'

const PLATE_REGEX = /^[A-Z0-9]{6,8}$/
const PLATE_CANDIDATE_REGEX = /[A-Z0-9]{6,8}/
const RESET_PATTERN = /^(reiniciar|reset|nova|novo|atualizar)$/i

export type ConversationStep =
  | 'awaitingSelection'
  | 'awaitingPlate'
  | 'awaitingKm'
  | 'awaitingContinue'

export interface ConversationData {
  plate?: string
  km?: string
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
}

const DEFAULT_CONFIG: ConversationConfig = {
  initialMessage: 'confiaVeiculos',
  greeting: '👋 Olá! Somos a Confia Veículos.',
  menuTitle: 'Como podemos ajudar hoje?',
  urgentOptionLabel: '1 - Atendimento urgente',
  maintenanceOptionLabel: '2 - Manutenção preventiva',
  selectionPrompt: 'Responda com 1 para urgência ou 2 para manutenção.',
  invalidSelection:
    'Não entendi sua escolha. Digite 1 para urgência ou 2 para manutenção preventiva.',
  urgentIntro: '🚨 Atendimento urgente acionado! Escolha um dos nossos canais imediatos:',
  urgentOutro: 'Nossa equipe está a postos para te ajudar. Também podemos continuar por aqui.',
  urgentPhones: ['(27) 4002-8922', '(27) 98888-1234'],
  askPlate: 'Por favor, informe a placa do veículo (ex: ABC1D23).',
  askKm: 'Agora, informe a quilometragem atual do veículo (apenas números).',
  invalidPlate:
    'Placa inválida. Use o formato ABC1D23 ou informe apenas letras e números, sem espaços.',
  invalidKm: 'Não consegui identificar a quilometragem. Envie apenas números, por exemplo: 45210.',
  maintenanceConfirmation:
    'Perfeito! Registramos o veículo {plate} com {km}. Em breve entraremos em contato para agendar sua manutenção preventiva.',
  fallbackMessage:
    'Deseja continuar o atendimento? Responda SIM para voltar ao menu ou NÃO para encerrar por agora.',
  continueInvalid: 'Não entendi. Responda SIM para continuar ou NÃO para encerrar.',
  continueGoodbye: 'Tudo bem! Quando quiser retomar, envie confiaVeiculos novamente.'
}

export class ConversationManager {
  private readonly conversations = new Map<string, ConversationState>()
  private readonly config: ConversationConfig

  constructor(private readonly options: ConversationManagerOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config }
  }

  async startConversation(jid: string, reset = true): Promise<void> {
    const key = normalizeJid(jid)
    if (!key) return

    const state = this.conversations.get(key)
    if (!reset && state) return

    this.conversations.set(key, { step: 'awaitingSelection', data: {} })
  }

  resetConversation(jid: string): void {
    const key = normalizeJid(jid)
    if (!key) return
    this.conversations.set(key, { step: 'awaitingSelection', data: {} })
  }

  clearAll(): void {
    this.conversations.clear()
  }

  async handleMessage(jid: string, rawText: string): Promise<boolean> {
    const text = rawText.trim()
    const key = normalizeJid(jid)
    if (!key) return false

    let state = this.conversations.get(key)

    if (!state) {
      if (!this.matchesInitialTrigger(text)) {
        return false
      }
      state = { step: 'awaitingSelection', data: {} }
      this.conversations.set(key, state)
      await this.safeSendText(jid, this.buildMenuMessage(true))
      return true
    }

    if (!text) {
      await this.repeatCurrentPrompt(jid, state)
      return true
    }

    if (RESET_PATTERN.test(text)) {
      this.resetConversation(jid)
      await this.safeSendText(jid, this.buildMenuMessage(true))
      return true
    }

    switch (state.step) {
      case 'awaitingSelection':
        return await this.handleSelection(jid, key, state, text)
      case 'awaitingPlate':
        return await this.handlePlate(jid, key, state, text)
      case 'awaitingKm':
        return await this.handleKilometers(jid, key, state, text)
      case 'awaitingContinue':
        return await this.handleContinue(jid, key, text)
      default:
        return false
    }
  }

  private async handleSelection(
    jid: string,
    key: string,
    state: ConversationState,
    text: string
  ): Promise<boolean> {
    const normalized = text.toLowerCase()

    if (normalized === '1' || normalized.startsWith('1')) {
      await this.safeSendText(jid, this.buildUrgentMessage())
      this.updateState(key, { step: 'awaitingContinue', data: {} })
      await this.safeSendText(jid, this.config.fallbackMessage)
      return true
    }

    if (normalized === '2' || normalized.startsWith('2')) {
      this.updateState(key, { step: 'awaitingPlate', data: {} })
      await this.safeSendText(jid, this.config.askPlate)
      return true
    }

    await this.safeSendText(jid, this.config.invalidSelection)
    await this.safeSendText(jid, this.config.selectionPrompt)
    return true
  }

  private async handlePlate(
    jid: string,
    key: string,
    state: ConversationState,
    text: string
  ): Promise<boolean> {
    const normalizedPlate = this.extractPlateCandidate(text)
    if (!normalizedPlate || !PLATE_REGEX.test(normalizedPlate)) {
      await this.safeSendText(jid, this.config.invalidPlate)
      return true
    }

    state = this.updateState(key, {
      step: 'awaitingKm',
      data: { ...state.data, plate: normalizedPlate }
    })
    await this.safeSendText(jid, this.config.askKm)
    return true
  }

  private async handleKilometers(
    jid: string,
    key: string,
    state: ConversationState,
    text: string
  ): Promise<boolean> {
    const digits = text.replace(/\D/g, '')
    if (!digits) {
      await this.safeSendText(jid, this.config.invalidKm)
      return true
    }

    const data = { plate: state.data.plate, km: digits }
    this.updateState(key, { step: 'awaitingContinue', data })

    await this.safeSendText(jid, this.buildMaintenanceConfirmation(data))
    await this.safeSendText(jid, this.config.fallbackMessage)

    return true
  }

  private async handleContinue(jid: string, key: string, text: string): Promise<boolean> {
    const normalized = text.trim().toLowerCase()

    if (/^(sim|s|yes|y)/.test(normalized)) {
      this.updateState(key, { step: 'awaitingSelection', data: {} })
      await this.safeSendText(jid, this.buildMenuMessage())
      return true
    }

    if (/^(não|nao|n|no)/.test(normalized)) {
      await this.safeSendText(jid, this.config.continueGoodbye)
      this.conversations.delete(key)
      return true
    }

    await this.safeSendText(jid, this.config.continueInvalid)
    await this.safeSendText(jid, this.config.fallbackMessage)
    return true
  }

  private updateState(key: string, next: ConversationState): ConversationState {
    this.conversations.set(key, next)
    return next
  }

  private async repeatCurrentPrompt(jid: string, state: ConversationState): Promise<void> {
    if (state.step === 'awaitingSelection') {
      await this.safeSendText(jid, this.buildMenuMessage())
      return
    }

    if (state.step === 'awaitingPlate') {
      await this.safeSendText(jid, this.config.askPlate)
      return
    }

    if (state.step === 'awaitingKm') {
      await this.safeSendText(jid, this.config.askKm)
      return
    }

    await this.safeSendText(jid, this.config.fallbackMessage)
  }

  private buildMenuMessage(includeGreeting = false): string {
    const parts: string[] = []
    if (includeGreeting) {
      parts.push(this.config.greeting)
    }
    parts.push(
      this.config.menuTitle,
      this.config.urgentOptionLabel,
      this.config.maintenanceOptionLabel,
      this.config.selectionPrompt
    )
    return parts.join('\n')
  }

  private buildUrgentMessage(): string {
    const phones = this.config.urgentPhones.map((phone, index) => `${index + 1}. ${phone}`)
    return [this.config.urgentIntro, ...phones, this.config.urgentOutro].join('\n')
  }

  private buildMaintenanceConfirmation(data: ConversationData): string {
    const plate = data.plate ?? 'não informado'
    const kmLabel = data.km ? formatKilometers(data.km) : 'quilometragem não informada'
    return this.config.maintenanceConfirmation
      .replace('{plate}', plate)
      .replace('{km}', kmLabel)
  }

  private extractPlateCandidate(text: string): string | undefined {
    const sanitised = text.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (PLATE_REGEX.test(sanitised)) {
      return sanitised
    }
    const match = text.toUpperCase().match(PLATE_CANDIDATE_REGEX)
    return match?.[0]
  }

  private matchesInitialTrigger(text: string): boolean {
    return text.trim().toLowerCase() === this.config.initialMessage.toLowerCase()
  }

  private async safeSendText(
    jid: string,
    text: string,
    options?: { forwardToLog?: boolean }
  ): Promise<void> {
    try {
      await this.options.sendText(jid, text, options)
    } catch (err) {
      this.options.logger?.error?.(CONVERSATION_ERROR_MESSAGES.sendFailure, err)
    }
  }
}
