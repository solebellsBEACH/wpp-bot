import { ConversationManager } from './conversation/manager.js'

type InputMessage = string | { text: string; jid?: string }

const DEBUG_JID = 'debug@s.whatsapp.net'

const conversationOutputs = new Map<string, string[]>()

const conversation = new ConversationManager({
  sendText: async (jid, text) => {
    const key = jid || DEBUG_JID
    if (!conversationOutputs.has(key)) {
      conversationOutputs.set(key, [])
    }
    conversationOutputs.get(key)?.push(text)
  },
  logger: {
    error: (message, err) => {
      console.error(`[ConversationError] ${message}`, err)
    }
  }
})

const normaliseInputs = (res: InputMessage | InputMessage[]): Array<{ jid: string; text: string }> => {
  const list = Array.isArray(res) ? res : [res]
  return list.map((item) => {
    if (typeof item === 'string') {
      return { jid: DEBUG_JID, text: item }
    }
    return { jid: item.jid ?? DEBUG_JID, text: item.text }
  })
}

export async function onReceberMensagem(res: InputMessage | InputMessage[]): Promise<string[]> {
  const messages = normaliseInputs(res)
  const jid = messages[0]?.jid ?? DEBUG_JID

  conversationOutputs.set(jid, [])

  for (const { jid: targetJid, text } of messages) {
    await conversation.handleMessage(targetJid, text)
  }

  const output = conversationOutputs.get(jid) ?? []
  conversationOutputs.delete(jid)
  return output
}
