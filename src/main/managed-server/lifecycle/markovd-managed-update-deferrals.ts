import type { MarkovdManagedDeferral } from '../../../shared/markovd-managed-runtime'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'

type RecordedDeferral = MarkovdManagedDeferral & { deferredAt: string }

/** Which activation a host is on: a version alone repeats when a host moves away and back. */
export type MarkovdIncumbent = Pick<MarkovdActivationRecord, 'active' | 'activatedAt'>

type StoredDeferral = RecordedDeferral & {
  /** The host's activation when the deferral was recorded. */
  incumbentAtDeferral: MarkovdIncumbent
}

const deferrals = new Map<string, StoredDeferral>()

export function recordManagedMarkovdUpdateDeferral(
  environmentId: string,
  deferral: MarkovdManagedDeferral,
  incumbent: MarkovdIncumbent,
  now = new Date()
): void {
  deferrals.set(environmentId, {
    ...deferral,
    deferredAt: now.toISOString(),
    incumbentAtDeferral: { active: incumbent.active, activatedAt: incumbent.activatedAt }
  })
}

export function clearManagedMarkovdUpdateDeferral(environmentId: string): void {
  deferrals.delete(environmentId)
}

/** Forget a deferral once the host's activation moves, since it described a host state that is gone
 *  (builds of one release differ only by an unorderable content hash, #38400), or once its candidate
 *  is the build the host runs, since nothing is left to update. */
export function currentManagedMarkovdUpdateDeferral(
  environmentId: string,
  incumbent: MarkovdIncumbent
): RecordedDeferral | null {
  const stored = deferrals.get(environmentId)
  if (!stored) {
    return null
  }
  const { incumbentAtDeferral, ...deferral } = stored
  if (
    incumbent.active === deferral.candidateVersion ||
    incumbentAtDeferral.active !== incumbent.active ||
    incumbentAtDeferral.activatedAt !== incumbent.activatedAt
  ) {
    clearManagedMarkovdUpdateDeferral(environmentId)
    return null
  }
  return deferral
}
