/** Only positive host evidence proves slot exit. Unanswered probes stay unverifiable and never authorize starting a second slot. */
import type { ServeReadiness } from '../server/serve-readiness'
import type { MarkovdActivationExpectation } from '../managed-server/activation/markovd-activation-gate'
import { MARKOVD_INSTALL_MODEL } from '../managed-server/install/remote-install-model'
import { computeRemoteInstallDir } from '../managed-server/install/remote-versioned-install'
import { readRemoteMarkovdBuildHash } from '../managed-server/install/markovd-remote-build-hash'
import {
  launchMarkovdSlotAndAwaitReadiness,
  MarkovdActiveReadinessError,
  probeActiveMarkovdReadiness
} from './markovd-active-readiness'
import {
  markovdLivenessProbeCommand,
  markovdLivenessProvenExited,
  parseMarkovdLiveness,
  type MarkovdLiveness
} from '../managed-server/install/markovd-remote-launch'
import {
  parseMarkovdStopOutcome,
  stopMarkovdCommand,
  type MarkovdStopOutcome
} from '../managed-server/install/markovd-remote-process-control'
import {
  execMarkovdRemote,
  type MarkovdRemoteExecTarget
} from '../managed-server/install/markovd-remote-runtime-control'
import { markovdActivationTransactionRoot } from '../managed-server/activation/markovd-activation-transaction'
import {
  initialMarkovdActivationAdmissionCommand,
  parseInitialMarkovdActivationAdmission
} from './markovd-initial-activation-admission'

export const MARKOVD_SLOT_STOP_WAIT_SECONDS = 20

export type MarkovdSlotOptions = MarkovdRemoteExecTarget & {
  remoteHome: string
  /** Host Node for legacy slots only; a slot's own runtime marker wins. */
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  readinessTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

export type MarkovdSlotIdentity = { version: string; remoteDir: string; buildHash: string }

function expectation(identity: MarkovdSlotIdentity): MarkovdActivationExpectation {
  return { buildHash: identity.buildHash, fullVersion: identity.version }
}

export function markovdSlotDir(options: MarkovdSlotOptions, version: string): string {
  return computeRemoteInstallDir(MARKOVD_INSTALL_MODEL, options.remoteHome, version)
}

/** Hash installed bytes so readiness must prove the same build. */
export async function resolveMarkovdSlotIdentity(
  options: MarkovdSlotOptions,
  version: string
): Promise<MarkovdSlotIdentity> {
  const remoteDir = markovdSlotDir(options, version)
  return { version, remoteDir, buildHash: await readRemoteMarkovdBuildHash(options, remoteDir) }
}

export function launchMarkovdSlot(
  options: MarkovdSlotOptions,
  identity: MarkovdSlotIdentity
): Promise<ServeReadiness> {
  return launchMarkovdSlotAndAwaitReadiness(
    options,
    {
      remoteInstallDir: identity.remoteDir,
      nodePath: options.nodePath,
      fullVersion: identity.version,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      // Every SSH launch is client-managed, so every one may idle out and be woken on connect.
      activationRoot: markovdActivationTransactionRoot(options.host, options.remoteHome)
    },
    expectation(identity)
  )
}

/** Proves the slot serves, starting it only on proven exit. */
export async function ensureMarkovdSlotServing(
  options: MarkovdSlotOptions,
  identity: MarkovdSlotIdentity
): Promise<ServeReadiness> {
  const liveness = parseMarkovdLiveness(
    await execMarkovdRemote(options, markovdLivenessProbeCommand(options.host, identity.remoteDir))
  )
  if (liveness === 'LIVE') {
    return probeActiveMarkovdReadiness(
      { ...options, remoteInstallDir: identity.remoteDir },
      expectation(identity)
    )
  }
  if (!markovdLivenessProvenExited(liveness)) {
    throw new MarkovdActiveReadinessError(
      'unverifiable',
      `markovd ${identity.version} process state is unverifiable.`
    )
  }
  return launchMarkovdSlot(options, identity)
}

/** `justLaunched` only for a slot this run started; otherwise the readiness PID must agree. */
export async function stopMarkovdSlot(
  options: MarkovdSlotOptions,
  remoteDir: string,
  justLaunched: boolean
): Promise<MarkovdStopOutcome> {
  return parseMarkovdStopOutcome(
    await execMarkovdRemote(
      options,
      stopMarkovdCommand(
        options.host,
        remoteDir,
        justLaunched
          ? { waitSeconds: MARKOVD_SLOT_STOP_WAIT_SECONDS, justLaunched: true }
          : { waitSeconds: MARKOVD_SLOT_STOP_WAIT_SECONDS, nodePath: options.nodePath }
      )
    )
  )
}

type MarkovdSlotQuiescence = 'exited' | 'other-slot-serving'

/** Prove candidate exit before replacing state and rule out another running slot, unless it already serves. Missing PID files prove nothing: SSH may drop after nohup but before $! is recorded, so inspect data-root ownership. */
export async function quiesceInterruptedMarkovdSlot(
  options: MarkovdSlotOptions,
  /** `null` when nothing was launched, so only `otherSlot` needs ruling out. */
  version: string | null,
  otherSlot: MarkovdSlotIdentity | null
): Promise<MarkovdSlotQuiescence> {
  const remoteDir = version === null ? null : markovdSlotDir(options, version)
  const stopped =
    remoteDir === null ? 'already-exited' : await stopMarkovdSlot(options, remoteDir, false)
  let exited = stopped === 'stopped' || stopped === 'already-exited'
  if ((stopped === 'unknown' || stopped === 'unconfirmed') && remoteDir !== null) {
    // No verified answer, e.g. the slot died before readiness; liveness decides.
    exited = markovdLivenessProvenExited(await slotLiveness(options, remoteDir))
  }
  if (otherSlot) {
    const other = await slotLiveness(options, otherSlot.remoteDir)
    if (other === 'LIVE' && (exited || stopped === 'no-pid')) {
      // The serving slot holds the instance lock, so a PID-less launch cannot own the state.
      await probeActiveMarkovdReadiness(
        { ...options, remoteInstallDir: otherSlot.remoteDir },
        expectation(otherSlot)
      )
      return 'other-slot-serving'
    }
    if (!markovdLivenessProvenExited(other)) {
      throw new MarkovdActiveReadinessError(
        'unverifiable',
        `markovd ${version ?? 'candidate'} (${stopped}) and ${otherSlot.version} (${other}) cannot both be ` +
          'ruled out as owners of the shared state; it was not replaced.'
      )
    }
  }
  if (!exited && stopped === 'no-pid' && remoteDir !== null) {
    const admission = parseInitialMarkovdActivationAdmission(
      await execMarkovdRemote(
        options,
        initialMarkovdActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    exited = admission.decision === 'proceed'
  }
  if (!exited) {
    throw new MarkovdActiveReadinessError(
      'unverifiable',
      `markovd ${version ?? 'candidate'} could not be confirmed stopped (${stopped}); replacing its state would be unsafe.`
    )
  }
  return 'exited'
}

export async function slotLiveness(
  options: MarkovdSlotOptions,
  remoteDir: string
): Promise<MarkovdLiveness> {
  return parseMarkovdLiveness(
    await execMarkovdRemote(options, markovdLivenessProbeCommand(options.host, remoteDir))
  )
}
