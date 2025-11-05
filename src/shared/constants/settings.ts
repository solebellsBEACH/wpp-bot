const normalizeNumber = (value: string): string => value.replace(/\D/g, '')

const rawPrimaryNumber =
  process.env.BOT_PRIMARY_NUMBER ??
  process.env.BOT_TEST_JID?.split('@')[0] ??
  '5527995260672'

export const DEFAULT_PRIMARY_NUMBER = normalizeNumber(rawPrimaryNumber)
export const DEFAULT_PRIMARY_JID = `${DEFAULT_PRIMARY_NUMBER}@s.whatsapp.net`

export const DEFAULT_GROUP_NAME =
  (process.env.BOT_GROUP_NAME ?? 'ConfiaVeiculos - Bot').trim() ||
  'ConfiaVeiculos - Bot'

export const DEFAULT_LOG_GROUP_NAME =
  (process.env.BOT_LOG_GROUP_NAME ?? 'Confia Veiculos - Logs').trim() ||
  'Confia Veiculos - Logs'

export const DEFAULT_RECIPIENT = DEFAULT_PRIMARY_JID
export const DEFAULT_LOG_RECIPIENT =
  process.env.BOT_LOG_JID ?? process.env.BOT_TEST_JID ?? DEFAULT_RECIPIENT
export const DEFAULT_MESSAGE = '👋 Teste manual!'
