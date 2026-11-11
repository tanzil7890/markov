/** Persist journal, fence, then profile flush before remote calls. Crashes may leave a non-authoritative stale journal; a fence without a journal requires destination evidence before release. */
import { randomUUID } from 'node:crypto'
import { getManagedMarkovdFenceEnvironmentId } from '../../shared/managed-markovd-ssh-owner'
import type { MarkovdMigrationBlocker } from '../../shared/markovd-migration/markovd-migration-preflight'
import {
  MARKOVD_MIGRATION_SOURCE_CUTOVER_VERSION,
  type MarkovdMigrationSourceCutover
} from '../../shared/markovd-migration/markovd-migration-source-cutover'
import type { SshTarget } from '../../shared/ssh-types'
import {
  assertMarkovdMigrationRequestFits,
  createMarkovdMigrationManifest
} from './markovd-migration-manifest-export'
import {
  findMarkovdMigrationSourceCutoverForTarget,
  removeMarkovdMigrationSourceCutover,
  writeMarkovdMigrationSourceCutover
} from './markovd-migration-cutover-journal'
import {
  confirmMarkovdMigrationTerminalsUnderFence,
  type MarkovdMigrationTerminalVerdict
} from './markovd-migration-terminal-gate'
import type { SshTargetMarkovdClaims } from './targets/ssh-target-markovd-claims'
import {
  isBlockingMarkovdMigrationBlocker,
  preflightMarkovdMigrationExport,
  type MarkovdMigrationPreflightStore
} from './targets/ssh-target-markovd-preflight'
import { markovdMigrationRefusalReason } from './markovd-migration-refusal-reason'
import {
  preservesMarkovdMigrationBridgedPanes,
  type MarkovdMigrationPaneLeasePredicate
} from './markovd-migration-bridged-panes'

export const MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS = 'markovd_migration_leave_behind_terminals'
export const MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON =
  'Move anyway needs every terminal on this host closed first, and Markov could not confirm they all exited. Close them, or end them on the host, then connect again.'

export type MarkovdMigrationFenceState =
  | { state: 'none' }
  | { state: 'fenced'; cutover: MarkovdMigrationSourceCutover }
  /** Empty-host deploys record provisioning intent instead of a migration journal. */
  | { state: 'owned-by-deploy'; environmentId: string }
  /** Unexplained ownership requires recovery, never automatic release. */
  | { state: 'fenced-unverifiable'; environmentId: string }
  /** Stale journals grant no staging authority. */
  | { state: 'stale-journal'; cutover: MarkovdMigrationSourceCutover }

/** Throws when the journal cannot be read: an unreadable record keeps the host fenced. */
export function resolveMarkovdMigrationFence(
  userDataPath: string,
  target: SshTarget
): MarkovdMigrationFenceState {
  const cutover = findMarkovdMigrationSourceCutoverForTarget(userDataPath, target.id)
  const ownerEnvironmentId = getManagedMarkovdFenceEnvironmentId(target)
  if (cutover) {
    return ownerEnvironmentId === cutover.destinationEnvironmentId &&
      target.generation === cutover.sshTargetGeneration
      ? { state: 'fenced', cutover }
      : { state: 'stale-journal', cutover }
  }
  if (!ownerEnvironmentId) {
    return { state: 'none' }
  }
  return target.markovdProvisioning
    ? { state: 'owned-by-deploy', environmentId: ownerEnvironmentId }
    : { state: 'fenced-unverifiable', environmentId: ownerEnvironmentId }
}

export type MarkovdMigrationFenceResult =
  | { outcome: 'fenced'; cutover: MarkovdMigrationSourceCutover; resumed: boolean }
  | {
      outcome: 'refused'
      verdict: 'live' | 'unverifiable'
      code: string
      reason: string
      blockers?: MarkovdMigrationBlocker[]
    }

export async function fenceMarkovdMigrationSource(args: {
  userDataPath: string
  store: MarkovdMigrationPreflightStore
  claims: SshTargetMarkovdClaims
  targetId: string
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: MarkovdMigrationTerminalVerdict
  isBridgedPaneLease?: MarkovdMigrationPaneLeasePredicate
  now?: () => Date
  signal?: AbortSignal
}): Promise<MarkovdMigrationFenceResult> {
  const target = args.store.getSshTarget(args.targetId)
  if (!target) {
    return refuse('unverifiable', 'markovd_migration_target_not_found', 'The SSH host is gone.')
  }
  const existing = resolveMarkovdMigrationFence(args.userDataPath, target)
  if (existing.state === 'fenced') {
    return existing.cutover.destinationEnvironmentId === args.destinationEnvironmentId
      ? { outcome: 'fenced', cutover: existing.cutover, resumed: true }
      : refuse('live', 'markovd_migration_in_progress', 'Another migration holds this SSH host.')
  }
  if (existing.state !== 'none') {
    return refuse(
      'unverifiable',
      `markovd_migration_${existing.state.replaceAll('-', '_')}`,
      fenceStateReason(existing)
    )
  }
  const proof = args.terminalProof
  if (proof.verdict !== 'exited' && proof.verdict !== 'bridged') {
    return refuse(proof.verdict, 'markovd_migration_terminals', proof.reason)
  }
  const preflight = preflightMarkovdMigrationExport(
    args.store,
    target.id,
    undefined,
    proof.verdict === 'bridged' ? proof.bridgedPtyIds : []
  )
  if (!preflight.claimable) {
    return {
      ...refuse(
        // Only a proven blocker reads live; one that is merely unanswered stays unverifiable.
        preflight.blockers
          .filter(isBlockingMarkovdMigrationBlocker)
          .every((blocker) => blocker.category === 'live-or-unverifiable')
          ? 'unverifiable'
          : 'live',
        'markovd_migration_preflight_blocked',
        markovdMigrationRefusalReason(preflight.blockers)
      ),
      blockers: preflight.blockers
    }
  }
  const generation = args.claims.ensureGeneration(target.id)
  const now = (args.now ?? (() => new Date()))().toISOString()
  const manifest = createMarkovdMigrationManifest(
    args.store,
    { ...target, generation },
    { migrationId: randomUUID(), destinationEnvironmentId: args.destinationEnvironmentId }
  )
  if (
    proof.verdict === 'bridged' &&
    target.managedServerLeaveBehind &&
    !preservesMarkovdMigrationBridgedPanes(
      manifest.payload,
      args.store.getSshRemotePtyLeases(target.id),
      proof.bridgedPtyIds,
      args.isBridgedPaneLease
    )
  ) {
    return refuse(
      proof.relayVerdict,
      MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS,
      MARKOVD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON
    )
  }
  // Reject before journaling so an unsendable manifest cannot pin the fence.
  assertMarkovdMigrationRequestFits({ manifest })
  const cutover: MarkovdMigrationSourceCutover = {
    version: MARKOVD_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: manifest.migrationId,
    phase: 'source-fenced',
    startedAt: now,
    updatedAt: now,
    destinationEnvironmentId: args.destinationEnvironmentId,
    destinationName: args.destinationName,
    sshTargetId: target.id,
    sshTargetGeneration: generation,
    manifestSha256: manifest.manifestSha256,
    provenPtyIds: proof.verdict === 'exited' ? proof.provenPtyIds : [],
    ...(proof.verdict === 'bridged' ? { bridgedPtyIds: proof.bridgedPtyIds } : {}),
    // Capture before commit; this journaled export is the evidence of what the destination receives.
    manifest
  }
  writeMarkovdMigrationSourceCutover(args.userDataPath, cutover)
  args.claims.fenceForMigration(target.id, args.destinationEnvironmentId, generation)
  await args.claims.flush(args.signal)
  // Recheck under fence for terminals started after the original proof.
  const underFence = confirmMarkovdMigrationTerminalsUnderFence(
    args.store,
    target.id,
    args.terminalProof
  )
  if (underFence.verdict !== 'exited' && underFence.verdict !== 'bridged') {
    await releaseUnstagedFence(args, cutover)
    return refuse(underFence.verdict, 'markovd_migration_terminals', underFence.reason)
  }
  return { outcome: 'fenced', cutover, resumed: false }
}

type FenceReleaseArgs = {
  userDataPath: string
  claims: SshTargetMarkovdClaims
  signal?: AbortSignal
}

async function releaseUnstagedFence(
  args: FenceReleaseArgs,
  cutover: MarkovdMigrationSourceCutover
): Promise<void> {
  if (cutover.phase !== 'source-fenced') {
    throw new Error('markovd_migration_fence_release_after_stage')
  }
  await releaseMarkovdMigrationFence(args, cutover)
}

/** Drop owner before journal so an interrupted release leaves a harmless stale journal, never unexplained ownership. */
export async function releaseMarkovdMigrationFence(
  args: FenceReleaseArgs,
  cutover: MarkovdMigrationSourceCutover
): Promise<void> {
  args.claims.release(cutover.sshTargetId, cutover.destinationEnvironmentId)
  await args.claims.flush(args.signal)
  removeMarkovdMigrationSourceCutover(args.userDataPath, cutover.migrationId)
}

/** Unregistered destinations could stage nothing; registered destinations must prove durable abort instead. */
export async function releaseUndeployedMigrationFence(args: {
  userDataPath: string
  claims: SshTargetMarkovdClaims
  targetId: string
  isDestinationRegistered: (environmentId: string) => boolean
  signal?: AbortSignal
}): Promise<'released' | 'none'> {
  const cutover = findMarkovdMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  if (!cutover) {
    return 'none'
  }
  if (args.isDestinationRegistered(cutover.destinationEnvironmentId)) {
    throw new Error('markovd_migration_destination_registered')
  }
  await releaseUnstagedFence(args, cutover)
  return 'released'
}

function fenceStateReason(state: MarkovdMigrationFenceState): string {
  switch (state.state) {
    case 'owned-by-deploy':
      return 'Markov already runs on this SSH host.'
    case 'fenced-unverifiable':
      return 'This SSH host is held for a migration whose record is missing. Recover it from this host’s Markov server first.'
    case 'stale-journal':
      return 'A migration record names this SSH host but its fence is gone. Resolve that migration first.'
    case 'fenced':
    case 'none':
      return 'This SSH host is not in a state a migration can start from.'
  }
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<MarkovdMigrationFenceResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
