import {
  planManagedMarkovdAutoUpdate,
  type ManagedMarkovdAutoUpdateSkip
} from './markovd-managed-update-decision'
import { MarkovdCrashLoopError } from './markovd-managed-crash-loop'
import { materializeMarkovdArtifact } from '../../markovd/markovd-artifact-materializer'
import {
  MarkovdArtifactsUnavailableError,
  MarkovdHostUnsupportedError
} from '../../markovd/markovd-host-unavailable'
import { findIncompleteManagedMarkovdMigration } from './markovd-managed-migration-status'
import { MARKOVD_ACTIVATION_FENCE_BUSY_CODE } from '../activation/markovd-activation-fence-hold'
import { resolveLinkedMarkovdContext } from './markovd-managed-runtime-context'
import {
  runManagedMarkovdUpdate,
  withManagedMarkovdLifecycle
} from '../../ssh/markovd-runtime-maintenance'
import type { MarkovdUpdateDeferCode } from '../../ssh/markovd-update-plan'
import { readLocalFullVersion } from '../install/remote-versioned-install'

export type ManagedMarkovdAutoUpdateOutcome =
  | { outcome: 'skipped'; reason: ManagedMarkovdAutoUpdateSkip }
  | { outcome: 'updated'; activeVersion: string }
  | { outcome: 'deferred'; code: string; reason: string }
  /** Candidate rejection or update failure; consult host state before assuming the incumbent serves. */
  | { outcome: 'failed'; reason: string }

const WAITING_CODES: ReadonlySet<string> = new Set<
  MarkovdUpdateDeferCode | typeof MARKOVD_ACTIVATION_FENCE_BUSY_CODE
>([
  MARKOVD_ACTIVATION_FENCE_BUSY_CODE,
  'markovd_update_terminals_running',
  'markovd_update_terminal_census_unavailable',
  'markovd_update_strands_live_terminals',
  'markovd_update_daemon_protocol_unverifiable',
  'markovd_update_ends_in_process_terminals'
])

/** Temporary deferrals retry on later connects; interrupted activations require recovery. */
export function isWaitingMarkovdUpdateDeferral(code: string): boolean {
  return WAITING_CODES.has(code)
}

export function autoUpdateManagedMarkovdEnvironment(
  userDataPath: string,
  args: {
    environmentId: string
    appVersion: string
    /** Read under the lifecycle lock to observe prior overlapping attempts. */
    failedBefore: () => boolean
    onUpdating: () => void
  }
): Promise<ManagedMarkovdAutoUpdateOutcome> {
  return withManagedMarkovdLifecycle(userDataPath, args.environmentId, async (managed) => {
    // Restarting during migration would race cutover staging.
    if (findIncompleteManagedMarkovdMigration(userDataPath, managed.environment.id)) {
      return { outcome: 'skipped', reason: 'migrating' }
    }
    const context = await resolveLinkedMarkovdContext(managed.environment, managed.deployment)
    const candidateVersion = await bundledManagedMarkovdVersion(context.serverTarget)
    const plan = planManagedMarkovdAutoUpdate({
      record: context.activationRecord,
      candidateVersion,
      appVersion: args.appVersion,
      failedBefore: args.failedBefore()
    })
    if (plan.action === 'skip') {
      return { outcome: 'skipped', reason: plan.reason }
    }
    args.onUpdating()
    let lockedSkip: ManagedMarkovdAutoUpdateSkip | null = null
    try {
      const result = await runManagedMarkovdUpdate(userDataPath, managed, context, {
        // Another desktop may activate or stop a newer build during upload; recheck under the fence.
        admitRecord: (record) => {
          const locked = planManagedMarkovdAutoUpdate({
            record,
            candidateVersion,
            appVersion: args.appVersion,
            failedBefore: false
          })
          if (locked.action === 'update') {
            return null
          }
          lockedSkip = locked.reason
          return `Auto-update skipped under the host fence: ${locked.reason}.`
        }
      })
      if (lockedSkip) {
        return { outcome: 'skipped', reason: lockedSkip }
      }
      if (result.outcome !== 'deferred') {
        return { outcome: 'updated', activeVersion: result.activeVersion }
      }
      return isWaitingMarkovdUpdateDeferral(result.code)
        ? { outcome: 'deferred', code: result.code, reason: result.reason }
        : { outcome: 'failed', reason: result.reason }
    } catch (error) {
      // The host already runs this build; the brake's reason shows on its server status instead.
      if (error instanceof MarkovdCrashLoopError) {
        return { outcome: 'skipped', reason: 'current' }
      }
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  })
}

type MarkovdTarget = Parameters<typeof materializeMarkovdArtifact>[0]

// Packaged templates cannot change during this session; avoid repeated hashing.
const bundledVersions = new Map<MarkovdTarget, Promise<string | null>>()

/** This build's markovd version for `target`; null when the build bundles none for it. */
export function bundledManagedMarkovdVersion(target: MarkovdTarget): Promise<string | null> {
  let version = bundledVersions.get(target)
  if (!version) {
    version = materializeMarkovdArtifact(target).then(readLocalFullVersion, (error: unknown) => {
      if (
        error instanceof MarkovdHostUnsupportedError ||
        error instanceof MarkovdArtifactsUnavailableError
      ) {
        return null
      }
      throw error
    })
    // A transient local failure must not stick for the session.
    version.catch(() => bundledVersions.delete(target))
    bundledVersions.set(target, version)
  }
  return version
}

export function resetBundledMarkovdVersionsForTests(): void {
  bundledVersions.clear()
}
