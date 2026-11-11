import {
  parseMarkovSessionAddress,
  type MarkovSessionId
} from '../../../../../shared/markov-session-address'
import { structuredWorkerMarkovSessionIdForIncarnation } from '../../terminal-authority/structured-sessions/structured-worker-identity'
import { canonicalMarkovSessionId } from './canonical-markov-session-id'

/** Resolve structured incarnations or chat addresses to bare session ids; PTYs have none. */
export function dispatchAssigneeMarkovSessionId(assignee: {
  handle: string
  processIncarnation: string | null | undefined
}): MarkovSessionId | null {
  const markovSessionId =
    structuredWorkerMarkovSessionIdForIncarnation(assignee.processIncarnation) ??
    parseMarkovSessionAddress(assignee.handle)
  return markovSessionId === null ? null : canonicalMarkovSessionId(markovSessionId)
}
