export const BOT_LOG_MESSAGES = {
  restartFailure: 'Falha ao reiniciar conexão:',
  autoTestFailure: 'Falha auto-teste:',
  notifyStartupFailure: 'Falha ao notificar início:',
  sendLogFailure: 'Falha ao enviar log de envio:',
  forwardLogFailure: 'Falha ao encaminhar log para destinatário padrão:',
  groupWelcomeFailure: 'Falha ao enviar mensagem inicial do grupo:',
  reconnectingSession: 'Recriando sessão com',
  failingReconnectSession: 'Falha ao recriar sessão com'
} as const

export const CONVERSATION_ERROR_MESSAGES = {
  sendFailure: 'Falha ao enviar mensagem de conversa'
} as const

export const FEATURE_LOADER_ERROR_MESSAGES = {
  reloadFailure: 'Falha ao recarregar funcionalidades:'
} as const

export const SEND_MESSAGES = {
  invalidRecipient: 'Informe um número ou JID válido.',
  scanQrPrompt: 'Escaneie o QR abaixo para autorizar esta sessão:',
  sessionOpen: 'Sessão conectada, enviando mensagem...',
  logSendFailure: 'Falha ao enviar log de saída:',
  sendFailure: 'Falha ao enviar mensagem:'
} as const

export const GROUP_START_MESSAGES = {
  primary:
    '👋 Olá! Este grupo foi criado automaticamente pelo bot Confia Veículos. Envie "confiaVeiculos" quando quiser iniciar o atendimento.',
  log: '🗒️ Grupo de logs criado automaticamente. Manteremos aqui o histórico das ações e notificações do bot.'
} as const
