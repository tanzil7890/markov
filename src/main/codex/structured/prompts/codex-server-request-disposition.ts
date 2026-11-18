import type {
  CodexAppServerConnection,
  CodexAppServerServerRequest
} from '../../app-server/codex-app-server-connection-types'
import './codex-structured-prompt-replies'
import { readRecord, readString } from '../../app-server/codex-item-field-readers'
import { isCodexMcpToolApproval } from './codex-mcp-tool-approval'
import {
  codexMcpApprovalAllowedWithoutAsking,
  codexMcpApprovalQuestion,
  type CodexMcpApprovalChat
} from './codex-mcp-approval-memory'
import {
  CODEX_COMMAND_APPROVAL_METHOD,
  CODEX_FILE_CHANGE_APPROVAL_METHOD,
  CODEX_MCP_ELICITATION_METHOD,
  CODEX_USER_INPUT_METHOD,
  type CodexPromptRegistry,
  type CodexPendingPrompt
} from './codex-prompt-registry'

export const CODEX_PERMISSIONS_APPROVAL_METHOD = 'item/permissions/requestApproval'
export const CODEX_DYNAMIC_TOOL_CALL_METHOD = 'item/tool/call'
export const CODEX_AUTH_TOKEN_REFRESH_METHOD = 'account/chatgptAuthTokens/refresh'
export const CODEX_ATTESTATION_METHOD = 'attestation/generate'
export const CODEX_LEGACY_APPLY_PATCH_APPROVAL_METHOD = 'applyPatchApproval'
export const CODEX_LEGACY_EXEC_APPROVAL_METHOD = 'execCommandApproval'

export type CodexServerRequestDisposition =
  | { kind: 'prompt'; prompt: CodexPendingPrompt }
  /** `allowed`: the words of an approval Markov allowed without asking, for the chat's record. */
  | { kind: 'responded'; method: string; allowed?: string }

type ResponseConnection = Pick<CodexAppServerConnection, 'respond' | 'respondWithError'>

/** Every app-server request either becomes a durable prompt or receives a safe reply. */
export function disposeCodexServerRequest(
  registry: CodexPromptRegistry,
  connection: ResponseConnection,
  request: CodexAppServerServerRequest,
  /** The chat asking; without it every approval is put to the user. */
  chat?: CodexMcpApprovalChat
): CodexServerRequestDisposition {
  const params = readRecord(request.params)
  // Why turnId: only an approval that would have become a prompt is allowed in its place.
  if (
    chat &&
    request.method === CODEX_MCP_ELICITATION_METHOD &&
    isCodexMcpToolApproval(params) &&
    readString(params, 'threadId') &&
    readString(params, 'turnId') &&
    codexMcpApprovalAllowedWithoutAsking(chat, codexMcpApprovalQuestion(params))
  ) {
    connection.respond(request.id, { action: 'accept', content: null, _meta: null })
    return {
      kind: 'responded',
      method: request.method,
      allowed: readString(params, 'message') ?? 'Allow this tool call?'
    }
  }
  const prompt = registry.register(request)
  if (prompt) {
    return { kind: 'prompt', prompt }
  }

  switch (request.method) {
    case CODEX_COMMAND_APPROVAL_METHOD:
    case CODEX_FILE_CHANGE_APPROVAL_METHOD:
    case CODEX_USER_INPUT_METHOD:
      connection.respondWithError(
        request.id,
        -32001,
        `Markov could not model ${request.method} as a durable prompt`
      )
      break
    case CODEX_MCP_ELICITATION_METHOD:
      // Tool-call approvals become prompts above; Markov renders no other elicitation form.
      connection.respond(request.id, { action: 'decline', content: null, _meta: null })
      break
    case CODEX_PERMISSIONS_APPROVAL_METHOD:
      connection.respond(request.id, { permissions: {}, scope: 'turn', strictAutoReview: true })
      break
    case CODEX_DYNAMIC_TOOL_CALL_METHOD:
      connection.respond(request.id, { contentItems: [], success: false })
      break
    case CODEX_LEGACY_APPLY_PATCH_APPROVAL_METHOD:
    case CODEX_LEGACY_EXEC_APPROVAL_METHOD:
      connection.respond(request.id, { decision: 'abort' })
      break
    case CODEX_AUTH_TOKEN_REFRESH_METHOD:
      connection.respondWithError(
        request.id,
        -32001,
        'Markov cannot refresh app-server auth tokens'
      )
      break
    case CODEX_ATTESTATION_METHOD:
      connection.respondWithError(request.id, -32001, 'Markov did not negotiate attestation')
      break
    default:
      connection.respondWithError(
        request.id,
        -32000,
        `Markov rejected unrecognized blocking request ${request.method}`
      )
  }
  return { kind: 'responded', method: request.method }
}
