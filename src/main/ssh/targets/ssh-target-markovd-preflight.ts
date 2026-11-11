/** Read-only export preflight: catalog rows and representable dormant state can migrate; ownership, live leases and untransferred dependencies block. */
import { isLiveSshPtyLease } from '../../../shared/ssh-types'
import type { Store } from '../../persistence/loading-store/store'
import type {
  MarkovdMigrationBlocker,
  MarkovdMigrationPreflight
} from '../../../shared/markovd-migration/markovd-migration-preflight'
import {
  createMarkovdMigrationManifest,
  type MarkovdMigrationExportStore
} from '../markovd-migration-manifest-export'
import {
  collectTargetCatalogBlockers,
  resolveMarkovdPreflightTarget
} from './ssh-target-markovd-claims'
import { collectUntransferredDependentBlockers } from './ssh-target-markovd-dependents'
import {
  preservesMarkovdMigrationBridgedPanes,
  type MarkovdMigrationPaneLeasePredicate
} from '../markovd-migration-bridged-panes'

export type MarkovdMigrationPreflightStore = MarkovdMigrationExportStore &
  Pick<
    Store,
    'getSshTarget' | 'getSshRemotePtyLeases' | 'inspectMarkovdMigrationUntransferredDependencies'
  >

/** `owner` passes the environment's own fence only when its migration journal is on disk. */
export function preflightMarkovdMigrationExport(
  store: MarkovdMigrationPreflightStore,
  targetId: string,
  owner?: { environmentId: string; recorded: boolean },
  /** COMPAT(legacy-relay-bridge): leases a bridged proof left running for the bridge. */
  bridgedPtyIds: readonly string[] = []
): MarkovdMigrationPreflight {
  const resolved = resolveMarkovdPreflightTarget(store, targetId, owner)
  if ('result' in resolved) {
    return resolved.result
  }
  const { target } = resolved
  const blockers: MarkovdMigrationBlocker[] = [...collectTargetCatalogBlockers(store, target)]
  const terminalLeases = store
    .getSshRemotePtyLeases(targetId)
    .filter((lease) => isLiveSshPtyLease(lease) && !bridgedPtyIds.includes(lease.ptyId))
    .map(({ ptyId, worktreeId, tabId, leafId, state, updatedAt }) => ({
      ptyId,
      worktreeId,
      tabId,
      leafId,
      state,
      updatedAt
    }))
  if (terminalLeases.length > 0) {
    // A relay PTY cannot move to markovd; its work must finish first.
    blockers.push({
      code: 'markovd_migration_direct_ssh_terminal_leases',
      category: 'live-or-unverifiable',
      terminalLeases
    })
  }
  blockers.push(
    ...collectUntransferredDependentBlockers(store, createMarkovdMigrationManifest(store, target))
  )
  return {
    targetId,
    targetLabel: target.label,
    claimable: !blockers.some(isBlockingMarkovdMigrationBlocker),
    blockers
  }
}

/** Confirmed Move anyway can leave saved state, but desktop drafts that cannot be left still block. */
export function leaveBehindClearsMarkovdMigrationBlockers(
  store: MarkovdMigrationPreflightStore & Pick<Store, 'createMarkovdMigrationLeaveBehindView'>,
  targetId: string,
  bridgedPtyIds: readonly string[] = [],
  isBridgedPaneLease?: MarkovdMigrationPaneLeasePredicate
): boolean {
  const view = store.createMarkovdMigrationLeaveBehindView(targetId)
  const preflight = preflightMarkovdMigrationExport(
    {
      ...view,
      getSshTarget: (id) => store.getSshTarget(id),
      getSshRemotePtyLeases: (id) => store.getSshRemotePtyLeases(id)
    },
    targetId,
    undefined,
    bridgedPtyIds
  )
  const target = store.getSshTarget(targetId)
  return (
    preflight.claimable &&
    target !== undefined &&
    preservesMarkovdMigrationBridgedPanes(
      createMarkovdMigrationManifest(view, target).payload,
      store.getSshRemotePtyLeases(targetId),
      bridgedPtyIds,
      isBridgedPaneLease
    )
  )
}

/** Only saved state blocks: a confirmed "Move anyway" may leave it on this desktop. */
export function onlyLeavableMarkovdMigrationBlockers(
  blockers: readonly MarkovdMigrationBlocker[]
): boolean {
  const blocking = blockers.filter(isBlockingMarkovdMigrationBlocker)
  return (
    blocking.length > 0 &&
    blocking.every((blocker) => blocker.code === 'markovd_migration_dependent_state')
  )
}

export function isBlockingMarkovdMigrationBlocker(blocker: MarkovdMigrationBlocker): boolean {
  return (
    blocker.category !== 'drainable-static-state' &&
    blocker.code !== 'markovd_migration_saved_port_forwards'
  )
}
