// Always report available to prevent plaintext fallback; throw on seal/unseal when the key is unavailable.
import type { SecretStore } from '../../shared/secret-store'
import { sweepStaleRecordStaging } from './markovd-secret-key-record'
import {
  markovdSecretStatePath,
  resolveState,
  type MarkovdSecretStorePrepareOptions,
  type StoreState
} from './markovd-secret-key-resolution'
import { openMarkovdSecret, sealMarkovdSecret } from './markovd-secret-sealing'

export type MarkovdSecretStore = SecretStore & {
  prepare(options: MarkovdSecretStorePrepareOptions): Promise<boolean>
}

export function createMarkovdSecretStore(
  log: (message: string) => void = (message) => console.warn(message)
): MarkovdSecretStore {
  let state: StoreState = { kind: 'pending' }
  const readyKey = (): Buffer => {
    if (state.kind === 'ready') {
      return state.key
    }
    throw new Error(
      state.kind === 'unavailable'
        ? state.message
        : 'markovd_secret_store_not_prepared — the headless secret store has not loaded its key yet'
    )
  }
  return {
    isEncryptionAvailable: () => state.kind !== 'plaintext',
    encryptString: (plainText) => sealMarkovdSecret(readyKey(), plainText),
    decryptString: (cipher) => openMarkovdSecret(readyKey(), cipher),
    describeProtectionGap: () => {
      switch (state.kind) {
        case 'ready':
          return state.gap
        case 'unavailable':
          return state.message
        case 'plaintext':
          return state.reason
        case 'pending':
          return "Markov's headless server has not loaded its credential key yet."
      }
    },
    async prepare(next) {
      sweepStaleRecordStaging(markovdSecretStatePath(next))
      state = await resolveState(next, log)
      return state.kind === 'ready'
    }
  }
}
