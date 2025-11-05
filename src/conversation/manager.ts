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
  ConversationState
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
      if (!matchesInitialTrigger(text, this.config.initialMessage)) {
        return false
      }
      state = { step: 'awaitingSelection', data: {} }
      this.conversations.set(key, state)
      await this.safeSendText(jid, buildMenuMessage(this.config, true))
      return true
    }

    if (!text) {
      await this.repeatCurrentPrompt(jid, state)
      return true
    }

    if (shouldResetConversation(text)) {
      this.resetConversation(jid)
      await this.safeSendText(jid, buildMenuMessage(this.config, true))
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
      await this.safeSendText(jid, buildUrgentMessage(this.config))
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

    const data = { plate: state.data.plate, km: digits }
    this.updateState(key, { step: 'awaitingContinue', data })

    await this.safeSendText(jid, buildMaintenanceConfirmation(this.config, data))
    await this.safeSendText(jid, this.config.fallbackMessage)

    return true
  }

  private async handleContinue(jid: string, key: string, text: string): Promise<boolean> {
    const normalized = text.trim().toLowerCase()

    if (isPositiveResponse(normalized)) {
      this.updateState(key, { step: 'awaitingSelection', data: {} })
      await this.safeSendText(jid, buildMenuMessage(this.config))
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
  ConversationState
} from './types.js'
