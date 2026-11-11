/** Restore changed state only after proven slot exit and operator consent: a launched RPC server may have created terminals the stopped host cannot census, making the snapshot stale. Use the same rule for failure and crash recovery. */
import { execMarkovdStateMutation } from '../managed-server/host-state/markovd-state-mutation-exec'
import { markovdRemoteBaseDir } from '../managed-server/install/markovd-remote-windows-node'
import type { ServeReadiness } from '../server/serve-readiness'
import { RELAY_REMOTE_DIR } from './remote-exec/remote-frame-protocol'
import { MARKOVD_STATE_SNAPSHOT_DIR } from '../managed-server/activation/markovd-activation-record'
import type { MarkovdSnapshotVerdict } from '../managed-server/activation/markovd-activation-transaction'
import {
  clearMarkovdStateSnapshotMembersCommand,
  compareMarkovdStateSnapshotCommand,
  markovdSnapshotIsUnchanged,
  parseMarkovdSnapshotRestore,
  restoreMarkovdStateSnapshotCommand
} from '../managed-server/host-state/markovd-state-snapshot'
import { execMarkovdRemote } from '../managed-server/install/markovd-remote-runtime-control'
import {
  ensureMarkovdSlotServing,
  launchMarkovdSlot,
  quiesceInterruptedMarkovdSlot,
  type MarkovdSlotIdentity,
  type MarkovdSlotOptions
} from './markovd-recovery-slot'
import { joinRemotePath } from './ssh-remote-platform'
import { MARKOVD_RECOVERY_CHANGED_STATE_CODE } from '../../shared/markovd-managed-runtime'

export type MarkovdIncumbentRecoveryOptions = MarkovdSlotOptions & {
  /** The operator accepted restoring the snapshot over state a launched build changed. */
  acceptChangedState?: boolean
}

type MarkovdIncumbentRecovery =
  | { outcome: 'restored'; readiness: ServeReadiness | null }
  | { outcome: 'refused'; verdict: 'live' | 'unverifiable'; code: string; reason: string }

export function markovdSnapshotPath(options: MarkovdSlotOptions, dirName: string): string {
  return joinRemotePath(
    options.host,
    options.remoteHome,
    RELAY_REMOTE_DIR,
    MARKOVD_STATE_SNAPSHOT_DIR,
    dirName
  )
}

/** Unverifiable steps throw so the caller retains the fence. */
export async function recoverMarkovdIncumbent(
  options: MarkovdIncumbentRecoveryOptions,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: MarkovdSlotIdentity | null
    restoreState: MarkovdSnapshotVerdict | null
    /** Rollback may restore a different snapshot from the launched slot's starting state. */
    launchedFromState?: MarkovdSnapshotVerdict | null
    /** This run itself proved both slots exited, so no fresh liveness probe is needed. */
    slotsProvenExited?: boolean
  }
): Promise<MarkovdIncumbentRecovery> {
  const quiescence =
    input.slotsProvenExited || !input.restoreState
      ? 'exited'
      : await quiesceInterruptedMarkovdSlot(options, input.launchedVersion, input.incumbent)
  // With no incumbent there is no older reader to protect; the record names nothing to serve.
  if (quiescence === 'exited' && input.restoreState && input.incumbent) {
    const decision = input.launchedVersion
      ? await decideChangedStateRestore(options, input.launchedFromState ?? input.restoreState)
      : 'restore'
    if (decision !== 'restore' && decision !== 'unchanged') {
      return decision
    }
    // A launched slot that left its starting state untouched still sits on a root to replace.
    if (decision === 'restore' || input.launchedFromState) {
      await restoreState(options, input.restoreState)
    }
  }
  if (!input.incumbent) {
    return { outcome: 'restored', readiness: null }
  }
  return {
    outcome: 'restored',
    readiness: input.slotsProvenExited
      ? await launchMarkovdSlot(options, input.incumbent)
      : await ensureMarkovdSlotServing(options, input.incumbent)
  }
}

async function decideChangedStateRestore(
  options: MarkovdIncumbentRecoveryOptions,
  state: MarkovdSnapshotVerdict
): Promise<'unchanged' | 'restore' | Extract<MarkovdIncumbentRecovery, { outcome: 'refused' }>> {
  if (state.state === 'captured') {
    const snapshotDir = markovdSnapshotPath(options, state.dirName)
    // A lost read-only comparison can conservatively mean changed.
    const comparison = await execMarkovdRemote(
      options,
      compareMarkovdStateSnapshotCommand(
        options.host,
        options.userDataDir,
        snapshotDir,
        markovdRemoteBaseDir(options.host, options.remoteHome)
      )
    ).catch(() => '')
    if (markovdSnapshotIsUnchanged(comparison)) {
      return 'unchanged'
    }
  }
  if (options.acceptChangedState) {
    return 'restore'
  }
  const retained =
    state.state === 'captured' ? ` at ${markovdSnapshotPath(options, state.dirName)}` : ''
  return {
    outcome: 'refused',
    verdict: 'unverifiable',
    code: MARKOVD_RECOVERY_CHANGED_STATE_CODE,
    reason:
      'The launched build is stopped, but it changed profile state (or the change could not be ' +
      'checked), so the previous build was not restarted against it and this host serves ' +
      'nothing. Recover to restore the prelaunch snapshot' +
      `${retained} and restart the previous build; terminals the launched build started keep ` +
      'running but drop out of the restored state.'
  }
}

async function restoreState(
  options: MarkovdSlotOptions,
  state: MarkovdSnapshotVerdict
): Promise<void> {
  if (state.state === 'pending') {
    throw new Error('The interrupted transaction has no durable snapshot verdict.')
  }
  const command =
    state.state === 'captured'
      ? restoreMarkovdStateSnapshotCommand(
          options.host,
          options.userDataDir,
          markovdSnapshotPath(options, state.dirName),
          markovdRemoteBaseDir(options.host, options.remoteHome)
        )
      : clearMarkovdStateSnapshotMembersCommand(
          options.host,
          options.userDataDir,
          markovdRemoteBaseDir(options.host, options.remoteHome)
        )
  const restored = parseMarkovdSnapshotRestore(await execMarkovdStateMutation(options, command))
  if (restored !== 'restored') {
    throw new Error(`The prelaunch state could not be restored (${restored}).`)
  }
}
