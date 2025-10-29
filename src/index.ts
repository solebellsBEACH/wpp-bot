import { Bot } from './bot.js'
import { FeatureLoader } from './feature-loader.js'

const DEFAULT_LOG_JID =
  process.env.BOT_LOG_JID ??
  process.env.BOT_TEST_JID ??
  '5527995260672@s.whatsapp.net'

const bot = new Bot({
  autoTestJid: process.env.BOT_TEST_JID ?? DEFAULT_LOG_JID,
  logRecipientJid: DEFAULT_LOG_JID
})

const featureLoader = FeatureLoader.fromRelative(
  bot,
  './feature-definitions.js',
  import.meta.url
)

async function bootstrap(): Promise<void> {
  await featureLoader.load()

  if (process.env.NODE_ENV !== 'production') {
    featureLoader.watch()
  }

  await bot.start()
}

void bootstrap().catch((err) => {
  console.error('Erro ao iniciar o bot:', err)
  process.exitCode = 1
})
