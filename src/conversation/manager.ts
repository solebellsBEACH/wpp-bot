import { CONVERSATION_ERROR_MESSAGES } from '../shared/constants/messages.js'
import { normalizeJid } from '../shared/utils/jid.js'
import { DEFAULT_CONFIG } from './config.js'
import {
  buildMaintenanceConfirmation,
  buildMenuMessage,
  buildUrgentMessage,
  promptForState
} from './messages.js'
import type {
  ConversationConfig,
  ConversationManagerOptions,
  ConversationMessageMeta,
  ConversationState,
  ConversationTicket
} from './types.js'
import {
  extractDigits,
  extractPlateCandidate,
  isNegativeResponse,
  isPositiveResponse,
  matchesInitialTrigger,
  shouldResetConversation
} from './validators.js'

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
  }

  resetConversation(jid: string): void {
    const key = normalizeJid(jid)
    if (!key) return
    const existing = this.conversations.get(key)
    const preservedName = existing?.data.name
    this.conversations.set(key, {
      step: 'awaitingPlate',
      data: preservedName ? { name: preservedName } : {}
    })
  }

  clearAll(): void {
    this.conversations.clear()
  }

  async handleMessage(
    jid: string,
    rawText: string,
    meta: ConversationMessageMeta = {}
  ): Promise<boolean> {
    const text = rawText.trim()
    const key = normalizeJid(jid)
    if (!key) return false

    let state = this.conversations.get(key)

    if (!state) {
      if (!matchesInitialTrigger(text, this.config.initialMessage)) {
        return false
      }
      state = { step: 'awaitingPlate', data: { name: meta.name } }
      this.conversations.set(key, state)
      await this.safeSendText(jid, this.buildInitialPrompt())
      return true
    }

    if (meta.name && !state.data.name) {
      state = this.updateState(key, {
        ...state,
        data: { ...state.data, name: meta.name }
      })
    }

    if (!text) {
      await this.repeatCurrentPrompt(jid, state)
      return true
    }

    if (shouldResetConversation(text)) {
      this.resetConversation(jid)
      await this.safeSendText(jid, this.buildInitialPrompt())
      return true
    }

    switch (state.step) {
      case 'awaitingPlate':
        return await this.handlePlate(jid, key, state, text)
      case 'awaitingKm':
        return await this.handleKilometers(jid, key, state, text)
      case 'awaitingSelection':
        return await this.handleSelection(jid, key, state, text)
      case 'awaitingContinue':
        return await this.handleContinue(jid, key, state, text)
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

    if (!state.data.plate) {
      this.updateState(key, { step: 'awaitingPlate', data: state.data })
      await this.safeSendText(jid, this.config.askPlate)
      return true
    }

    if (!state.data.km) {
      this.updateState(key, { step: 'awaitingKm', data: state.data })
      await this.safeSendText(jid, this.config.askKm)
      return true
    }

    if (normalized === '1' || normalized.startsWith('1')) {
      await this.safeSendText(jid, buildUrgentMessage(this.config))
      this.updateState(key, { step: 'awaitingContinue', data: state.data })
      await this.safeSendText(jid, this.config.fallbackMessage)
      await this.emitTicket({ jid, ...state.data, type: 'urgent' })
      return true
    }

    if (normalized === '2' || normalized.startsWith('2')) {
      await this.safeSendText(jid, buildMaintenanceConfirmation(this.config, state.data))
      this.updateState(key, { step: 'awaitingContinue', data: state.data })
      await this.safeSendText(jid, this.config.fallbackMessage)
      await this.emitTicket({ jid, ...state.data, type: 'maintenance' })
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
    const normalizedPlate = extractPlateCandidate(text)
    if (!normalizedPlate) {
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
    const digits = extractDigits(text)
    if (!digits) {
      await this.safeSendText(jid, this.config.invalidKm)
      return true
    }

    const data = { ...state.data, plate: state.data.plate, km: digits }
    this.updateState(key, { step: 'awaitingSelection', data })
    await this.safeSendText(jid, buildMenuMessage(this.config))
    return true
  }

  private async handleContinue(
    jid: string,
    key: string,
    state: ConversationState,
    text: string
  ): Promise<boolean> {
    const normalized = text.trim().toLowerCase()

    if (isPositiveResponse(normalized)) {
      this.updateState(key, {
        step: 'awaitingPlate',
        data: state.data.name ? { name: state.data.name } : {}
      })
      await this.safeSendText(jid, this.buildInitialPrompt())
      return true
    }

    if (isNegativeResponse(normalized)) {
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

  private async emitTicket(ticket: ConversationTicket): Promise<void> {
    await this.options.onTicketCreated?.(ticket)
  }

  private buildInitialPrompt(): string {
    return [this.config.greeting, this.config.askPlate].join('\n')
  }

  private async repeatCurrentPrompt(jid: string, state: ConversationState): Promise<void> {
    const prompt = promptForState(this.config, state)
    if (prompt) {
      await this.safeSendText(jid, prompt)
      return
    }
    await this.safeSendText(jid, this.config.fallbackMessage)
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

export type {
  ConversationConfig,
  ConversationData,
  ConversationManagerOptions,
  ConversationMessageMeta,
  ConversationState,
  ConversationTicket
} from './types.js'
