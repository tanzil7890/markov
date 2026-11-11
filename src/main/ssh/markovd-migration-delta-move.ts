/** Journal only additions made after conversion to the same server; retain the full journal chain and source rows. Stage conflicts leave the changed mark and source intact; uncertain outcomes keep the journal for resume. */
import {
  MARKOVD_MIGRATION_SOURCE_CUTOVER_VERSION,
  type MarkovdMigrationSourceCutover
} from '../../shared/markovd-migration/markovd-migration-source-cutover'
import type { MarkovdDeltaMoveResult } from '../../shared/markovd-managed-runtime'
import { recordManagedMarkovdMigration } from '../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import type { KnownRuntimeEnvironment } from '../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../shared/ssh-types'
import type { Store } from '../persistence/loading-store/store'
import {
  abortMarkovdMigrationCutover,
  commitMarkovdMigrationDestination,
  type MarkovdMigrationCutoverContext,
  type MarkovdMigrationDestinationCatalog
} from './markovd-migration-cutover-coordinator'
import {
  findMarkovdMigrationSourceCutoverForTarget,
  listMarkovdMigrationCutoverChainForTarget,
  removeMarkovdMigrationSourceCutover,
  writeMarkovdMigrationSourceCutover
} from './markovd-migration-cutover-journal'
import {
  committedMarkovdMigrationChain,
  markovdDeltaSourceStore,
  planMarkovdDeltaMove,
  unfinishedMarkovdDelta,
  type MarkovdDeltaMovePlan
} from './markovd-migration-delta-plan'
import { assertMarkovdMigrationRequestFits } from './markovd-migration-manifest-export'
import { retainMarkovdMigrationSource } from './markovd-migration-source-retention'
import {
  assessMarkovdMigrationTerminals,
  type MarkovdMigrationTerminalVerdict,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from './markovd-migration-terminal-gate'
import {
  currentMarkovdSourceFingerprint,
  markovdCatalogFingerprint,
  unmovedMarkovdSourceRows,
  withKeptMarkovdSourceRows
} from './markovd-retained-source'
import { collectMarkovdMigrationSourceCatalog } from '../persistence/migrating-markovd-catalog/markovd-source-catalog'
import type { SshTargetMarkovdClaims } from './targets/ssh-target-markovd-claims'
import { markovdMigrationRefusalReason } from './markovd-migration-refusal-reason'
import { errorMessage } from '../../shared/error-message'

type MarkovdDeltaMoveArgs = {
  userDataPath: string
  store: Store
  claims: SshTargetMarkovdClaims
  target: SshTarget
  environment: KnownRuntimeEnvironment
  /** Build the destination after opening its tunnel: re-pairing during open can replace commit credentials. */
  connectDestination: () => Promise<MarkovdMigrationDestinationCatalog>
  /** Host census proves exit or identifies terminals preserved by the legacy bridge. */
  censusHost?: CensusHostRelayTerminals | null
  /** Serialize journal-through-commit with all other lifecycle changes to this host. */
  runTargetLifecycle: <T>(targetId: string, operation: () => Promise<T>) => Promise<T>
  now?: () => Date
}

export async function runMarkovdDeltaMove(
  args: MarkovdDeltaMoveArgs
): Promise<MarkovdDeltaMoveResult> {
  const { userDataPath, store, target } = args
  const now = args.now ?? (() => new Date())
  const plan = planMarkovdDeltaMove(userDataPath, store, target, { now })
  // Capture baseline with the manifest before awaiting so both describe the same source.
  const planned = currentMarkovdSourceFingerprint(store, target)
  if (!plan.resumes && plan.added.length === 0) {
    return refuse('markovd_delta_nothing_new', 'An older build added nothing new to move.')
  }
  if (plan.blockers.length > 0) {
    return {
      ...refuse(
        'markovd_migration_preflight_blocked',
        markovdMigrationRefusalReason(plan.blockers)
      ),
      blockers: plan.blockers
    }
  }
  if (!plan.resumes) {
    // Reject before journaling or an unsendable delta could pin the fence permanently.
    assertMarkovdMigrationRequestFits({ manifest: plan.manifest })
  }
  const terminals = await assessMarkovdMigrationTerminals(store, target.id, args.censusHost)
  if (terminals.verdict !== 'exited' && terminals.verdict !== 'bridged') {
    return refuse('markovd_migration_terminals', terminals.reason)
  }
  const settled: SettledTerminals = terminals
  retireProvenExitedLeases(store, target.id, terminals)
  return args.runTargetLifecycle(target.id, async () => {
    // Another move may have journaled or finished while waiting for the lifecycle lock.
    const changedAt = store.getSshTarget(target.id)?.markovdFence?.sourceChangedAt
    const head = findMarkovdMigrationSourceCutoverForTarget(userDataPath, target.id)
    if (!changedAt || head?.migrationId !== (plan.resumes ?? plan.head).migrationId) {
      return refuse('markovd_delta_superseded', 'Another move of this host ran first.')
    }
    // Source remains writable before fencing; edits during census must not silently become the manifest's baseline.
    if (!plan.resumes && planned !== currentMarkovdSourceFingerprint(store, target)) {
      return refuse(
        'markovd_delta_source_changed',
        'This host changed while the move was starting. Try the move again.'
      )
    }
    const cutover = plan.resumes ?? journalDelta(args, plan, planned, settled, now)
    return commitDelta(args, plan, cutover, changedAt, now)
  })
}

type SettledTerminals = Extract<MarkovdMigrationTerminalVerdict, { verdict: 'exited' | 'bridged' }>

function journalDelta(
  args: MarkovdDeltaMoveArgs,
  plan: MarkovdDeltaMovePlan,
  planned: string,
  terminals: SettledTerminals,
  now: () => Date
): MarkovdMigrationSourceCutover {
  const timestamp = now().toISOString()
  const cutover: MarkovdMigrationSourceCutover = {
    version: MARKOVD_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: plan.manifest.migrationId,
    phase: 'source-fenced',
    startedAt: timestamp,
    updatedAt: timestamp,
    destinationEnvironmentId: plan.environmentId,
    destinationName: plan.head.destinationName,
    sshTargetId: args.target.id,
    sshTargetGeneration: plan.head.sshTargetGeneration,
    manifestSha256: plan.manifest.manifestSha256,
    provenPtyIds: terminals.verdict === 'exited' ? terminals.provenPtyIds : [],
    // COMPAT(legacy-relay-bridge): a move leaves relay terminals running for the bridge too.
    ...(terminals.verdict === 'bridged' ? { bridgedPtyIds: terminals.bridgedPtyIds } : {}),
    supersedesMigrationId: plan.head.migrationId,
    // Retained rows must match the whole source captured with this manifest.
    sourceBaselineFingerprint: planned,
    manifest: plan.manifest
  }
  writeMarkovdMigrationSourceCutover(args.userDataPath, cutover)
  return cutover
}

async function commitDelta(
  args: MarkovdDeltaMoveArgs,
  plan: MarkovdDeltaMovePlan,
  cutover: MarkovdMigrationSourceCutover,
  changedAt: string,
  now: () => Date
): Promise<MarkovdDeltaMoveResult> {
  const { userDataPath, store, target } = args
  // Clear the changed mark and freeze source for the move.
  store.updateSshTarget(target.id, { markovdFence: { environmentId: plan.environmentId } })
  await args.claims.flush()
  // Record before any new/resumed commit so rollback cannot cross the migration.
  recordManagedMarkovdMigration(userDataPath, plan.environmentId, now().toISOString())
  let destination: MarkovdMigrationDestinationCatalog
  try {
    destination = await args.connectDestination()
  } catch (error) {
    // No request reached the server; keep the journal for later resume.
    await restoreChangedMark(args, cutover, changedAt)
    throw error
  }
  const context: MarkovdMigrationCutoverContext = {
    userDataPath,
    store: plan.source,
    freshSource: () => markovdDeltaSourceStore(store, target, plan.moved, cutover.manifest),
    claims: args.claims,
    destination,
    now
  }
  try {
    const committed = await commitMarkovdMigrationDestination(context, cutover.migrationId)
    if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
      throw new Error(`markovd_migration_commit_not_proven:${committed.phase}`)
    }
  } catch (error) {
    const released = await releaseUncommittedDelta(args, context, cutover, changedAt)
    if (released === 'released') {
      return refuse('markovd_delta_refused_by_server', errorMessage(error))
    }
    if (released === 'kept') {
      throw error
    }
  }
  await retainMarkovdMigrationSource(userDataPath, cutover.migrationId, store, now)
  return { outcome: 'moved', migrationId: cutover.migrationId }
}

/** Release only on proven destination absence; otherwise retain journal for resume. Restore the host's changed mark either way. */
async function releaseUncommittedDelta(
  args: MarkovdDeltaMoveArgs,
  context: MarkovdMigrationCutoverContext,
  cutover: MarkovdMigrationSourceCutover,
  changedAt: string
): Promise<'released' | 'committed' | 'kept'> {
  const restoreMark = (): Promise<void> => restoreChangedMark(args, cutover, changedAt)
  try {
    const result = await abortMarkovdMigrationCutover(context, cutover.migrationId, async () => {
      // Restore the mark first so a crash during journal removal leaves a resumable marked host.
      await restoreMark()
      removeMarkovdMigrationSourceCutover(args.userDataPath, cutover.migrationId)
    })
    return result.outcome === 'released' ? 'released' : 'committed'
  } catch {
    await restoreMark()
    return 'kept'
  }
}

async function restoreChangedMark(
  args: Pick<MarkovdDeltaMoveArgs, 'store' | 'claims'>,
  cutover: MarkovdMigrationSourceCutover,
  changedAt: string
): Promise<void> {
  args.store.updateSshTarget(cutover.sshTargetId, {
    markovdFence: { environmentId: cutover.destinationEnvironmentId, sourceChangedAt: changedAt }
  })
  await args.claims.flush()
}

/** Keep older-build changes only in retained profile rows. */
export async function keepMarkovdServerVersion(args: {
  userDataPath: string
  store: Store
  claims: SshTargetMarkovdClaims
  target: SshTarget
}): Promise<void> {
  const environmentId = args.target.markovdFence?.environmentId
  const chain = listMarkovdMigrationCutoverChainForTarget(args.userDataPath, args.target.id)
  if (unfinishedMarkovdDelta(chain)) {
    // Unfinished moves may already have copied rows; only commit/abort can decide.
    throw new Error('markovd_delta_move_unfinished')
  }
  const head = committedMarkovdMigrationChain(chain).at(-1)
  if (!environmentId || !args.target.markovdFence?.sourceChangedAt || !head) {
    throw new Error('markovd_delta_not_changed')
  }
  const current = collectMarkovdMigrationSourceCatalog(args.store, args.target)
  const unmoved = unmovedMarkovdSourceRows(current, committedMarkovdMigrationChain(chain))
  writeMarkovdMigrationSourceCutover(args.userDataPath, {
    ...withKeptMarkovdSourceRows(head, unmoved),
    // Explicit reconcile accepts the current retained source as the new baseline.
    sourceBaselineFingerprint: markovdCatalogFingerprint(current)
  })
  args.store.updateSshTarget(args.target.id, { markovdFence: { environmentId } })
  await args.claims.flush()
}

function refuse(
  code: string,
  reason: string
): Extract<MarkovdDeltaMoveResult, { outcome: 'refused' }> {
  return { outcome: 'refused', code, reason }
}
