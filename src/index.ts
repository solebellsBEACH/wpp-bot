import { Bot } from './bot.js'
import { FeatureLoader } from './feature-loader.js'
import { DEFAULT_PRIMARY_JID } from './shared/contants/settings.js'

const DEFAULT_LOG_JID =
  process.env.BOT_LOG_JID ??
  process.env.BOT_TEST_JID ??
  DEFAULT_PRIMARY_JID

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
