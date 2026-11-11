import type { MarkovRuntimeWithGetPtyRecordForPaneKey } from '../../mailbox/routing/terminal-pane-mail-routing'
import { escalateChatWorkerError } from './chat-worker-error-escalation'
import type { StructuredAgentSessionRequestFailure } from '../../../../native-chat/agent-session-wire/observations/structured-agent-session-request-failures'
import { RuntimeStructuredAgentHost } from '../../../agent-session/installation/runtime-structured-agent-host'

export abstract class RuntimeChatWorkerEvents extends RuntimeStructuredAgentHost {
  abstract onStructuredSessionStatusForMail(
    ...args: Parameters<MarkovRuntimeWithGetPtyRecordForPaneKey['onStructuredSessionStatusForMail']>
  ): ReturnType<MarkovRuntimeWithGetPtyRecordForPaneKey['onStructuredSessionStatusForMail']>

  abstract onStructuredSessionTabHidden(
    ...args: Parameters<MarkovRuntimeWithGetPtyRecordForPaneKey['onStructuredSessionTabHidden']>
  ): ReturnType<MarkovRuntimeWithGetPtyRecordForPaneKey['onStructuredSessionTabHidden']>

  abstract structuredChatMailOwed(
    ...args: Parameters<MarkovRuntimeWithGetPtyRecordForPaneKey['structuredChatMailOwed']>
  ): ReturnType<MarkovRuntimeWithGetPtyRecordForPaneKey['structuredChatMailOwed']>

  /** A chat worker whose request settled failed tells the Run that dispatched it. */
  onStructuredRequestFailureForErrorMail(failure: StructuredAgentSessionRequestFailure): void {
    void escalateChatWorkerError(failure, this.workerTurnStopReportDeps)
  }
}
