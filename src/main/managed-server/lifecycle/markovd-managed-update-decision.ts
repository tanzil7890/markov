import { compareAppVersions, isValidAppVersion } from '../../../shared/app-version'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'
import {
  refuseMarkovdHostDowngrade,
  type MarkovdHostVersionRefusal
} from '../../ssh/markovd-host-version-admission'

export type ManagedMarkovdAutoUpdateSkip =
  | 'current'
  | 'no-template'
  | 'rolled-back'
  | 'failed-before'
  | 'migrating'
  | MarkovdHostVersionRefusal

/** Connect honors all skips; Update retries local failures/rollbacks; Force also lifts version skips. */
export type MarkovdUpdateIntent = 'connect' | 'update' | 'force'

export type ManagedMarkovdAutoUpdatePlan =
  | { action: 'update' }
  | { action: 'skip'; reason: ManagedMarkovdAutoUpdateSkip }

export function planManagedMarkovdAutoUpdate(input: {
  record: MarkovdActivationRecord
  candidateVersion: string | null
  appVersion: string
  failedBefore: boolean
}): ManagedMarkovdAutoUpdatePlan {
  const { record, candidateVersion } = input
  if (!candidateVersion) {
    return { action: 'skip', reason: 'no-template' }
  }
  if (record.active === candidateVersion) {
    return { action: 'skip', reason: 'current' }
  }
  if (record.rolledBackFrom === candidateVersion) {
    return { action: 'skip', reason: 'rolled-back' }
  }
  const refusal = refuseMarkovdHostDowngrade(record, candidateVersion, input.appVersion)
  if (refusal) {
    return { action: 'skip', reason: refusal }
  }
  // A stopped host has no serving fallback; retry even after a prior failed attempt.
  if (record.active === null && record.previous !== null) {
    return { action: 'update' }
  }
  return input.failedBefore ? { action: 'skip', reason: 'failed-before' } : { action: 'update' }
}

export function planMarkovdUpdateForIntent(
  intent: MarkovdUpdateIntent,
  input: Parameters<typeof planManagedMarkovdAutoUpdate>[0]
): ManagedMarkovdAutoUpdatePlan {
  if (intent === 'force') {
    return { action: 'update' }
  }
  if (intent === 'connect') {
    return planManagedMarkovdAutoUpdate(input)
  }
  const { rolledBackFrom: _retried, ...record } = input.record
  return planManagedMarkovdAutoUpdate({ ...input, record, failedBefore: false })
}

export function admitMarkovdRecordForIntent(
  intent: MarkovdUpdateIntent,
  appVersion: string
): (record: MarkovdActivationRecord, candidateVersion: string) => string | null {
  return (record, candidateVersion) =>
    markovdUpdateSkipRefusal(
      planMarkovdUpdateForIntent(intent, {
        record,
        candidateVersion,
        appVersion,
        failedBefore: false
      }),
      record,
      candidateVersion,
      appVersion
    )
}

export function markovdUpdateSkipRefusal(
  plan: ManagedMarkovdAutoUpdatePlan,
  record: MarkovdActivationRecord,
  candidateVersion: string,
  appVersion: string
): string | null {
  if (plan.action !== 'skip' || plan.reason === 'current') {
    return null
  }
  return plan.reason === 'rolled-back'
    ? `This host's server rolled back from ${candidateVersion}, so a connect does not activate ` +
        'it again; choose Update or Force to retry it.'
    : `Markov ${record.activeAppVersion} last ran this host's server, newer than this ` +
        `Markov (${appVersion}). Update Markov to start it.`
}

/** Content hashes cannot order updates: compare Markov versions, or for legacy hosts offer only this desktop's previously deferred build. */
export function availableManagedMarkovdUpdate(input: {
  record: MarkovdActivationRecord
  candidateVersion: string | null
  appVersion: string
  /** The build this desktop's last Update or connect deferred on this host. */
  deferredCandidateVersion: string | null
}): string | null {
  const { record, candidateVersion, appVersion } = input
  const hostAppVersion = record.activeAppVersion
  if (!candidateVersion || record.active === null || !isValidAppVersion(appVersion)) {
    return null
  }
  const ordered = hostAppVersion
    ? isValidAppVersion(hostAppVersion) && compareAppVersions(appVersion, hostAppVersion) >= 0
    : input.deferredCandidateVersion === candidateVersion
  if (!ordered) {
    return null
  }
  // Connect rules: a build the user rolled back from is not advertised again.
  const plan = planManagedMarkovdAutoUpdate({
    record,
    candidateVersion,
    appVersion,
    failedBefore: false
  })
  return plan.action === 'update' ? candidateVersion : null
}
