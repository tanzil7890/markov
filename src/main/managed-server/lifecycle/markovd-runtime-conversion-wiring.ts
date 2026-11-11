import { encodePairingOffer } from '../../../shared/remote-runtime/pairing/pairing'
import {
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { disconnectRegisteredSshTarget } from '../../ipc/ssh/ssh-session-teardown'
import type { MarkovdMigrationDestinationCatalog } from '../../ssh/markovd-migration-cutover-coordinator'
import {
  abortRemoteMarkovdMigrationCatalog,
  commitRemoteMarkovdMigrationCatalog,
  listRemoteMarkovdRepositories,
  readRemoteMarkovdMigrationCatalogState,
  stageRemoteMarkovdMigrationBlobChunk,
  stageRemoteMarkovdMigrationCatalog,
  stageRemoteMarkovdMigrationSnapshotChunk
} from '../../ssh/markovd-migration-catalog-client'
import { readRemoteMarkovdMigrationCapabilities } from '../../ssh/markovd-migration-capabilities-client'
import { abortRemoteMarkovdMigrationCatalogByReference } from '../../ssh/markovd-migration-catalog-reference-client'
import {
  enableRemoteMarkovdAutomation,
  type EnableServerAutomation
} from '../../ssh/markovd-migration-moved-automations'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/ssh-host-relay-census-for-target'
import { isBridgeableLease } from '../../ssh/legacy-relay/legacy-relay-bridge-leases'
import type { MarkovdManagedConversionArgs } from './markovd-runtime-conversion'
import type { MarkovdServerRepository } from '../../ssh/markovd-migration-repository-link'
import {
  listRemoteMarkovdFolderCatalog,
  type MarkovdServerFolderCatalog
} from '../../ssh/markovd-server-folder-workspaces'

export function markovdMigrationDestinationFor(
  environment: KnownRuntimeEnvironment
): MarkovdMigrationDestinationCatalog {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return {
    readState: (manifest) => readRemoteMarkovdMigrationCatalogState(pairingCode, manifest, options),
    stage: (manifest) => stageRemoteMarkovdMigrationCatalog(pairingCode, manifest, options),
    commit: (manifest) => commitRemoteMarkovdMigrationCatalog(pairingCode, manifest, options),
    abort: (manifest) => abortRemoteMarkovdMigrationCatalog(pairingCode, manifest, options),
    abortByReference: (manifest) =>
      abortRemoteMarkovdMigrationCatalogByReference(pairingCode, manifest, options),
    stageChunk: (request) =>
      stageRemoteMarkovdMigrationSnapshotChunk(pairingCode, request, options),
    readCapabilities: () => readRemoteMarkovdMigrationCapabilities(pairingCode, options),
    stageBlobChunk: (request) => stageRemoteMarkovdMigrationBlobChunk(pairingCode, request, options)
  }
}

export function markovdServerRepositoriesFor(
  environment: KnownRuntimeEnvironment
): Promise<MarkovdServerRepository[]> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteMarkovdRepositories(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function markovdServerFolderCatalogFor(
  environment: KnownRuntimeEnvironment
): Promise<MarkovdServerFolderCatalog> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteMarkovdFolderCatalog(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function markovdServerAutomationEnablerFor(
  environment: KnownRuntimeEnvironment
): EnableServerAutomation {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return (automation) => enableRemoteMarkovdAutomation(pairingCode, automation, options)
}

export function conversionCollaborators(): Pick<
  MarkovdManagedConversionArgs,
  | 'destinationFor'
  | 'serverRepositoriesFor'
  | 'serverFolderCatalogFor'
  | 'serverAutomationEnablerFor'
  | 'censusHost'
  | 'isBridgedPaneLease'
  | 'releaseDirectSession'
> {
  return {
    destinationFor: markovdMigrationDestinationFor,
    serverRepositoriesFor: markovdServerRepositoriesFor,
    serverFolderCatalogFor: markovdServerFolderCatalogFor,
    serverAutomationEnablerFor: markovdServerAutomationEnablerFor,
    censusHost: (target) => censusHostRelayTerminalsFor(target)(),
    isBridgedPaneLease: isBridgeableLease,
    releaseDirectSession: disconnectRegisteredSshTarget
  }
}
