import { MARKOV_SESSION_ADDRESS_PREFIX } from '../../../../shared/markov-session-address'

/** Format bare ids as session addresses (NULL stays NULL); never strip addresses and risk matching handles or Runs. */
export function markovSessionAddressSql(markovSessionIdSql: string): string {
  return `('${MARKOV_SESSION_ADDRESS_PREFIX}' || ${markovSessionIdSql})`
}
