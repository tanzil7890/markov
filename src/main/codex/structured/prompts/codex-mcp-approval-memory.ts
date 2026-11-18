import { createHash } from 'node:crypto'
import type { AgentChatPermissionChoice } from '../../../../shared/agent-launch/permissions/agent-chat-permission-mode'
import { readRecord, readString } from '../../app-server/codex-item-field-readers'

const MAX_REMEMBERED_QUESTIONS = 64
const MAX_REMEMBERING_CHATS = 256

// What each chat already allowed, for as long as the app runs; a restart asks again.
const allowedByChat = new Map<string, Set<string>>()

export type CodexMcpApprovalChat = {
  sessionId: string
  /** The mode the chat's turns run under; undefined before the provider reports one. */
  mode: AgentChatPermissionChoice | undefined
}

export function codexMcpApprovalChat(
  sessionId: string,
  session: {
    permissions?: {
      acquiredMode: AgentChatPermissionChoice
      appliedMode?: AgentChatPermissionChoice
    }
  }
): CodexMcpApprovalChat {
  return { sessionId, mode: session.permissions?.appliedMode ?? session.permissions?.acquiredMode }
}

/** One question is the same server showing the same words for the same tool arguments. */
export function codexMcpApprovalQuestion(params: unknown): string {
  const record = readRecord(params)
  return createHash('sha256')
    .update(
      JSON.stringify([
        readString(record, 'serverName'),
        readString(record, 'message'),
        readRecord(record._meta).tool_params ?? null
      ])
    )
    .digest('hex')
}

/** Full access asks nothing; any other mode skips only a question this chat already allowed. */
export function codexMcpApprovalAllowedWithoutAsking(
  chat: CodexMcpApprovalChat,
  question: string
): boolean {
  return chat.mode === 'full-access' || allowedByChat.get(chat.sessionId)?.has(question) === true
}

/** "Allow for this session" is kept in every mode; Approve for me keeps a plain Allow as well. */
export function rememberCodexMcpApproval(
  chat: CodexMcpApprovalChat,
  question: string,
  decision: string
): void {
  if (decision !== 'acceptForSession' && !(decision === 'accept' && chat.mode === 'auto')) {
    return
  }
  const allowed = allowedByChat.get(chat.sessionId) ?? new Set<string>()
  // Re-insert so the chats answered most recently are the ones kept.
  allowedByChat.delete(chat.sessionId)
  allowedByChat.set(chat.sessionId, allowed)
  allowed.add(question)
  for (const oldest of allowed) {
    if (allowed.size <= MAX_REMEMBERED_QUESTIONS) {
      break
    }
    allowed.delete(oldest)
  }
  for (const oldest of allowedByChat.keys()) {
    if (allowedByChat.size <= MAX_REMEMBERING_CHATS) {
      break
    }
    allowedByChat.delete(oldest)
  }
}

export function resetCodexMcpApprovalMemoryForTests(): void {
  allowedByChat.clear()
}
