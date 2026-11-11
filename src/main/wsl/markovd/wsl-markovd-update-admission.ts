/** Reuse SSH update admission: keep newer, rolled-back or launch-rejected incumbents serving; fenced activation replans before committing. */
import {
  MARKOVD_HOST_NEWER_DEFERRAL_CODE,
  MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE,
  type WslHostDeferredUpdate
} from '../../../shared/wsl-host-types'
import { refuseMarkovdHostDowngrade } from '../../ssh/markovd-host-version-admission'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import { readMarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record-store'
import { readMarkovdActivationTransaction } from '../../managed-server/activation/markovd-activation-transaction-store'
import { isWaitingMarkovdUpdateDeferral } from '../../managed-server/lifecycle/markovd-managed-auto-update'
import {
  markovdUpdateSkipRefusal,
  planMarkovdUpdateForIntent,
  type ManagedMarkovdAutoUpdatePlan,
  type MarkovdUpdateIntent
} from '../../managed-server/lifecycle/markovd-managed-update-decision'
import {
  markovdUpdateFailureThisLaunch,
  recordMarkovdUpdateFailedThisLaunch,
  type MarkovdUpdateFailure,
  type MarkovdUpdateFailureHost
} from '../../managed-server/lifecycle/markovd-managed-update-failure-memory'
import { MARKOVD_ACTIVATION_POLICY_REFUSED_CODE } from '../../ssh/markovd-installed-activation'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { adoptRunningMarkovdVersion } from '../../ssh/markovd-running-version-adoption'
import type { WslMarkovdLaunch } from './wsl-markovd-deploy'

type WslMarkovdReadyLaunch = Extract<WslMarkovdLaunch, { outcome: 'ready' }>

export type WslMarkovdUpdateAdmission =
  | {
      action: 'serve'
      version: string
      readiness: ServeReadiness
      deferredUpdate: WslHostDeferredUpdate | null
    }
  /** Another run holds the host fence; a later connect adopts or deploys. */
  | { action: 'defer'; deferredUpdate: WslHostDeferredUpdate }
  /** Deploy this app's build on this record. */
  | { action: 'deploy'; record: MarkovdActivationRecord }

export async function admitWslMarkovdUpdate(args: {
  slot: MarkovdSlotOptions
  record: MarkovdActivationRecord
  candidateVersion: string
  appVersion: string
  host: MarkovdUpdateFailureHost
  intent: MarkovdUpdateIntent
  /** A project move to this distro runs here: a redeploy would cut it off, even when forced. */
  moveRunning?: boolean
}): Promise<WslMarkovdUpdateAdmission> {
  const { record, candidateVersion, appVersion } = args
  if (!record.active) {
    return { action: 'deploy', record }
  }
  const failure = markovdUpdateFailureThisLaunch(args.host)
  const plan = planMarkovdUpdateForIntent(args.intent, {
    record,
    candidateVersion,
    appVersion,
    failedBefore: failure !== null
  })
  const heldForMove = args.moveRunning === true && plan.action === 'update'
  if (!heldForMove && (plan.action !== 'skip' || plan.reason === 'current')) {
    return { action: 'deploy', record }
  }
  const adopted = await adoptRunningMarkovdVersion(args.slot, record, candidateVersion)
  if (!adopted) {
    // Nothing active any more: deploy on the record the wake read; its fenced admission re-plans.
    return { action: 'deploy', record: await readMarkovdActivationRecord(args.slot) }
  }
  if ('outcome' in adopted) {
    const { candidateVersion: version, code, reason, forceable } = adopted
    return {
      action: 'defer',
      deferredUpdate: { candidateVersion: version, code, reason, forceable: forceable === true }
    }
  }
  return {
    action: 'serve',
    version: adopted.version,
    readiness: adopted.readiness,
    deferredUpdate:
      adopted.version === candidateVersion
        ? null
        : heldForMove
          ? {
              candidateVersion,
              code: MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE,
              reason:
                'A project is moving to this WSL host; its server updates once the move finishes.',
              forceable: false
            }
          : skippedUpdateHint(plan, failure, record, candidateVersion, appVersion)
  }
}

/** The launch an admission ends in, or the record to deploy on. */
export async function admitWslMarkovdLaunch(
  args: Parameters<typeof admitWslMarkovdUpdate>[0],
  distro: string,
  readyLaunch: (serving: {
    fullVersion: string
    readiness: ServeReadiness
  }) => Promise<WslMarkovdReadyLaunch>
): Promise<WslMarkovdLaunch | MarkovdActivationRecord> {
  const admission = await admitWslMarkovdUpdate(args)
  if (admission.action === 'deploy') {
    return admission.record
  }
  if (admission.action === 'defer') {
    return { outcome: 'deferred', distro, ...admission.deferredUpdate }
  }
  const ready = await readyLaunch({
    fullVersion: admission.version,
    readiness: admission.readiness
  })
  return admission.deferredUpdate ? { ...ready, deferredUpdate: admission.deferredUpdate } : ready
}

/** Offer Update/Force for retriable host deferrals; newer hosts get no hint because Update cannot change that refusal. */
function skippedUpdateHint(
  plan: ManagedMarkovdAutoUpdatePlan,
  failure: MarkovdUpdateFailure | null,
  record: MarkovdActivationRecord,
  candidateVersion: string,
  appVersion: string
): WslHostDeferredUpdate | null {
  if (plan.action !== 'skip') {
    return null
  }
  if (plan.reason === 'failed-before' && failure) {
    return { candidateVersion, ...failure, forceable: true }
  }
  const refusal =
    plan.reason === 'rolled-back'
      ? markovdUpdateSkipRefusal(plan, record, candidateVersion, appVersion)
      : null
  return refusal
    ? {
        candidateVersion,
        code: MARKOVD_ACTIVATION_POLICY_REFUSED_CODE,
        reason: refusal,
        forceable: true
      }
    : null
}

/** Do not retry rejected/thrown incumbent updates this launch, matching SSH. Waits/policy refusals never attempted activation and record no failure. */
export function recordWslMarkovdUpdateFailure(
  host: MarkovdUpdateFailureHost,
  incumbentVersion: string | null,
  failure: MarkovdUpdateFailure | null
): void {
  if (incumbentVersion && failure) {
    recordMarkovdUpdateFailedThisLaunch(host, failure)
  }
}

export function wslMarkovdDeferralFailure(deployed: {
  code: string
  reason: string
}): MarkovdUpdateFailure | null {
  return isWaitingMarkovdUpdateDeferral(deployed.code) ||
    deployed.code === MARKOVD_ACTIVATION_POLICY_REFUSED_CODE
    ? null
    : { code: deployed.code, reason: deployed.reason }
}

/** A policy refusal over a host a newer Markov runs gets its own code: an Update cannot pass it. */
export async function wslMarkovdDeferralCode(
  slot: MarkovdSlotOptions,
  deployed: { code: string; fullVersion: string },
  appVersion: string
): Promise<string> {
  if (deployed.code !== MARKOVD_ACTIVATION_POLICY_REFUSED_CODE) {
    return deployed.code
  }
  const record = await readMarkovdActivationRecord(slot).catch(() => null)
  return record && refuseMarkovdHostDowngrade(record, deployed.fullVersion, appVersion)
    ? MARKOVD_HOST_NEWER_DEFERRAL_CODE
    : deployed.code
}

/** The record only once the incumbent is back and no journal awaits recovery; else null. */
export async function readRestoredWslMarkovdRecord(
  slot: MarkovdSlotOptions,
  incumbent: string
): Promise<MarkovdActivationRecord | null> {
  // Unreadable transaction state proves no restoration; preserve the rejection.
  if (await readMarkovdActivationTransaction(slot).catch(() => true)) {
    return null
  }
  const record = await readMarkovdActivationRecord(slot).catch(() => null)
  return record?.active === incumbent ? record : null
}
