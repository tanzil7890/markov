// Only refusals sealed by the pinned key may trigger repair; foreign servers fail identity checks.
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { pairingRevisionOf, type ManagedMarkovdPairingGate } from './markovd-managed-pairing-repair'
import {
  MarkovdManagedIdentityError,
  MarkovdManagedPairingRejectedError
} from './markovd-managed-tunnel-identity'

export type ManagedMarkovdPairingRecovery = {
  resolve: (environmentId: string) => KnownRuntimeEnvironment
  repairs: ManagedMarkovdPairingGate
  ensure: (environment: KnownRuntimeEnvironment) => Promise<void>
}

/** Check cached refusal before building; permit one repair and rebuild on a refused pairing. */
export async function buildWithPairingRepair(
  recovery: ManagedMarkovdPairingRecovery,
  environmentId: string,
  build: (environment: KnownRuntimeEnvironment) => Promise<void>
): Promise<'built' | 'repaired'> {
  const refused = recovery.resolve(environmentId)
  const epoch = recovery.repairs.resetEpoch(environmentId)
  const standing = recovery.repairs.standingFailure(environmentId, pairingRevisionOf(refused))
  if (standing) {
    throw standing
  }
  try {
    await build(refused)
    return 'built'
  } catch (error) {
    if (error instanceof MarkovdManagedIdentityError && error.kind === 'replaced-server') {
      throw recovery.repairs.recordStandingRefusal(
        environmentId,
        pairingRevisionOf(refused),
        epoch,
        error
      )
    }
    if (!(error instanceof MarkovdManagedPairingRejectedError)) {
      throw error
    }
    console.warn('[managed-markovd] The Markov server refused this desktop; pairing again:', error)
  }
  // Revision matching joins already-completed repairs instead of repeating host work.
  const repaired = await recovery.repairs.repair(environmentId, pairingRevisionOf(refused))
  try {
    await recovery.ensure(repaired)
  } catch (error) {
    throw error instanceof MarkovdManagedPairingRejectedError
      ? recovery.repairs.recordRefusedAfterRepair(environmentId, pairingRevisionOf(repaired), epoch)
      : error
  }
  return 'repaired'
}
