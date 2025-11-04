import { Bot } from './bot.js'
import { FeatureLoader } from './feature-loader.js'
import { DEFAULT_PRIMARY_JID } from './shared/constants/settings.js'

const explicitLogJid = process.env.BOT_LOG_JID?.trim()
const defaultAutoTestJid =
  process.env.BOT_TEST_JID ??
  (explicitLogJid && explicitLogJid.length > 0 ? explicitLogJid : undefined) ??
  DEFAULT_PRIMARY_JID

const bot = new Bot({
  autoTestJid: defaultAutoTestJid,
  ...(explicitLogJid ? { logRecipientJid: explicitLogJid } : {})
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
