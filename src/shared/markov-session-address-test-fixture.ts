import { isMarkovSessionId, type MarkovSessionId } from './markov-session-address'

/** A literal Markov session id for a test, checked by the same predicate production uses. */
export function testMarkovSessionId(id: string): MarkovSessionId {
  if (!isMarkovSessionId(id)) {
    throw new Error(`Not a Markov session id: ${id}`)
  }
  return id
}
