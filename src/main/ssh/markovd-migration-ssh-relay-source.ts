import { MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND } from '../../shared/markovd-migration/markovd-migration-source-kind'
import type { SshTarget } from '../../shared/ssh-types'
import { collectMarkovdMigrationSourceCatalog } from '../persistence/migrating-markovd-catalog/markovd-source-catalog'
import type { Store } from '../persistence/loading-store/store'
import { createMarkovdMigrationManifest } from './markovd-migration-manifest-export'
import { IDENTITY_MARKOVD_MIGRATION_PATH_REWRITER } from './markovd-migration-path-rewrite'
import type {
  MarkovdMigrationSource,
  MarkovdMigrationSourceCutoverPort
} from './markovd-migration-source'
import { assertMarkovdMigrationSourceUnchanged } from './markovd-migration-source-assertions'
import {
  fenceMarkovdMigrationSource,
  releaseMarkovdMigrationFence,
  resolveMarkovdMigrationFence
} from './markovd-migration-source-fence'
import {
  assessMarkovdMigrationTerminals,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from './markovd-migration-terminal-gate'
import type { SshTargetMarkovdClaims } from './targets/ssh-target-markovd-claims'
import type { MarkovdMigrationPreflightStore } from './targets/ssh-target-markovd-preflight'
import type { MarkovdMigrationPaneLeasePredicate } from './markovd-migration-bridged-panes'

type SshRelayCutoverDeps = {
  userDataPath: string
  store: MarkovdMigrationPreflightStore
  claims: SshTargetMarkovdClaims
  /** Rebuild copied stores for every check so later edits remain visible. */
  freshSource?: () => MarkovdMigrationPreflightStore
  signal?: AbortSignal
}

export function sshRelayMigrationCutoverPort(
  deps: SshRelayCutoverDeps
): MarkovdMigrationSourceCutoverPort {
  return {
    verifyFence: (cutover) =>
      assertMarkovdMigrationSourceUnchanged(
        { userDataPath: deps.userDataPath, store: deps.freshSource?.() ?? deps.store },
        cutover
      ),
    releaseFence: (cutover) => releaseMarkovdMigrationFence(deps, cutover)
  }
}

export function createSshRelayMigrationSource(
  deps: SshRelayCutoverDeps & {
    store: MarkovdMigrationPreflightStore &
      Pick<Store, 'getSshRemotePtyLeases' | 'markSshRemotePtyLease'>
    target: SshTarget
    /** Every relay endpoint on the host's account; without it exit can never be proven. */
    censusHost?: CensusHostRelayTerminals | null
    isBridgedPaneLease?: MarkovdMigrationPaneLeasePredicate
  }
): MarkovdMigrationSource {
  const { userDataPath, store, target } = deps
  return {
    ...sshRelayMigrationCutoverPort(deps),
    kind: MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND,
    journalKey: target.id,
    collectCatalog: () => collectMarkovdMigrationSourceCatalog(store, target),
    exportManifest: (options = {}) =>
      createMarkovdMigrationManifest(store, target, {
        ...options,
        rewrite: IDENTITY_MARKOVD_MIGRATION_PATH_REWRITER
      }),
    assessTerminals: () => assessMarkovdMigrationTerminals(store, target.id, deps.censusHost),
    retireProvenExitedTerminals: (proof) => retireProvenExitedLeases(store, target.id, proof),
    resolveFence: () => resolveMarkovdMigrationFence(userDataPath, target),
    acquireFence: (args) =>
      fenceMarkovdMigrationSource({
        userDataPath,
        store,
        claims: deps.claims,
        targetId: target.id,
        isBridgedPaneLease: deps.isBridgedPaneLease,
        ...args
      })
  }
}
