import type { WASocket } from '@whiskeysockets/baileys'

import { log, maskJid } from '../logger.js'
import { BOT_LOG_MESSAGES, GROUP_START_MESSAGES } from '../shared/constants/messages.js'
import { DEFAULT_GROUP_NAME, DEFAULT_LOG_GROUP_NAME } from '../shared/constants/settings.js'
import type { SendTextOptions } from './message-service.js'

export interface GroupState {
  allowedGroupName: string
  allowedGroupJid?: string
  logGroupJid?: string
  groupNameCache: Map<string, string>
}

type SendTextFn = (jid: string, text: string, options?: SendTextOptions) => Promise<void>

export const createInitialGroupState = (): GroupState => ({
  allowedGroupName: DEFAULT_GROUP_NAME.toLowerCase(),
  allowedGroupJid: undefined,
  logGroupJid: undefined,
  groupNameCache: new Map()
})

interface GroupMetadataLite {
  id: string
  subject?: string
}

export async function ensureManagedGroups({
  state,
  sock,
  sendText
}: {
  state: GroupState
  sock: WASocket
  sendText: SendTextFn
}): Promise<void> {
  const createdGroups: Array<{ jid: string; message: string }> = []
  const desiredGroups: Array<{
    name: string
    onResolved: (metadata: GroupMetadataLite, requestedName: string) => void
    getWelcomeMessage?: () => string
  }> = [
    {
      name: DEFAULT_GROUP_NAME,
      onResolved: (metadata, requestedName) => {
        const subject = (metadata.subject ?? requestedName).trim() || requestedName
        state.allowedGroupName = subject.toLowerCase()
        state.allowedGroupJid = metadata.id
        state.groupNameCache.set(metadata.id, subject)
      },
      getWelcomeMessage: () => GROUP_START_MESSAGES.primary
    },
    {
      name: DEFAULT_LOG_GROUP_NAME,
      onResolved: (metadata, requestedName) => {
        const subject = (metadata.subject ?? requestedName).trim() || requestedName
        state.logGroupJid = metadata.id
        state.groupNameCache.set(metadata.id, subject)
      },
      getWelcomeMessage: () => GROUP_START_MESSAGES.log
    }
  ]

  let allGroups: Record<string, GroupMetadataLite> | undefined
  try {
    allGroups = await sock.groupFetchAllParticipating?.()
  } catch (err) {
    log.warn('Não foi possível listar os grupos atuais:', (err as Error)?.message ?? err)
  }

  const findExistingByName = (name: string): GroupMetadataLite | undefined => {
    const normalized = name.trim().toLowerCase()
    const groups = allGroups ? Object.values(allGroups) : []
    return groups.find((group) => (group.subject ?? '').trim().toLowerCase() === normalized)
  }

  for (const { name, onResolved, getWelcomeMessage } of desiredGroups) {
    const existing = findExistingByName(name)
    if (existing) {
      onResolved(existing, name)
      continue
    }

    try {
      const created = await sock.groupCreate(name, [])
      onResolved(created, name)
      log.info(`Grupo "${name}" criado com sucesso: ${maskJid(created.id)}`)
      const message = getWelcomeMessage?.()
      if (message) {
        createdGroups.push({ jid: created.id, message })
      }
    } catch (err) {
      log.err(`Falha ao criar o grupo "${name}":`, (err as Error)?.message ?? err)
    }
  }

  for (const { jid, message } of createdGroups) {
    try {
      await sendText(jid, message, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.groupWelcomeFailure, (err as Error)?.message ?? err)
    }
  }
}

export async function getGroupName(
  state: GroupState,
  sock: WASocket | undefined,
  jid: string
): Promise<string | undefined> {
  const cached = state.groupNameCache.get(jid)
  if (cached) return cached
  if (!sock) return undefined

  try {
    const metadata = await sock.groupMetadata(jid)
    const name = metadata?.subject
    if (name) {
      state.groupNameCache.set(jid, name)
    }
    return name
  } catch (err) {
    log.warn(`Não foi possível obter o nome do grupo ${maskJid(jid)}:`, (err as Error)?.message ?? err)
    return undefined
  }
}

export async function isAllowedChat(
  state: GroupState,
  sock: WASocket | undefined,
  jid: string
): Promise<boolean> {
  if (!jid.endsWith('@g.us')) {
    return false
  }

  if (state.allowedGroupJid) {
    return jid === state.allowedGroupJid
  }

  const groupName = await getGroupName(state, sock, jid)
  return groupName?.trim().toLowerCase() === state.allowedGroupName
}
