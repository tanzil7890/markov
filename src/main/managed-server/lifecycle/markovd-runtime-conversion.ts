// Resume journaled migrations after lost contact; source rows stay authoritative until proven commit.
// Retain source rows afterwards for downgrade compatibility.
import { randomUUID } from 'node:crypto'
import type { MarkovdManagedConversionResult } from '../../../shared/markovd-managed-runtime'
import type { MarkovdMigrationSourceCutover } from '../../../shared/markovd-migration/markovd-migration-source-cutover'
import { recordManagedMarkovdMigration } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  getMarkovdSshDeployment,
  redactRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { environmentMatchesManagedMarkovdCutover } from './markovd-managed-migration-status'
import { requireManagedMarkovdInfrastructure } from './markovd-managed-runtime-context'
import { ensureMarkovdManagedTunnel } from './markovd-managed-tunnel'
import {
  commitMarkovdMigrationDestination,
  type MarkovdMigrationDestinationCatalog
} from '../../ssh/markovd-migration-cutover-coordinator'
import {
  findMarkovdMigrationSourceCutoverForTarget,
  removeMarkovdMigrationJournalsForDestination
} from '../../ssh/markovd-migration-cutover-journal'
import type { SshTarget } from '../../../shared/ssh-types'
import type { CensusHostRelayTerminals } from '../../ssh/markovd-migration-terminal-gate'
import { createManagedMarkovdEnvironment } from './markovd-runtime-deployment'
import { createSshRelayMigrationSource } from '../../ssh/markovd-migration-ssh-relay-source'
import {
  leaveBehindClearsMarkovdMigrationBlockers,
  onlyLeavableMarkovdMigrationBlockers
} from '../../ssh/targets/ssh-target-markovd-preflight'
import { MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON } from '../../ssh/markovd-migration-source-fence'
import type { MarkovdMigrationPaneLeasePredicate } from '../../ssh/markovd-migration-bridged-panes'
import { retainMarkovdMigrationSource } from '../../ssh/markovd-migration-source-retention'
import {
  enableMovedMarkovdAutomations,
  type EnableServerAutomation
} from '../../ssh/markovd-migration-moved-automations'
import {
  linkedMarkovdMigrationCutoverPort,
  linkedMarkovdMigrationProjects,
  linkServerHeldRepositories,
  type MarkovdServerRepository
} from '../../ssh/markovd-migration-repository-link'
import type { MarkovdServerFolderCatalog } from '../../ssh/markovd-server-folder-workspaces'

export type MarkovdManagedConversionArgs = {
  sshTargetId: string
  name: string
  censusHost?: ((target: SshTarget) => ReturnType<CensusHostRelayTerminals>) | null
  isBridgedPaneLease?: MarkovdMigrationPaneLeasePredicate
  destinationFor: (environment: KnownRuntimeEnvironment) => MarkovdMigrationDestinationCatalog
  /** Link matching host paths to existing server projects. */
  serverRepositoriesFor?: (
    environment: KnownRuntimeEnvironment
  ) => Promise<MarkovdServerRepository[]>
  /** Link folder workspaces already present from earlier moves. */
  serverFolderCatalogFor?: (
    environment: KnownRuntimeEnvironment
  ) => Promise<MarkovdServerFolderCatalog>
  releaseDirectSession?: (sshTargetId: string) => Promise<void>
  /** Re-enables moved automations that ran on this desktop. */
  serverAutomationEnablerFor?: (environment: KnownRuntimeEnvironment) => EnableServerAutomation
  now?: () => Date
  signal?: AbortSignal
}

export async function convertSshTargetToManagedMarkovd(
  userDataPath: string,
  args: MarkovdManagedConversionArgs
): Promise<MarkovdManagedConversionResult> {
  const fenced = await fenceOrResume(userDataPath, args)
  if ('outcome' in fenced) {
    return fenced
  }
  const deployed = await createManagedMarkovdEnvironment(userDataPath, {
    name: fenced.destinationName,
    sshTargetId: fenced.sshTargetId,
    migration: true,
    signal: args.signal
  })
  if (deployed.outcome === 'deferred') {
    return deployed // Retain fence and journal for a later resume.
  }
  const environment = listEnvironments(userDataPath).find(
    (entry) => entry.id === fenced.destinationEnvironmentId
  )
  if (!environment || !environmentMatchesManagedMarkovdCutover(environment, fenced)) {
    throw new Error('markovd_migration_destination_environment_mismatch')
  }
  // Record before commit so crashes cannot allow rollback across migrated state.
  recordManagedMarkovdMigration(
    userDataPath,
    environment.id,
    (args.now ?? (() => new Date()))().toISOString()
  )
  // Tunnel repair may replace pairing credentials; use its returned environment for every request.
  const marked = await ensureMarkovdManagedTunnel(userDataPath, environment.id)
  const { claims, targetStore } = requireManagedMarkovdInfrastructure()
  const store = targetStore.getMarkovdMigrationSource()
  const destination = args.destinationFor(marked)
  const serverRepositoriesFor = args.serverRepositoriesFor
  const serverFolderCatalogFor = args.serverFolderCatalogFor
  let linked: Pick<
    MarkovdMigrationSourceCutover,
    'linkedRepositoryIds' | 'linkedFolderWorkspaceIds'
  > = {}
  const committed = await runTargetLifecycle(fenced.sshTargetId, async () => {
    const journaled = requireJournaledCutover(userDataPath, fenced)
    const cutover = serverRepositoriesFor
      ? await linkServerHeldRepositories({
          userDataPath,
          store,
          claims,
          cutover: journaled,
          destination,
          serverRepositories: () => serverRepositoriesFor(marked),
          ...(serverFolderCatalogFor
            ? { serverFolderCatalog: () => serverFolderCatalogFor(marked) }
            : {}),
          now: args.now
        })
      : journaled
    linked = cutover
    return commitMarkovdMigrationDestination(
      {
        userDataPath,
        store,
        claims,
        source: linkedMarkovdMigrationCutoverPort({ userDataPath, store, claims, cutover }),
        destination,
        now: args.now
      },
      cutover.migrationId
    )
  })
  if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
    throw new Error(`markovd_migration_commit_not_proven:${committed.phase}`)
  }
  let automationsLeftDisabled = 0
  if (committed.phase === 'destination-committed') {
    await retainMarkovdMigrationSource(userDataPath, committed.migrationId, store, args.now)
    if (args.serverAutomationEnablerFor) {
      automationsLeftDisabled = await enableMovedMarkovdAutomations(
        userDataPath,
        committed.migrationId,
        args.serverAutomationEnablerFor(marked)
      ).catch((error: unknown) => {
        console.warn('[ssh] Could not re-enable moved automations:', error)
        return 0
      })
    }
  }
  const linkedProjects = linkedMarkovdMigrationProjects(store, linked)
  return {
    outcome: 'converted',
    environment: redactRuntimeEnvironment(marked),
    migrationId: committed.migrationId,
    ...(linkedProjects.length > 0 ? { linkedProjects } : {}),
    ...(automationsLeftDisabled > 0 ? { automationsLeftDisabled } : {})
  }
}

async function fenceOrResume(
  userDataPath: string,
  args: MarkovdManagedConversionArgs
): Promise<
  MarkovdMigrationSourceCutover | Extract<MarkovdManagedConversionResult, { outcome: 'refused' }>
> {
  const { claims, targetStore } = requireManagedMarkovdInfrastructure()
  const target = targetStore.getTarget(args.sshTargetId)
  if (!target) {
    return refuse('unverifiable', 'markovd_migration_target_not_found', 'The SSH host is gone.')
  }
  const store = targetStore.getMarkovdMigrationSource()
  const censusHost = args.censusHost
  const source = createSshRelayMigrationSource({
    userDataPath,
    store,
    claims,
    target,
    censusHost: censusHost ? () => censusHost(target) : null,
    isBridgedPaneLease: args.isBridgedPaneLease
  })
  const existing = source.resolveFence()
  if (existing.state === 'fenced') {
    return existing.cutover
  }
  const stale = existing.state === 'stale-journal' ? existing.cutover : null
  if (stale && !isRegistered(userDataPath, stale.destinationEnvironmentId)) {
    removeMarkovdMigrationJournalsForDestination(
      userDataPath,
      target.id,
      stale.destinationEnvironmentId
    )
  }
  const converted = listEnvironments(userDataPath).some(
    (environment) => getMarkovdSshDeployment(environment)?.sshTargetId === target.id
  )
  if (converted) {
    return refuse(
      'live',
      'markovd_migration_already_managed',
      'Markov already runs on this SSH host.'
    )
  }
  // Source fencing rechecks leases after acquisition.
  const terminalProof = await source.assessTerminals()
  if (terminalProof.verdict === 'live' || terminalProof.verdict === 'unverifiable') {
    return refuse(terminalProof.verdict, 'markovd_migration_terminals', terminalProof.reason)
  }
  source.retireProvenExitedTerminals(terminalProof)
  await args.releaseDirectSession?.(target.id)
  const result = await runTargetLifecycle(target.id, () =>
    source.acquireFence({
      destinationEnvironmentId: randomUUID(),
      destinationName: args.name,
      terminalProof,
      now: args.now,
      signal: args.signal
    })
  )
  if (result.outcome === 'fenced') {
    return result.cutover
  }
  if (result.blockers?.length) {
    // Surface blocked state in logs because connect shows only the summary reason.
    console.warn(
      '[ssh] Conversion refused by:',
      JSON.stringify(
        result.blockers.map((blocker) =>
          'dependencies' in blocker
            ? { code: blocker.code, dependencies: blocker.dependencies }
            : { code: blocker.code }
        )
      )
    )
  }
  const leavable =
    result.blockers &&
    onlyLeavableMarkovdMigrationBlockers(result.blockers) &&
    !target.managedServerLeaveBehind
  const canLeaveBehind =
    leavable &&
    leaveBehindClearsMarkovdMigrationBlockers(
      store,
      target.id,
      terminalProof.verdict === 'bridged' ? terminalProof.bridgedPtyIds : [],
      args.isBridgedPaneLease
    )
  if (leavable && terminalProof.verdict !== 'exited' && !canLeaveBehind) {
    // Leaving tabs behind would strand terminals still served by the legacy bridge.
    return refuse(
      result.verdict,
      result.code,
      `${result.reason} ${MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON}`
    )
  }
  return {
    ...refuse(result.verdict, result.code, result.reason),
    // Preview confirmation to avoid offering an export the confirmed path would refuse.
    ...(canLeaveBehind ? { canLeaveBehind: true } : {})
  }
}

function requireJournaledCutover(
  userDataPath: string,
  fenced: MarkovdMigrationSourceCutover
): MarkovdMigrationSourceCutover {
  const journaled = findMarkovdMigrationSourceCutoverForTarget(userDataPath, fenced.sshTargetId)
  if (journaled?.migrationId !== fenced.migrationId) {
    throw new Error('markovd_migration_source_fence_lost')
  }
  return journaled
}

function isRegistered(userDataPath: string, environmentId: string): boolean {
  return listEnvironments(userDataPath).some((environment) => environment.id === environmentId)
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<MarkovdManagedConversionResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
