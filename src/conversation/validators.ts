const PLATE_REGEX = /^[A-Z0-9]{6,8}$/
const PLATE_CANDIDATE_REGEX = /[A-Z0-9]{6,8}/
const RESET_PATTERN = /^(reiniciar|reset|nova|novo|atualizar)$/i
const CONTINUE_YES_PATTERN = /^(sim|s|yes|y)/i
const CONTINUE_NO_PATTERN = /^(não|nao|n|no)/i

const normalizeTriggerText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

export const normalizePlate = (text: string): string =>
  text.replace(/[^a-z0-9]/gi, '').toUpperCase()

// export const matchesInitialTrigger = (text: string, trigger: string): boolean =>
//   normalizeTriggerText(text) === normalizeTriggerText(trigger)
// Sem mensagem pra iniciar
export const matchesInitialTrigger = (text: string, trigger: string): boolean =>
  true

export const shouldResetConversation = (text: string): boolean => RESET_PATTERN.test(text)

export const extractPlateCandidate = (text: string): string | undefined => {
  const sanitised = normalizePlate(text)
  if (PLATE_REGEX.test(sanitised)) {
    return sanitised
  }
  const match = text.toUpperCase().match(PLATE_CANDIDATE_REGEX)
  return match?.[0]
}

export const extractDigits = (text: string): string => text.replace(/\D/g, '')
export const isPositiveResponse = (text: string): boolean => CONTINUE_YES_PATTERN.test(text.trim())
export const isNegativeResponse = (text: string): boolean => CONTINUE_NO_PATTERN.test(text.trim())
