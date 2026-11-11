/** Address any host-local chat by Markov session id, including /clear ancestors.
 * Unbound mail belongs to the root mailbox and points at the live session. Released leases may restart; closed/foreign/unknown chats refuse before storage. */

import {
  MARKOV_SESSION_ADDRESS_PREFIX,
  formatMarkovSessionAddress,
  isMarkovSessionId,
  parseMarkovSessionAddress,
  type MarkovSessionAddress,
  type MarkovSessionId
} from '../../../../../../shared/markov-session-address'
// The caller codes, reused: each names the same fact about a session, whichever side of the mail it is on.
import { ORCHESTRATION_SESSION_CALLER_ERROR_CODES as CODES } from '../../../../../../shared/orchestration-session-caller-codes'
import {
  lookupMarkovAgentSession,
  structuredSessionMailReach
} from '../../../../orchestration/mailbox/routing/structured-session-mail-address'
import type { AgentSessionRecordReader } from '../../../../orchestration/addressing/session-lineage/structured-session-lineage'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'
import { canonicalMarkovSessionId } from '../../../../orchestration/addressing/session-lineage/canonical-markov-session-id'

/** `address` is the named session's own spelling; the mailbox mail lands in is its identity address. */
export type SessionRecipient = { sessionId: MarkovSessionId; address: MarkovSessionAddress }

export type SessionRecipientRefusal = {
  code: (typeof CODES)[keyof typeof CODES]
  message: string
}

/** Whether a recipient may name a session, so the caller can install the session host first. */
export function mayNameSession(recipient: string): boolean {
  return recipient.startsWith(MARKOV_SESSION_ADDRESS_PREFIX) || isMarkovSessionId(recipient)
}

/** Recognize bare ids as sessions only when a local record exists; preserve terminal-handle interpretation otherwise. */
export function readSessionRecipient(
  recipient: string,
  store: AgentSessionRecordReader | null
): SessionRecipient | SessionRecipientRefusal | null {
  if (recipient.startsWith(MARKOV_SESSION_ADDRESS_PREFIX)) {
    const sessionId = parseMarkovSessionAddress(recipient)
    return sessionId
      ? { sessionId, address: formatMarkovSessionAddress(sessionId) }
      : {
          code: CODES.unknown,
          message: `${recipient} does not name a Markov session ID. No message was sent.`
        }
  }
  const sessionId = isMarkovSessionId(recipient) ? recipient : null
  const found = sessionId && store ? lookupMarkovAgentSession(store, sessionId) : null
  if (found?.kind === 'provider-id') {
    return providerIdRefusal(recipient, found.markovSessionId, store)
  }
  return sessionId && found?.kind === 'found'
    ? { sessionId, address: formatMarkovSessionAddress(sessionId) }
    : null
}

/** Share mail/task reachability: null admits storage/delivery here, otherwise return the refusal. */
export function refuseUndeliverableSessionRecipient(
  recipient: SessionRecipient,
  store: AgentSessionRecordReader | null,
  db: OrchestrationDb,
  noEffect = 'No message was sent.'
): SessionRecipientRefusal | null {
  const { sessionId } = recipient
  if (!store) {
    return {
      code: CODES.unknown,
      message: `Agent session ${sessionId} cannot be verified: this Markov is not running its agent-session host. ${noEffect}`
    }
  }
  const found = lookupMarkovAgentSession(store, sessionId)
  if (found.kind === 'provider-id') {
    return providerIdRefusal(sessionId, found.markovSessionId, store, noEffect)
  }
  if (found.kind === 'unknown') {
    return {
      code: CODES.unknown,
      message: `No Markov agent session ${sessionId} exists on this host. ${noEffect}`
    }
  }
  const reach = structuredSessionMailReach(store, found.record, db)
  if (reach.kind === 'other-host') {
    return {
      code: CODES.hostBoundary,
      message: `Agent session ${sessionId} runs on another host; mail reaches a session only on the host that runs it. Send from that host. ${noEffect}`
    }
  }
  if (reach.kind === 'unverifiable') {
    return {
      code: CODES.notLive,
      message: `The session continuing agent session ${sessionId} after a /clear cannot be verified: ${reach.reason} ${noEffect}`
    }
  }
  if (reach.kind === 'ended') {
    return {
      code: CODES.notLive,
      message:
        reach.reason === 'worker-identity-lost'
          ? `Agent session ${sessionId} is a structured worker whose worker identity this host no longer has, so it can never read that mail. ${noEffect}`
          : `Agent session ${sessionId} has ended: its chat was closed. ${noEffect}`
    }
  }
  return null
}

function providerIdRefusal(
  id: string,
  markovSessionId: string,
  store: AgentSessionRecordReader | null,
  noEffect = 'No message was sent.'
): SessionRecipientRefusal {
  // The conversation's Markov session ID, which a `/clear`ed session keeps; not the live session's.
  const root = isMarkovSessionId(markovSessionId)
    ? canonicalMarkovSessionId(markovSessionId, store)
    : markovSessionId
  const address = `${MARKOV_SESSION_ADDRESS_PREFIX}${root}`
  return {
    code: CODES.providerId,
    message: `${id} is the provider's own session id, which changes on /clear. This session's Markov session ID is ${address}; address it by that instead. ${noEffect}`
  }
}
