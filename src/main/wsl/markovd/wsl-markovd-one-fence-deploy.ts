/**
 * A same-version WSL connect takes one activation fence instead of two: the deploy confirms the
 * slot is installed and skips its own fence, then the wake's fence re-reads the record and starts
 * the slot if it stopped. A fence the snapshot saw held, another version active by then, or a busy
 * fence all run the full deploy and wake, as before.
 */
import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import { wakeExpectedMarkovdUnderOneFence } from '../../managed-server/lifecycle/markovd-managed-wake'
import type { MarkovdDeployOptions, MarkovdDeployResult } from '../../ssh/markovd-remote-deploy'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'

type DeployExtra = Pick<MarkovdDeployOptions, 'preRead' | 'sameVersionFencedByCaller'>

export async function deployWslMarkovdWithOneFence(
  slot: MarkovdSlotOptions,
  deploy: (extra: DeployExtra) => Promise<MarkovdDeployResult>,
  hinted: { preRead?: { record: MarkovdActivationRecord; fenceOpen: boolean } }
): Promise<{ deployed: MarkovdDeployResult; woken: boolean }> {
  if (!hinted.preRead?.fenceOpen) {
    return { deployed: await deploy(hinted), woken: false }
  }
  const first = await deploy({ ...hinted, sameVersionFencedByCaller: true })
  if (first.outcome !== 'already-active') {
    return { deployed: first, woken: false }
  }
  const wake = await wakeExpectedMarkovdUnderOneFence(slot, first.fullVersion)
  if (wake.outcome === 'replan' || wake.outcome === 'fenced') {
    // The host moved since the snapshot, so this deploy takes no hints.
    return { deployed: await deploy({}), woken: false }
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return { deployed: first, woken: true }
}
