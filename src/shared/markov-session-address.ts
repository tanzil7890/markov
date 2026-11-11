import { isAgentSessionId } from './agent-session/lifecycle/agent-session-record'
import { isTerminalHandle } from './terminal-handle-prefix'
import { MARKOV_SESSION_ADDRESS_PREFIX } from './markov-session-address-prefix'

/** Markov-minted structured session identity (record id/MARKOV_AGENT_SESSION_ID), never provider identity. Orchestration stores bare lineage-root ids after /clear,
 * not live replacement ids; derive mail spelling markov_session_id:<id> alongside run:/dispatch: addresses.
 * Resolve execution location from records. PTYs have no id today; never use pane keys because later agents inherit panes. */
export { MARKOV_SESSION_ADDRESS_PREFIX }

declare const markovSessionIdBrand: unique symbol
declare const markovSessionAddressBrand: unique symbol

/** A bare Markov session id; only `isMarkovSessionId` and `parseMarkovSessionAddress` produce one. */
export type MarkovSessionId = string & { readonly [markovSessionIdBrand]: true }
/** An `markov_session_id:<id>` mail address; only `formatMarkovSessionAddress` produces one. */
export type MarkovSessionAddress = string & { readonly [markovSessionAddressBrand]: true }

export function isMarkovSessionId(id: string): id is MarkovSessionId {
  return isAgentSessionId(id) && !isTerminalHandle(id)
}

export function formatMarkovSessionAddress(markovSessionId: MarkovSessionId): MarkovSessionAddress {
  const address = `${MARKOV_SESSION_ADDRESS_PREFIX}${markovSessionId}`
  // Always true for a checked id; the check brands the address without a type assertion.
  if (!isMarkovSessionAddress(address)) {
    throw new Error(`Not a Markov session id: ${markovSessionId}`)
  }
  return address
}

/** The bare Markov session id of an `markov_session_id:<id>` address; anything else reads as null. */
export function parseMarkovSessionAddress(
  address: string | null | undefined
): MarkovSessionId | null {
  if (!address?.startsWith(MARKOV_SESSION_ADDRESS_PREFIX)) {
    return null
  }
  const id = address.slice(MARKOV_SESSION_ADDRESS_PREFIX.length)
  return isMarkovSessionId(id) ? id : null
}

function isMarkovSessionAddress(address: string): address is MarkovSessionAddress {
  return parseMarkovSessionAddress(address) !== null
}
