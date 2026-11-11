import {
  formatMarkovSessionAddress,
  isMarkovSessionId
} from '../../../shared/markov-session-address'
import type { OrchestrationSessionAddressResult } from '../../../shared/orchestration-caller-status'
import { callRuntimeRpc } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/**
 * A chat's Markov session ID: its `/clear` root's, which the host derives from the session records.
 * Null for an id that is not a Markov session id.
 */
export async function resolveStructuredSessionMarkovSessionId(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<string | null> {
  if (!isMarkovSessionId(sessionId)) {
    return null
  }
  try {
    const result = await callRuntimeRpc<OrchestrationSessionAddressResult>(
      target,
      'orchestration.sessionAddress',
      { sessionId }
    )
    return result.markovSessionId
  } catch (error) {
    // Why: a host that predates the method routes the current session's ID to the same chat.
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return formatMarkovSessionAddress(sessionId)
    }
    throw error
  }
}
