// SSH channel closure does not prove host mutation exit; only command output or exit may release the activation fence.
import { MARKOVD_STATE_MUTATION_DEADLINE_SECONDS } from './markovd-state-snapshot'
import {
  MARKOVD_STATE_MUTATION_BUSY,
  MARKOVD_STATE_MUTATION_DEADLINE
} from './markovd-state-snapshot-members'
import type { MarkovdRemoteExecTarget } from '../install/markovd-remote-runtime-control'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import {
  isMarkovdFenceLost,
  MarkovdFenceLostError
} from '../activation/markovd-activation-fence-scope'

// Let the host deadline kill workload before client observation times out.
export const MARKOVD_STATE_MUTATION_CLIENT_TIMEOUT_MS =
  (MARKOVD_STATE_MUTATION_DEADLINE_SECONDS + 60) * 1000

function unconfirmed(error: Error): Error & { sshChannelCloseConfirmed: false } {
  return Object.assign(error, { sshChannelCloseConfirmed: false as const })
}

/** Do not abort observation: caller cancellation cannot stop host-side mutation. */
export async function execMarkovdStateMutation(
  target: MarkovdRemoteExecTarget,
  command: string
): Promise<string> {
  let output: string
  try {
    output = await execCommand(target.conn, command, {
      wrapCommand: target.host.commandDialect !== 'powershell',
      timeoutMs: MARKOVD_STATE_MUTATION_CLIENT_TIMEOUT_MS
    })
  } catch (error) {
    // Channel termination flags uncertainty; exit-status errors prove completion.
    if (error instanceof Error && 'sshChannelCloseConfirmed' in error) {
      throw unconfirmed(error)
    }
    throw isMarkovdFenceLost(error) ? new MarkovdFenceLostError() : error
  }
  const verdict = output.trim().split('\n').pop()?.trim()
  if (verdict === MARKOVD_STATE_MUTATION_BUSY) {
    throw unconfirmed(
      new Error('Another snapshot capture or restore is still running on the host.')
    )
  }
  if (verdict === MARKOVD_STATE_MUTATION_DEADLINE) {
    throw unconfirmed(
      new Error(
        `A snapshot capture or restore ran past ${MARKOVD_STATE_MUTATION_DEADLINE_SECONDS}s and ` +
          'the host stopped it part way through.'
      )
    )
  }
  return output
}

/** Fall back only for finished failures; unconfirmed mutation remains fenced. */
export function execMarkovdStateMutationOr(
  target: MarkovdRemoteExecTarget,
  command: string,
  fallback = ''
): Promise<string> {
  return execMarkovdStateMutation(target, command).catch((error: unknown) => {
    // Lost ownership is a refusal, never a capture failure eligible for fallback.
    if (isUnconfirmedSshCommandTermination(error) || error instanceof MarkovdFenceLostError) {
      throw error
    }
    return fallback
  })
}
