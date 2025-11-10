import type { WASocket } from '@whiskeysockets/baileys'

import { log } from '../logger.js'
import { BOT_LOG_MESSAGES, GROUP_START_MESSAGES } from '../shared/constants/messages.js'
import { DEFAULT_GROUP_NAME, DEFAULT_LOG_GROUP_NAME, DEFAULT_SERVICE_LOG_GROUP_NAME } from '../shared/constants/settings.js'
import type { SendTextOptions } from './message-service.js'
import { maskJid } from '../shared/utils/jid.js'

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
interface IDesiredGroups{
    name: string
    onResolved: (metadata: GroupMetadataLite, requestedName: string) => void
    getWelcomeMessage?: () => string
}

interface ICreateGroup{ 
  jid: string; 
  message: string 
}

const findExistingByName = (name: string, allGroups:Record<string, GroupMetadataLite> | undefined): GroupMetadataLite | undefined => {
    const normalized = name.trim().toLowerCase()
    const groups = allGroups ? Object.values(allGroups) : []
    return groups.find((group) => (group.subject ?? '').trim().toLowerCase() === normalized)
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
  const createdGroups: Array<ICreateGroup> = []
  const desiredGroups: Array<IDesiredGroups> = [
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
    },
    {
      name: DEFAULT_SERVICE_LOG_GROUP_NAME,
      onResolved: (metadata, requestedName) => {
        const subject = (metadata.subject ?? requestedName).trim() || requestedName
        state.logGroupJid = metadata.id
        state.groupNameCache.set(metadata.id, subject)
      },
      getWelcomeMessage: () => GROUP_START_MESSAGES.serviceLog
    }
  ]
  

  let allGroups: Record<string, GroupMetadataLite> | undefined
  try {
    allGroups = await sock.groupFetchAllParticipating?.()
  } catch (err) {
    log.warn('Não foi possível listar os grupos atuais:', (err as Error)?.message ?? err)
  }

  await callbackGroup(desiredGroups,createdGroups, allGroups, sock)  

  for (const { jid, message } of createdGroups) {
    try {
      await sendText(jid, message, { forwardToLog: false })
    } catch (err) {
      log.err(BOT_LOG_MESSAGES.groupWelcomeFailure, (err as Error)?.message ?? err)
    }
  }
}

async function callbackGroup(
  desiredGroups:IDesiredGroups[],
   createdGroups:ICreateGroup[],
   allGroups:Record<string, GroupMetadataLite> | undefined,
   sock: WASocket
  ){
  for (const { name, onResolved, getWelcomeMessage } of desiredGroups) {
    const existing = findExistingByName(name, allGroups)
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


// {
//   metadata: {
//     id: '120363402561803773@g.us',
//     notify: undefined,
//     addressingMode: 'lid',
//     subject: 'Confia Veiculos - Logs',
//     subjectOwner: '191422531682502@lid',
//     subjectOwnerPn: '5527995260672@s.whatsapp.net',
//     subjectTime: 1762364580,
//     size: 1,
//     creation: 1762364580,
//     owner: '191422531682502@lid',
//     ownerPn: '5527995260672@s.whatsapp.net',
//     owner_country_code: 'BR',
//     desc: undefined,
//     descId: undefined,
//     descOwner: undefined,
//     descOwnerPn: undefined,
//     descTime: NaN,
//     linkedParent: undefined,
//     restrict: false,
//     announce: false,
//     isCommunity: false,
//     isCommunityAnnounce: false,
//     joinApprovalMode: false,
//     memberAddMode: false,
//     participants: [ [Object] ],
//     ephemeralDuration: undefined
//   },
//   requestedName: 'Confia Veiculos - Logs'
// }
// {
//   metadata: {
//     id: '120363423485256020@g.us',
//     notify: undefined,
//     addressingMode: 'lid',
//     subject: 'Confia Veiculos - Atendimentos',
//     subjectOwner: '191422531682502@lid',
//     subjectOwnerPn: '5527995260672@s.whatsapp.net',
//     subjectTime: 1762367584,
//     size: 1,
//     creation: 1762367584,
//     owner: '191422531682502@lid',
//     ownerPn: '5527995260672@s.whatsapp.net',
//     owner_country_code: 'BR',
//     desc: undefined,
//     descId: undefined,
//     descOwner: undefined,
//     descOwnerPn: undefined,
//     descTime: NaN,
//     linkedParent: undefined,
//     restrict: false,
//     announce: false,
//     isCommunity: false,
//     isCommunityAnnounce: false,
//     joinApprovalMode: false,
//     memberAddMode: false,
//     participants: [ [Object] ],
//     ephemeralDuration: undefined
//   },
//   requestedName: 'Confia Veiculos - Atendimentos'
// }