import { createHash } from 'node:crypto'
import type { PairedRuntimeConnection } from '../../../../shared/remote-runtime/pairing/paired-runtime-connection'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { BrowserClientPageAuthorityIdentity } from '../../client-pages/execution/browser-client-page-command-executor-dependencies'

export function derivePairedRuntimeBrowserAuthorityIdentity(input: {
  markovProfileId: string
  environment: Pick<KnownRuntimeEnvironment, 'id' | 'markovdDeployment'>
  pairingRevision: number
  authorityRuntimeId: string
  connection: PairedRuntimeConnection
}): BrowserClientPageAuthorityIdentity {
  const { markovProfileId, environment, pairingRevision, connection } = input
  const pairingIdentity = pairingAuthorityConnectionIdentity(
    markovProfileId,
    environment.id,
    pairingRevision,
    connection
  )
  return {
    // Managed SSH/WSL deployments re-pair in place, so cookie storage must outlive pairing revisions.
    authorityConnectionIdentity: environment.markovdDeployment
      ? deployedAuthorityConnectionIdentity(markovProfileId, environment.id, connection)
      : pairingIdentity,
    pairingAuthorityConnectionIdentity: pairingIdentity,
    legacyAuthorityConnectionIdentity: legacyAuthorityConnectionIdentity(
      markovProfileId,
      environment.id,
      pairingRevision,
      input.authorityRuntimeId,
      connection
    )
  }
}

// Exclude the per-process authorityRuntimeId so remote restarts preserve cookies.
function pairingAuthorityConnectionIdentity(
  markovProfileId: string,
  environmentId: string,
  pairingRevision: number,
  connection: PairedRuntimeConnection
): string {
  return connectionIdentityDigest([
    'paired-runtime-browser',
    markovProfileId,
    environmentId,
    pairingRevision,
    connection.hostPublicKeyB64,
    connection.pairedDeviceId ?? null
  ])
}

// Re-pairing rotates device ids and revisions; the server key still isolates cookie storage.
function deployedAuthorityConnectionIdentity(
  markovProfileId: string,
  environmentId: string,
  connection: PairedRuntimeConnection
): string {
  return connectionIdentityDigest([
    'paired-runtime-browser-deployed',
    markovProfileId,
    environmentId,
    connection.hostPublicKeyB64
  ])
}

/** Superseded per-process identity, kept only so its partition can be adopted. */
function legacyAuthorityConnectionIdentity(
  markovProfileId: string,
  environmentId: string,
  pairingRevision: number,
  authorityRuntimeId: string,
  connection: PairedRuntimeConnection
): string {
  return connectionIdentityDigest([
    'paired-runtime-browser',
    markovProfileId,
    environmentId,
    pairingRevision,
    authorityRuntimeId,
    connection.hostPublicKeyB64,
    connection.pairedDeviceId ?? null
  ])
}

function connectionIdentityDigest(components: readonly unknown[]): string {
  return `paired-runtime:${createHash('sha256').update(JSON.stringify(components)).digest('hex')}`
}
