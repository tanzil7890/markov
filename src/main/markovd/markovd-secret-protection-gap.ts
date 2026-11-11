export const MARKOVD_PLAINTEXT_SECRETS_ENV = 'MARKOV_HEADLESS_SECRET_STORE'

export function describeMarkovdPlaintextOptOut(): string {
  return (
    `${MARKOVD_PLAINTEXT_SECRETS_ENV}=plaintext is set, so Markov's headless server stores ` +
    'credentials unencrypted on this host.'
  )
}

export function describeMarkovdDisposableProfile(): string {
  return (
    "Markov's headless server is running from a temporary profile, so it stores credentials " +
    'unencrypted and leaves the saved credential key and existing credentials untouched.'
  )
}

/** Machine IDs are public; adjacent keys do not protect against copying the whole account or backup. */
export function describeMarkovdHostKeyGap(hostBound: boolean): string {
  const binding = hostBound ? ', mixed with this machine ID' : ''
  return (
    "Markov's headless server seals credentials with a key kept beside them in its private " +
    `credential directory${binding}. Anyone who can read this account's files on this host, or a ` +
    'backup of them, can unseal them.'
  )
}

export function describeMarkovdSealingUnavailable(reason: string, stateFile: string): string {
  return (
    `Markov's headless server cannot unseal its credentials: ${reason}. Saved credentials are kept ` +
    `as they are and new ones are refused until this is fixed and the server restarts. To start ` +
    `over and reconnect every integration, delete ${stateFile}.`
  )
}
