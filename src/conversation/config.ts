import type { ConversationConfig } from './types.js'

export const DEFAULT_CONFIG: ConversationConfig = {
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
