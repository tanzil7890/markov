import {
  readRecord,
  readString as readRecordString
} from '../../app-server/codex-item-field-readers'

/** Same test as Codex's own TUI: an MCP tool-call approval with no form fields to fill. */
export function isCodexMcpToolApproval(params: unknown): boolean {
  const record = readRecord(params)
  if (readRecordString(readRecord(record._meta), 'codex_approval_kind') !== 'mcp_tool_call') {
    return false
  }
  if (record.mode !== undefined && record.mode !== 'form') {
    return false
  }
  const schema = record.requestedSchema
  if (schema === undefined || schema === null) {
    return true
  }
  const properties = readRecord(schema).properties
  return (
    readRecord(schema).type === 'object' &&
    typeof properties === 'object' &&
    properties !== null &&
    !Array.isArray(properties) &&
    Object.keys(properties).length === 0
  )
}

export type CodexMcpToolApprovalDecision = 'accept' | 'acceptForSession' | 'cancel'

/** Whether Codex itself keeps "Allow for this session"; where it cannot, Markov keeps the answer. */
export function codexMcpToolApprovalPersistsSession(params: unknown): boolean {
  const persist = readRecord(readRecord(params)._meta).persist
  return Array.isArray(persist) ? persist.includes('session') : persist === 'session'
}

/** Allow, Allow for this session and Cancel: the same question is never forced on the user twice. */
export const CODEX_MCP_TOOL_APPROVAL_DECISIONS: readonly CodexMcpToolApprovalDecision[] = [
  'accept',
  'acceptForSession',
  'cancel'
]
