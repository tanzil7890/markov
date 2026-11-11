import { writeMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import type { MarkovdActivationRecoveryResult } from '../activation/markovd-activation-recovery'
import type { MarkovdDecommissionRecoveryPlan } from './markovd-decommission-transaction'
import { settleMarkovdDecommissionStop } from './markovd-decommission-stop'
import {
  markovdLivenessProbeCommand,
  markovdLivenessProvenExited,
  parseMarkovdLiveness
} from '../install/markovd-remote-launch'
import { execMarkovdRemote } from '../install/markovd-remote-runtime-control'
import {
  ensureMarkovdSlotServing,
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  type MarkovdSlotOptions
} from '../../ssh/markovd-recovery-slot'

/** Only proven exit clears an interrupted decommission journal. */
export async function reconcileMarkovdDecommission(
  options: MarkovdSlotOptions,
  plan: MarkovdDecommissionRecoveryPlan
): Promise<MarkovdActivationRecoveryResult> {
  if (plan.action === 'keep-serving') {
    const identity = await resolveMarkovdSlotIdentity(options, plan.version)
    return {
      outcome: 'recovered',
      resolution: 'restored-incumbent',
      activeVersion: plan.version,
      readiness: await ensureMarkovdSlotServing(options, identity)
    }
  }
  if (plan.action === 'resume-stop') {
    const settlement = await settleMarkovdDecommissionStop(options, plan.request)
    if (settlement.state === 'unsettled') {
      return {
        outcome: 'refused',
        verdict: settlement.verdict,
        code: 'markovd_recovery_decommission_unsettled',
        reason: settlement.reason
      }
    }
    if (settlement.state === 'withdrawn') {
      return reconcileMarkovdDecommission(options, {
        action: 'keep-serving',
        version: plan.request.version
      })
    }
    return reconcileMarkovdDecommission(options, {
      action: 'confirm-decommissioned',
      version: plan.request.version,
      record: plan.record
    })
  }
  // Live or unanswered slots retain the fence; only proven exit permits commit.
  const liveness = parseMarkovdLiveness(
    await execMarkovdRemote(
      options,
      markovdLivenessProbeCommand(options.host, markovdSlotDir(options, plan.version))
    )
  )
  if (!markovdLivenessProvenExited(liveness)) {
    return {
      outcome: 'refused',
      verdict: liveness === 'LIVE' ? 'live' : 'unverifiable',
      code: 'markovd_recovery_decommissioned_slot_not_exited',
      reason: `markovd ${plan.version} is recorded as stopped but is ${liveness.toLowerCase()}.`
    }
  }
  if (plan.record) {
    await writeMarkovdActivationRecord(options, plan.record)
  }
  return { outcome: 'recovered', resolution: 'committed', activeVersion: null, readiness: null }
}
