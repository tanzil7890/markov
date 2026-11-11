/** Reject activation over state a newer host build may already have migrated. */
import { compareAppVersions } from '../../shared/app-version'
import type { MarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record'

export type MarkovdHostVersionRefusal = 'host-newer'

export function refuseMarkovdHostDowngrade(
  record: MarkovdActivationRecord,
  candidateVersion: string,
  appVersion: string
): MarkovdHostVersionRefusal | null {
  // Restarting the stopped build cannot downgrade state.
  if (record.active === null && record.previous === candidateVersion) {
    return null
  }
  // Older Stop records omit app version; refuse only proven newer hosts or they would be stranded.
  if (!record.activeAppVersion) {
    return null
  }
  return compareAppVersions(record.activeAppVersion, appVersion) > 0 ? 'host-newer' : null
}
