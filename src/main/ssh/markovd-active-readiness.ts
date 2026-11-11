import {
  evaluateMarkovdActivation,
  type MarkovdActivationExpectation
} from '../managed-server/activation/markovd-activation-gate'
import {
  markovdLivenessProbeCommand,
  parseMarkovdLiveness,
  type MarkovdLaunchSpec,
  type MarkovdReadinessParse
} from '../managed-server/install/markovd-remote-launch'
import {
  execMarkovdRemote,
  launchMarkovdAndAwaitReadiness,
  type MarkovdRemoteExecTarget
} from '../managed-server/install/markovd-remote-runtime-control'
import {
  parseMarkovdReadinessWaitOutput,
  readMarkovdReadinessNowCommand
} from '../managed-server/install/markovd-remote-readiness-wait'
import type { ServeReadiness } from '../server/serve-readiness'
import { withMarkovdLogTail } from '../managed-server/install/markovd-remote-log-tail'
import type { RemoteHostPlatform } from './ssh-remote-platform'

type MarkovdReadinessFailureVerdict = 'exited' | 'unverifiable' | 'rejected'

export class MarkovdActiveReadinessError extends Error {
  constructor(
    readonly verdict: MarkovdReadinessFailureVerdict,
    message: string
  ) {
    super(message)
    this.name = 'MarkovdActiveReadinessError'
  }
}

/** A launched markovd that did not publish acceptable readiness; inspection failures stay the base error. */
export class MarkovdLaunchReadinessError extends MarkovdActiveReadinessError {
  constructor(verdict: MarkovdReadinessFailureVerdict, message: string) {
    super(verdict, message)
    this.name = 'MarkovdLaunchReadinessError'
  }
}

function gatedReadiness(
  parsed: MarkovdReadinessParse,
  expectation: MarkovdActivationExpectation,
  label: string
): ServeReadiness {
  const readiness = parsed.state === 'ready' ? parsed.readiness : null
  const verdict = evaluateMarkovdActivation(readiness, expectation)
  if (verdict.decision === 'reject') {
    throw new MarkovdActiveReadinessError(
      'rejected',
      `${label} failed its readiness check: ${verdict.reason}`
    )
  }
  if (!readiness) {
    throw new MarkovdActiveReadinessError(
      'rejected',
      `${label} passed activation without a readiness payload.`
    )
  }
  const coverage = markovdDaemonCoverageRefusal(readiness)
  if (coverage) {
    throw new MarkovdActiveReadinessError('rejected', `${label} ${coverage}`)
  }
  return readiness
}

/** Require PTY self-test coverage, or handshake on platforms that cannot spawn-probe. Older slots without coverage metadata retain the identity-only gate. */
function markovdDaemonCoverageRefusal(readiness: ServeReadiness): string | null {
  const health = readiness.health
  const coverage = health?.terminalDaemon?.selfTest?.coverage
  if (!health || coverage === undefined || coverage === 'pty-spawn') {
    return null
  }
  if (coverage === 'handshake' && health.platform === 'win32') {
    return null
  }
  return (
    `reported terminal-daemon coverage '${String(coverage)}', which does not prove a PTY can ` +
    `be created on ${health.platform}.`
  )
}

export async function probeActiveMarkovdReadiness(
  target: MarkovdRemoteExecTarget & { remoteInstallDir: string },
  expectation: MarkovdActivationExpectation
): Promise<ServeReadiness> {
  assertActiveMarkovdLive(
    await execMarkovdRemote(
      target,
      markovdLivenessProbeCommand(target.host, target.remoteInstallDir)
    ),
    expectation
  )
  return activeMarkovdReadinessFromOutput(
    target.host,
    await execMarkovdRemote(
      target,
      readMarkovdReadinessNowCommand(target.host, target.remoteInstallDir)
    ),
    expectation
  )
}

/** Throws unless the liveness probe's answer proves the active slot's process is running. */
export function assertActiveMarkovdLive(
  livenessOutput: string,
  expectation: MarkovdActivationExpectation
): void {
  const liveness = parseMarkovdLiveness(livenessOutput)
  if (liveness === 'DEAD') {
    throw new MarkovdActiveReadinessError(
      'exited',
      `markovd ${expectation.fullVersion} is recorded active but its process has exited.`
    )
  }
  if (liveness === 'NEVER_LAUNCHED') {
    throw new MarkovdActiveReadinessError(
      'exited',
      `markovd ${expectation.fullVersion} is recorded active but was never started from its install directory.`
    )
  }
  if (liveness !== 'LIVE') {
    throw new MarkovdActiveReadinessError(
      'unverifiable',
      `markovd ${expectation.fullVersion} process state is unverifiable.`
    )
  }
}

export function activeMarkovdReadinessFromOutput(
  host: RemoteHostPlatform,
  readinessOutput: string,
  expectation: MarkovdActivationExpectation
): ServeReadiness {
  return gatedReadiness(
    parseMarkovdReadinessWaitOutput(host, readinessOutput),
    expectation,
    'The active markovd'
  )
}

/** Accept recovery/rollback launches only when they prove the expected build. */
export async function launchMarkovdSlotAndAwaitReadiness(
  target: MarkovdRemoteExecTarget & {
    readinessTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
  },
  spec: MarkovdLaunchSpec,
  expectation: MarkovdActivationExpectation
): Promise<ServeReadiness> {
  const parsed = await launchMarkovdAndAwaitReadiness(target, spec)
  try {
    return gatedReadiness(parsed, expectation, `markovd ${spec.fullVersion}`)
  } catch (error) {
    if (!(error instanceof MarkovdActiveReadinessError)) {
      throw error
    }
    const message = await withMarkovdLogTail(target, spec.remoteInstallDir, error.message)
    throw new MarkovdLaunchReadinessError(error.verdict, message)
  }
}
