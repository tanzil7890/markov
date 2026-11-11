import {
  evaluateMarkovdActivation,
  type MarkovdActivationVerdict
} from '../managed-server/activation/markovd-activation-gate'
import { markovdActivationTransactionRoot } from '../managed-server/activation/markovd-activation-transaction'
import type { MarkovdReadinessParse } from '../managed-server/install/markovd-remote-launch'
import {
  launchMarkovdAndAwaitReadiness,
  type MarkovdRemoteExecTarget
} from '../managed-server/install/markovd-remote-runtime-control'
import { isUnconfirmedSshCommandTermination } from './remote-exec/remote-exec-command'

type CandidateLaunchTarget = Parameters<typeof launchMarkovdAndAwaitReadiness>[0] &
  MarkovdRemoteExecTarget & {
    remoteHome: string
    nodePath: string
    userDataDir: string
    bindHost: string
    port: number
  }

/** Rethrow unconfirmed SSH cleanup: it provides no candidate evidence and must never mean rejection. */
export async function launchAndJudgeMarkovdSlot(
  options: CandidateLaunchTarget,
  slot: { remoteInstallDir: string; fullVersion: string; buildHash: string }
): Promise<{ verdict: MarkovdActivationVerdict; launchError: unknown }> {
  let parsed: MarkovdReadinessParse | null = null
  let launchError: unknown
  try {
    parsed = await launchMarkovdAndAwaitReadiness(options, {
      remoteInstallDir: slot.remoteInstallDir,
      nodePath: options.nodePath,
      fullVersion: slot.fullVersion,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      activationRoot: markovdActivationTransactionRoot(options.host, options.remoteHome)
    })
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    launchError = error
  }
  const verdict = evaluateMarkovdActivation(parsed?.state === 'ready' ? parsed.readiness : null, {
    buildHash: slot.buildHash,
    fullVersion: slot.fullVersion
  })
  return { verdict, launchError }
}
