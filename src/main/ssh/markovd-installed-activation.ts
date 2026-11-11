/** Journal durably before mutation so interrupted deploys can finish or recover. Release the fence only once the host is provably settled on one slot. */
import { markovdRemoteBaseDir } from '../managed-server/install/markovd-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type { MarkovdDeployOptions, MarkovdDeployResult } from './markovd-remote-deploy'
import { isUnconfirmedSshCommandTermination } from './remote-exec/remote-exec-command'
import {
  withActivatedVersion,
  type MarkovdStateSnapshot
} from '../managed-server/activation/markovd-activation-record'
import {
  readMarkovdActivationRecord,
  writeMarkovdActivationRecord
} from '../managed-server/activation/markovd-activation-record-store'
import { launchAndJudgeMarkovdSlot } from './markovd-candidate-launch-verdict'
import { planMarkovdUpdate } from './markovd-update-plan'
import type { MarkovdTerminalCensus } from '../../shared/markovd-terminal-census'
import { censusForLockedRecord, countedLockedRecord } from './markovd-locked-record-census'
import { runFencedStop } from './markovd-fenced-stop'
import {
  censusNeedsHostDaemonProtocols,
  CURRENT_MARKOVD_DAEMON_PROTOCOL
} from './markovd-daemon-protocol-crossing'
import { MARKOVD_LOG_FILENAME } from '../managed-server/install/markovd-remote-host-support'
import { markovdSnapshotFailureReason } from '../managed-server/host-state/markovd-state-snapshot-space'
import {
  MARKOVD_SNAPSHOT_SPACE_INSUFFICIENT_CODE,
  markovdSnapshotRoomRefusal,
  markovdSnapshotsRoot
} from './markovd-snapshot-room'
import {
  captureMarkovdStateSnapshotCommand,
  markovdSnapshotDirName,
  parseMarkovdSnapshotCapture
} from '../managed-server/host-state/markovd-state-snapshot'
import { joinRemotePath } from './ssh-remote-platform'
import { computeLocalMarkovdBuildHash } from './markovd-local-build-hash'
import { preflightMarkovdCandidate } from './markovd-candidate-preflight'
import type { MarkovdActivationLockControl } from '../managed-server/activation/markovd-activation-lock'
import type { MarkovdActivateTransaction } from '../managed-server/activation/markovd-activation-transaction'
import {
  createMarkovdActivationTransaction,
  withMarkovdActivationCandidateReady,
  withMarkovdActivationIncumbentStopped,
  withMarkovdActivationSnapshot
} from '../managed-server/activation/markovd-activation-transaction-transitions'
import { writeMarkovdActivationTransaction } from '../managed-server/activation/markovd-activation-transaction-store'
import {
  execMarkovdRemoteOr,
  withoutAbortSignal
} from '../managed-server/install/markovd-remote-runtime-control'
import { execMarkovdStateMutationOr } from '../managed-server/host-state/markovd-state-mutation-exec'
import {
  initialMarkovdActivationAdmissionCommand,
  parseInitialMarkovdActivationAdmission
} from './markovd-initial-activation-admission'
import {
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  type MarkovdSlotIdentity
} from './markovd-recovery-slot'
import { markovdSnapshotPath } from './markovd-incumbent-recovery'
import {
  restartAfterSnapshotFailure,
  restoreAfterRejectedCandidate,
  stopTransactionIncumbent
} from './markovd-transaction-incumbent'
import { withMarkovdLogTail } from '../managed-server/install/markovd-remote-log-tail'
import { markovdCandidateLaunchFailureCode } from '../markovd/markovd-host-unavailable'
import { errorMessage } from '../../shared/error-message'

type Outcome = Extract<MarkovdDeployResult, { outcome: 'installed-not-activated' }>

export const MARKOVD_ACTIVATION_POLICY_REFUSED_CODE = 'markovd_activation_policy_refused'

export async function activateInstalledMarkovd(
  options: MarkovdDeployOptions & { localMarkovdDir: string },
  fullVersion: string,
  remoteDir: string,
  lock: MarkovdActivationLockControl
): Promise<MarkovdDeployResult> {
  const now = options.now ?? ((): Date => new Date())
  const notActivated = (code: string, reason: string, startCheckFailed?: true): Outcome => ({
    outcome: 'installed-not-activated',
    fullVersion,
    code,
    reason,
    ...(startCheckFailed ? { startCheckFailed } : {})
  })
  const record = await readMarkovdActivationRecord(options)
  const planFor = (
    census: MarkovdTerminalCensus,
    hostDaemonProtocols?: readonly number[]
  ): ReturnType<typeof planMarkovdUpdate> =>
    planMarkovdUpdate({
      record,
      candidateVersion: fullVersion,
      census,
      candidateDaemonProtocol: CURRENT_MARKOVD_DAEMON_PROTOCOL,
      ...(hostDaemonProtocols ? { hostDaemonProtocols } : {}),
      ...(options.force !== undefined ? { force: options.force } : {})
    })
  const census = censusForLockedRecord(options, record)
  let plan = planFor(census)
  if (plan.action === 'noop') {
    return { outcome: 'already-active', fullVersion }
  }
  const refusal = options.admitRecord?.(record, fullVersion)
  if (refusal) {
    return notActivated(MARKOVD_ACTIVATION_POLICY_REFUSED_CODE, refusal)
  }
  // Hosts predating the census protocol set cannot name mixed generations; the candidate can.
  const asksCandidate = censusNeedsHostDaemonProtocols(census)
  if (
    plan.action === 'defer' &&
    !(asksCandidate && plan.code === 'markovd_update_daemon_protocol_unverifiable')
  ) {
    return notActivated(plan.code, plan.reason)
  }
  const preflight = await preflightMarkovdCandidate(
    { ...options, remoteInstallDir: remoteDir, fullVersion },
    asksCandidate
  )
  if ('failure' in preflight) {
    return notActivated('markovd_candidate_preflight_failed', preflight.failure, true)
  }
  const { hostDaemonProtocols } = preflight
  plan = planFor(census, hostDaemonProtocols)
  if (plan.action === 'defer') {
    return notActivated(plan.code, plan.reason)
  }

  let incumbent: MarkovdSlotIdentity | null = null
  if (record.active) {
    try {
      incumbent = await resolveMarkovdSlotIdentity(options, record.active)
    } catch (error) {
      if (isUnconfirmedSshCommandTermination(error)) {
        throw error
      }
      return notActivated(
        'markovd_incumbent_identity_unverifiable',
        `The active markovd ${record.active} build identity could not be verified before ` +
          `stopping it: ${errorMessage(error)} Nothing was stopped.`
      )
    }
  } else {
    const admission = parseInitialMarkovdActivationAdmission(
      await execMarkovdRemoteOr(
        options,
        initialMarkovdActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    if (admission.decision === 'defer') {
      return notActivated(admission.code, admission.reason)
    }
  }

  // Scan snapshot room before recount so slow scans cannot outdate stop admission.
  const roomless = await markovdSnapshotRoomRefusal(options, record, fullVersion)
  if (roomless) {
    return notActivated(MARKOVD_SNAPSHOT_SPACE_INSUFFICIENT_CODE, roomless)
  }

  const startedAt = now()
  let transaction: MarkovdActivateTransaction = createMarkovdActivationTransaction({
    transactionId: randomUUID(),
    candidateVersion: fullVersion,
    appVersion: options.appVersion,
    recordBefore: record,
    snapshotDirName: markovdSnapshotDirName(fullVersion, startedAt.getTime()),
    now: startedAt
  })
  const beginMutating = (): void => {
    lock.retainOnError()
    // After mutation starts, cancellation would strand a stopped host; finish or roll back.
    options = withoutAbortSignal(options)
  }
  if (incumbent) {
    // Recount immediately before stop; the initial census may predate a long upload.
    const fenced = await runFencedStop({
      recountCensus: () =>
        countedLockedRecord(options, record)
          ? options.recountCensus()
          : Promise.reject(new Error('not the incumbent this update counted')),
      releaseIncumbentAdmission: options.releaseIncumbentAdmission,
      now: () => now().getTime(),
      refuse: (recounted) => {
        const plan = planFor(recounted, hostDaemonProtocols)
        return plan.action === 'defer' ? notActivated(plan.code, plan.reason) : null
      },
      prepare: () => writeMarkovdActivationTransaction(options, transaction),
      stale: () =>
        notActivated(
          'markovd_update_terminal_census_unavailable',
          'The terminal count went stale before the current server could be stopped, so nothing ' +
            'was stopped. Markov will try the update again.'
        ),
      stop: () => {
        beginMutating()
        return stopTransactionIncumbent(options, incumbent, lock)
      },
      stopMayHaveBeenSent: (unstopped) => unstopped === null || unstopped.stopMayBeUnderway
    })
    if ('refused' in fenced) {
      return fenced.refused
    }
    if (fenced.stopped) {
      return notActivated(
        'markovd_outgoing_stop_incomplete',
        `${fenced.stopped.reason} No snapshot was taken and the candidate was not started. Markov ` +
          'requires matching runtime readiness before signaling an incumbent and confirmed exit ' +
          'before snapshotting.'
      )
    }
  } else {
    await writeMarkovdActivationTransaction(options, transaction)
    beginMutating()
  }
  transaction = withMarkovdActivationIncumbentStopped(transaction, now())
  await writeMarkovdActivationTransaction(options, transaction)

  // Wait for confirmed exit before snapshotting; a live SQLite WAL is not a backup boundary.
  const snapshotDir = markovdSnapshotPath(options, transaction.snapshot.dirName)
  const captureOutput = await execMarkovdStateMutationOr(
    options,
    captureMarkovdStateSnapshotCommand(
      options.host,
      options.userDataDir,
      snapshotDir,
      markovdRemoteBaseDir(options.host, options.remoteHome),
      {
        snapshotsRoot: markovdSnapshotsRoot(options),
        keep: [transaction.snapshot.dirName, ...(record.snapshot ? [record.snapshot.dirName] : [])]
      }
    ),
    'FAILED'
  )
  const capture = parseMarkovdSnapshotCapture(captureOutput)
  if (capture === 'failed') {
    const reason = markovdSnapshotFailureReason(captureOutput)
    const restarted = incumbent
      ? ` The incumbent was stopped before snapshotting; ${await restartAfterSnapshotFailure(options, incumbent, lock)}`
      : ''
    throw new Error(
      `Could not snapshot ${options.userDataDir} before activating ${fullVersion}` +
        `${reason ? `: ${reason}` : ''}. Markov's persisted state carries no schema version, so ` +
        'without a snapshot a rollback has no way back. Refusing to activate. Fix what stops ' +
        `the copy (often a full disk or quota on ${markovdRemoteBaseDir(options.host, options.remoteHome)}), ` +
        `then reconnect.${restarted}`
    )
  }
  const snapshot: MarkovdStateSnapshot | null =
    capture === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: fullVersion,
          readableByVersion: record.active,
          takenAt: startedAt.toISOString()
        }
      : null
  transaction = withMarkovdActivationSnapshot(transaction, capture, now())
  await writeMarkovdActivationTransaction(options, transaction)

  const { verdict, launchError } = await launchAndJudgeMarkovdSlot(options, {
    remoteInstallDir: remoteDir,
    fullVersion,
    buildHash: computeLocalMarkovdBuildHash(options.localMarkovdDir)
  })
  if (verdict.decision === 'reject') {
    const [code, reason] =
      launchError === undefined
        ? [verdict.code, verdict.reason]
        : [
            markovdCandidateLaunchFailureCode(launchError),
            `The candidate failed while starting: ${errorMessage(launchError)}`
          ]
    const restored = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: markovdSlotDir(options, transaction.candidateVersion),
      launchedVersion: transaction.candidateVersion,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: transaction.snapshot
    })
    const located =
      `${reason} Candidate stderr is at ` +
      `${joinRemotePath(options.host, remoteDir, MARKOVD_LOG_FILENAME)}. ${restored}`
    return notActivated(code, await withMarkovdLogTail(options, remoteDir, located), true)
  }

  const recordAfter = withActivatedVersion(record, fullVersion, snapshot, now(), options.appVersion)
  transaction = withMarkovdActivationCandidateReady(transaction, recordAfter, now())
  await writeMarkovdActivationTransaction(options, transaction)
  await writeMarkovdActivationRecord(options, recordAfter)
  return { outcome: 'installed-and-activated', fullVersion, verdict }
}
