import { withTimeout } from '../../../../shared/promise-timeout-fallback'
import {
  callStructuredAgentSession,
  supportsStructuredAgentSessionContinuationContext
} from '@/runtime/structured-agent-session-client'
import type { AgentSessionContinuationContext } from '../../../../shared/agent-session/agent-session-wire'
import { buildAgentSessionHandoffContext } from '../../../../shared/agent-session-handoff-context'
import type { AgentSessionContinuationSource } from '@/lib/agent-session-continuation'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { NativeChatFileLinkContext } from './native-chat-file-link'

/** What another agent is told about this chat: the host's saved record where it keeps one, else the
 *  messages shown. `superseded` means the conversation moved on while the host was asked. */
export async function readNativeChatContinuationSource(args: {
  pane: Pick<NativeChatStructuredViewProps, 'sessionId' | 'target'>
  agent: TuiAgent
  directory: NativeChatFileLinkContext
  epoch: string
  title: string | undefined
  messages: readonly NativeChatMessage[]
  /** False once the caller dropped this read; the host is then not asked. */
  wanted: () => boolean
}): Promise<AgentSessionContinuationSource | 'superseded'> {
  const { pane, directory } = args
  const context = await withTimeout(
    (async () => {
      if (
        !(await supportsStructuredAgentSessionContinuationContext(pane.target)) ||
        !args.wanted()
      ) {
        return null
      }
      return callStructuredAgentSession<AgentSessionContinuationContext>(
        pane.target,
        'agentSession.continuationContext',
        {
          sessionId: pane.sessionId,
          workspaceId: directory.worktreeId,
          expectedCursor: { epoch: args.epoch, sequence: 0 }
        }
      )
    })(),
    30_000,
    null
  )
  if (context?.status === 'superseded') {
    return 'superseded'
  }
  const saved = context?.status === 'current' && typeof context.capturedText === 'string'
  return {
    sourceKind: 'chat',
    sourceAgent: args.agent,
    sourceTitle: args.title,
    sourceWorkingDirectory: directory.worktreePath,
    transcriptPath: saved ? context.transcriptPath : undefined,
    capturedText: saved
      ? (context.capturedText ?? '')
      : buildAgentSessionHandoffContext(args.messages)
  }
}
