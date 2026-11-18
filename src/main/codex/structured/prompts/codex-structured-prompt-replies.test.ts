import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentSessionPromptResponse } from '../../../../shared/agent-session/agent-session-question-answer'
import { applyCodexPromptAnswer, prepareCodexPromptAnswer } from './codex-structured-prompt-replies'
import { CodexPromptRegistry, type CodexPendingPrompt } from './codex-prompt-registry'
import { MAX_CODEX_PROMPT_REGISTRY_ENTRIES } from './codex-prompt-registry-bounds'
import { disposeCodexServerRequest } from './codex-server-request-disposition'
import {
  codexMcpApprovalQuestion,
  rememberCodexMcpApproval,
  resetCodexMcpApprovalMemoryForTests
} from './codex-mcp-approval-memory'

function picked(optionId: string): AgentSessionPromptResponse {
  return { kind: 'answers', answers: [{ questionId: 'q1', optionIds: [optionId] }] }
}

function typed(questionId: string, other: string): AgentSessionPromptResponse {
  return { kind: 'answers', answers: [{ questionId, optionIds: [], other }] }
}

function registered(prompt: CodexPendingPrompt | null): CodexPendingPrompt {
  if (!prompt) {
    throw new Error('expected the request to register')
  }
  return prompt
}

function answer(
  prompt: CodexPendingPrompt | null,
  response: AgentSessionPromptResponse
): Record<string, unknown> | null {
  const live = registered(prompt)
  return applyCodexPromptAnswer(live, prepareCodexPromptAnswer(live, response))
}

function userInputRequest(questionIds: string[]): {
  id: number
  method: string
  params: unknown
} {
  return {
    id: 5,
    method: 'item/tool/requestUserInput',
    params: {
      itemId: 'codex-item-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      questions: questionIds.map((id) => ({ id }))
    }
  }
}

describe('CodexPromptRegistry', () => {
  it('keeps a journal-bound pending prompt answerable after the lookup window evicts it', () => {
    const registry = new CodexPromptRegistry()
    const first = registry.register(userInputRequest(['q1']))
    registry.bindJournalItemId('journal-first', 'thread-1', 'codex-item-1')

    for (let index = 0; index <= MAX_CODEX_PROMPT_REGISTRY_ENTRIES; index += 1) {
      registry.register({
        id: index + 10,
        method: 'item/commandExecution/requestApproval',
        params: { itemId: `item-${index}`, threadId: 'thread-1' }
      })
    }

    expect(registry.find('journal-first')).toBe(first)
  })
})

describe('applyCodexPromptAnswer', () => {
  it('refuses an answer that names no question of a multi-question request', () => {
    const registry = new CodexPromptRegistry()
    const many = registry.register(userInputRequest(['q1', 'q2']))

    expect(() => answer(many, picked('sure'))).toThrow('does not name a question')
    expect(() => answer(many, typed('q3', 'sure'))).toThrow('does not name a question')
  })

  it('refuses an answer over the registry bound before recording anything', () => {
    const registry = new CodexPromptRegistry()
    const single = registry.register(userInputRequest(['q1']))
    const live = registered(single)

    expect(() => prepareCodexPromptAnswer(live, typed('q1', 'x'.repeat(64 * 1024 + 1)))).toThrow(
      'exceeds bounded registry state'
    )
    expect(live.answers.size).toBe(0)
  })
})

function mcpElicitationRequest(id: number, params: Record<string, unknown>) {
  return {
    id,
    method: 'mcpServer/elicitation/request',
    params: { threadId: 'thread-1', turnId: 'turn-1', serverName: 'codex_apps', ...params }
  }
}

const MCP_TOOL_APPROVAL = {
  mode: 'form',
  message: 'Allow Notion to run tool "notion.notion-update-page"?',
  requestedSchema: { type: 'object', properties: {} },
  _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] }
}

const TOOL_APPROVAL_NOT_KEPT_BY_CODEX = {
  ...MCP_TOOL_APPROVAL,
  _meta: { codex_approval_kind: 'mcp_tool_call', tool_params: { app: 'com.example.editor' } }
}

function respondedTo(): {
  replies: unknown[]
  connection: Parameters<typeof disposeCodexServerRequest>[1]
} {
  const replies: unknown[] = []
  return {
    replies,
    connection: {
      respond: (_id, reply) => replies.push(reply),
      respondWithError: (_id, _code, message) => replies.push(message)
    }
  }
}

describe('MCP tool-call approvals', () => {
  beforeEach(() => resetCodexMcpApprovalMemoryForTests())

  it('tells Codex a plain Allow when Codex cannot keep "Allow for this session" itself', () => {
    const registry = new CodexPromptRegistry()
    const kept = registry.register(mcpElicitationRequest(14, MCP_TOOL_APPROVAL))
    const notKept = registry.register(mcpElicitationRequest(15, TOOL_APPROVAL_NOT_KEPT_BY_CODEX))
    const forSession = { kind: 'option', optionId: 'acceptForSession' } as const

    expect(answer(kept, forSession)).toEqual({
      action: 'accept',
      content: null,
      _meta: { persist: 'session' }
    })
    expect(answer(notKept, forSession)).toEqual({ action: 'accept', content: null, _meta: null })
    expect(() =>
      prepareCodexPromptAnswer(registered(notKept), { kind: 'option', optionId: 'decline' })
    ).toThrow('did not offer decline')
  })

  it('asks a question again in Ask mode until it was allowed for the session', () => {
    const chat = { sessionId: 'chat-1', mode: 'ask' } as const
    const question = codexMcpApprovalQuestion(
      mcpElicitationRequest(1, TOOL_APPROVAL_NOT_KEPT_BY_CODEX).params
    )
    const ask = (id: number) => {
      const { replies, connection } = respondedTo()
      const disposition = disposeCodexServerRequest(
        new CodexPromptRegistry(),
        connection,
        mcpElicitationRequest(id, TOOL_APPROVAL_NOT_KEPT_BY_CODEX),
        chat
      )
      return { kind: disposition.kind, replies }
    }

    rememberCodexMcpApproval(chat, question, 'accept')
    expect(ask(20)).toEqual({ kind: 'prompt', replies: [] })

    rememberCodexMcpApproval(chat, question, 'acceptForSession')
    expect(ask(21)).toEqual({
      kind: 'responded',
      replies: [{ action: 'accept', content: null, _meta: null }]
    })
  })

  it('keeps a plain Allow under Approve for me, for that question and that chat only', () => {
    const chat = { sessionId: 'chat-2', mode: 'auto' } as const
    const request = mcpElicitationRequest(30, TOOL_APPROVAL_NOT_KEPT_BY_CODEX)
    rememberCodexMcpApproval(chat, codexMcpApprovalQuestion(request.params), 'accept')
    const dispose = (
      asked: ReturnType<typeof mcpElicitationRequest>,
      asking: { sessionId: string; mode: 'auto' | 'full-access' }
    ) => {
      const { replies, connection } = respondedTo()
      return {
        ...disposeCodexServerRequest(new CodexPromptRegistry(), connection, asked, asking),
        replies
      }
    }
    const otherApp = mcpElicitationRequest(31, {
      ...TOOL_APPROVAL_NOT_KEPT_BY_CODEX,
      _meta: { codex_approval_kind: 'mcp_tool_call', tool_params: { app: 'com.example.browser' } }
    })

    expect(dispose(request, chat)).toEqual({
      kind: 'responded',
      method: 'mcpServer/elicitation/request',
      allowed: 'Allow Notion to run tool "notion.notion-update-page"?',
      replies: [{ action: 'accept', content: null, _meta: null }]
    })
    expect(dispose(otherApp, chat).kind).toBe('prompt')
    expect(dispose(request, { sessionId: 'chat-3', mode: 'auto' }).kind).toBe('prompt')
    expect(dispose(otherApp, { sessionId: 'chat-3', mode: 'full-access' }).kind).toBe('responded')
  })
})
