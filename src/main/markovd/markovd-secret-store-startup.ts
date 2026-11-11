import { join } from 'node:path'
import { prepareMarkovdSecretStore } from './markovd-host-adapters'

export async function prepareMarkovdSecretStoreAndMigrate(userDataPath: string): Promise<void> {
  const { getSecretStore } = await import('../../shared/secret-store')
  const { reportSecretProtectionGap } = await import('../host/secret-protection-report')
  const { migratePlaintextCredentials, markovdCredentialRoot } =
    await import('./markovd-plaintext-credential-migration')
  // Keep sealing keys outside disposable MARKOV_USER_DATA roots.
  if (await prepareMarkovdSecretStore(markovdCredentialRoot(), userDataPath)) {
    migratePlaintextCredentials(getSecretStore())
  }
  reportSecretProtectionGap({ dataFile: join(userDataPath, 'markov-data.json') })
}
