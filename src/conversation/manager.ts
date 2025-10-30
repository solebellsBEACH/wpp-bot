import { normalizeJid } from '../utils/jid.js'
import { formatKilometers } from '../utils/format.js'

const PLATE_REGEX = /^[A-Z0-9]{6,8}$/
const PLATE_CANDIDATE_REGEX = /[A-Z0-9]{6,8}/

export type ConversationStep = 'awaitingPlate' | 'awaitingKm' | 'awaitingOption'

export interface ConversationData {
  plate?: string
  km?: string
}

export interface ConversationState {
  step: ConversationStep
  data: ConversationData
}

export interface ConversationConfig {
  greeting: string
  askPlateReminder: string
  askKm: string
  invalidPlate: string
  invalidKm: string
  updatedPlate: string
  fallbackOption: string
  urgentContactMessage: string
  maintenanceUrl: string
  menuHeader: string
  menuUrgentOption: string
  menuMaintenanceOption: string
}

export interface ConversationManagerOptions {
  sendText: (jid: string, text: string, options?: { forwardToLog?: boolean }) => Promise<void>
  logger?: {
    error: (message: string, err: unknown) => void
  }
  config?: Partial<ConversationConfig>
}

const DEFAULT_CONFIG: ConversationConfig = {
  greeting: 'Olá! Somos a Confia Veículos. Para começarmos, informe a placa do veículo (ex: ABC1D23).',
  askPlateReminder:
    'Para continuarmos, precisamos da placa do veículo. Informe no formato ABC1D23 ou envie REINICIAR para começar novamente.',
  askKm: 'Perfeito! Agora informe a quilometragem atual do veículo (apenas números).',
  invalidPlate:
    'Não reconhecemos a placa informada. Use o formato ABC1D23 ou informe somente letras e números, sem espaços.',
  invalidKm: 'Não consegui identificar a quilometragem. Envie apenas números, por exemplo: 45210.',
  updatedPlate:
    'Placa atualizada com sucesso. Informe agora a quilometragem atual (somente números).',
  fallbackOption:
    'Responda com 1 para atendimento urgente ou 2 para manutenção preventiva. Se quiser reiniciar, envie REINICIAR.',
  urgentContactMessage:
    'Estamos encaminhando seu atendimento urgente. Caso prefira falar agora, ligue para (27) 4002-8922.',
  maintenanceUrl: 'https://confia-veiculos.example.com/agendamentos',
  menuHeader: 'Como podemos ajudar?',
  menuUrgentOption: '1 - Solicitar atendimento urgente',
  menuMaintenanceOption: '2 - Solicitar manutenção preventiva'
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

    this.conversations.set(key, { step: 'awaitingPlate', data: {} })
    await this.safeSendText(jid, this.config.greeting)
  }

  resetConversation(jid: string): void {
    const key = normalizeJid(jid)
    if (!key) return
    this.conversations.set(key, { step: 'awaitingPlate', data: {} })
  }

  async handleMessage(jid: string, rawText: string): Promise<boolean> {
    const text = rawText.trim()
    const key = normalizeJid(jid)
    if (!key) return false

    let state = this.conversations.get(key)

    if (!state) {
      state = { step: 'awaitingPlate', data: {} }
      this.conversations.set(key, state)
      await this.safeSendText(jid, this.config.greeting)
      if (!text) return true
    }

    if (!text) {
      await this.repeatCurrentPrompt(jid, state)
      return true
    }

    if (/^(reiniciar|reset|nova|novo|atualizar)$/i.test(text)) {
      this.resetConversation(jid)
      await this.safeSendText(jid, this.config.greeting)
      return true
    }

    const normalizedPlate = this.extractPlateCandidate(text)

    switch (state.step) {
      case 'awaitingPlate':
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

      case 'awaitingKm': {
        const digits = text.replace(/\D/g, '')
        if (!digits) {
          await this.safeSendText(jid, this.config.invalidKm)
          return true
        }
        state = this.updateState(key, {
          step: 'awaitingOption',
          data: { ...state.data, km: digits }
        })
        await this.safeSendText(jid, this.buildMenuMessage(state.data))
        return true
      }

      case 'awaitingOption':
        if (normalizedPlate && PLATE_REGEX.test(normalizedPlate)) {
          state = this.updateState(key, {
            step: 'awaitingKm',
            data: { plate: normalizedPlate }
          })
          await this.safeSendText(jid, this.config.updatedPlate)
          return true
        }

        if (text === '1' || text.toLowerCase().startsWith('1')) {
          await this.safeSendText(jid, this.buildUrgentMessage(state.data))
          await this.safeSendText(jid, this.buildMenuMessage(state.data))
          return true
        }

        if (text === '2' || text.toLowerCase().startsWith('2')) {
          await this.safeSendText(jid, this.buildMaintenanceMessage(state.data))
          await this.safeSendText(jid, this.buildMenuMessage(state.data))
          return true
        }

        await this.safeSendText(jid, this.config.fallbackOption)
        return true
    }
  }

  private updateState(key: string, next: ConversationState): ConversationState {
    this.conversations.set(key, next)
    return next
  }

  private extractPlateCandidate(text: string): string | undefined {
    const sanitised = text.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (PLATE_REGEX.test(sanitised)) {
      return sanitised
    }
    const match = text.toUpperCase().match(PLATE_CANDIDATE_REGEX)
    return match?.[0]
  }

  private async repeatCurrentPrompt(jid: string, state: ConversationState): Promise<void> {
    if (state.step === 'awaitingPlate') {
      await this.safeSendText(jid, this.config.askPlateReminder)
      return
    }

    if (state.step === 'awaitingKm') {
      await this.safeSendText(jid, this.config.askKm)
      return
    }

    await this.safeSendText(jid, this.buildMenuMessage(state.data))
  }

  private buildMenuMessage(data: ConversationData): string {
    const headerBase = data.plate
      ? `Ótimo! Registramos o veículo ${data.plate}${data.km ? ` (${formatKilometers(data.km)})` : ''}.`
      : 'Ótimo! Registramos as informações enviadas.'

    return [
      headerBase,
      this.config.menuHeader,
      this.config.menuUrgentOption,
      this.config.menuMaintenanceOption
    ].join('\n')
  }

  private buildUrgentMessage(data: ConversationData): string {
    const details = [`Veículo: ${data.plate ?? 'não informado'}`]
    if (data.km) details.push(`Quilometragem: ${formatKilometers(data.km)}`)
    return ['🚨 Atendimento urgente acionado!', ...details, this.config.urgentContactMessage].join(
      '\n'
    )
  }

  private buildMaintenanceMessage(data: ConversationData): string {
    const details = [`Veículo: ${data.plate ?? 'não informado'}`]
    if (data.km) details.push(`Quilometragem: ${formatKilometers(data.km)}`)
    return [
      '🛠️ Manutenção preventiva',
      ...details,
      `Agende o melhor horário em ${this.config.maintenanceUrl}`
    ].join('\n')
  }

  private async safeSendText(
    jid: string,
    text: string,
    options?: { forwardToLog?: boolean }
  ): Promise<void> {
    try {
      await this.options.sendText(jid, text, options)
    } catch (err) {
      this.options.logger?.error?.('Falha ao enviar mensagem de conversa', err)
    }
  }
}

