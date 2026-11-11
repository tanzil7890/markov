/** Pair with an already-running foreign build before considering update; an unpaired first deploy cannot census its terminals. */
import type { ServeReadiness } from '../server/serve-readiness'
import type { MarkovdManagedDeferral } from '../../shared/markovd-managed-runtime'
import { markovdActivationFenceRefusal } from '../managed-server/activation/markovd-activation-fence-hold'
import {
  MarkovdActiveReadinessError,
  probeActiveMarkovdReadiness
} from './markovd-active-readiness'
import type { MarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record'
import { readMarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record-store'
import { wakeStoppedManagedMarkovd } from '../managed-server/lifecycle/markovd-managed-wake'
import { resolveMarkovdSlotIdentity, type MarkovdSlotOptions } from './markovd-recovery-slot'

export type MarkovdRunningAdoption = {
  version: string
  readiness: ServeReadiness
  /** Reads the adopted slot's readiness again, e.g. after it rebinds its port. */
  reprobe: () => Promise<ServeReadiness>
}

/** No foreign activation returns null for normal deploy. A held peer fence defers: deploying without pairing would only fail census (#28833). */
export async function adoptRunningMarkovdVersion(
  slot: MarkovdSlotOptions,
  record: MarkovdActivationRecord,
  localVersion: string,
  retryClearedFence = true
): Promise<MarkovdRunningAdoption | MarkovdManagedDeferral | null> {
  if (!record.active || record.active === localVersion) {
    return null
  }
  // Wake only on proven server exit; idle stops leave daemon terminals alive.
  const wake = await wakeStoppedManagedMarkovd(slot)
  switch (wake.outcome) {
    // Another desktop stopped it meanwhile; the deploy's own gates decide.
    case 'not-activated':
      return null
    case 'fenced': {
      // E.g. another desktop starting it after a reboot; a later connect pairs with it.
      const { cleared, ...refusal } = await markovdActivationFenceRefusal(slot, 'server start')
      if (cleared && retryClearedFence) {
        return adoptRunningMarkovdVersion(slot, record, localVersion, false)
      }
      return { outcome: 'deferred', candidateVersion: localVersion, ...refusal, forceable: false }
    }
    case 'unverifiable':
      throw new MarkovdActiveReadinessError(
        'unverifiable',
        `Markov ${record.active} runs this host's server, but its process state is unverifiable, ` +
          'so it was left as it is. Try connecting again.'
      )
    case 'recovery-refused':
      throw new Error(wake.reason)
    case 'serving':
    case 'started':
      break
  }
  // Re-read activation because wake follows peer changes to the current record.
  const active = (await readMarkovdActivationRecord(slot)).active
  if (!active || active === localVersion) {
    return null
  }
  const identity = await resolveMarkovdSlotIdentity(slot, active)
  const reprobe = () =>
    probeActiveMarkovdReadiness(
      { ...slot, remoteInstallDir: identity.remoteDir },
      { buildHash: identity.buildHash, fullVersion: identity.version }
    )
  return { version: active, readiness: await reprobe(), reprobe }
}
