// Rollback restores a pre-activation snapshot: older builds may not understand newer state.
// Stop, rescue, restore, then launch; the rescue and fenced journal allow recovery of interrupted steps.
import { logMarkovdActivationOutcome } from '../activation/markovd-activation-outcome-log'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'
import type { MarkovdTerminalCensus } from '../../../shared/markovd-terminal-census'
import type { MarkovdActivationVerdict } from '../activation/markovd-activation-gate'
import type { MarkovdDaemonProtocolFacts } from '../../ssh/markovd-daemon-protocol-crossing'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import { sameMarkovdActivationRecord } from '../activation/markovd-activation-transaction'
import type { RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  resolveMarkovdActivationReadinessTimeout,
  withMarkovdActivationLock
} from '../activation/markovd-activation-lock'
import { markovdActivationFenceRefusal } from '../activation/markovd-activation-fence-hold'
import { MARKOVD_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/markovd-profile-preflight'
import { rollbackMarkovdLocked } from '../lifecycle/markovd-rollback-transition'

export type MarkovdRollbackOptions = {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  record: MarkovdActivationRecord
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  census: MarkovdTerminalCensus
  /** Close terminal admission, then recount under the host lock; any failure is unverifiable. */
  recountCensus: () => Promise<MarkovdTerminalCensus>
  /** Reopen admission if rollback leaves the incumbent serving. */
  releaseIncumbentAdmission: () => Promise<void>
  /** Expected hash from the client's copy of the rollback target. */
  targetBuildHash: string
  /** Protocol facts from the same target bytes. */
  targetDaemonProtocol: MarkovdDaemonProtocolFacts
  readinessTimeoutMs?: number
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type MarkovdRollbackResult =
  | {
      outcome: 'rolled-back'
      target: string
      discarded: string[]
      verdict: MarkovdActivationVerdict
    }
  | { outcome: 'refused'; code: string; reason: string }
  | { outcome: 'failed'; code: string; reason: string }

export async function rollbackMarkovd(
  input: MarkovdRollbackOptions
): Promise<MarkovdRollbackResult> {
  const options = {
    ...input,
    readinessTimeoutMs: resolveMarkovdActivationReadinessTimeout(
      input.readinessTimeoutMs,
      MARKOVD_STARTUP_READINESS_TIMEOUT_MS
    )
  }
  return logMarkovdActivationOutcome(
    `rollback to ${options.record.previous ?? 'none'}`,
    () =>
      withMarkovdActivationLock(
        options,
        async (lock) => {
          if (
            !sameMarkovdActivationRecord(await readMarkovdActivationRecord(options), options.record)
          ) {
            return {
              outcome: 'refused',
              code: 'markovd_rollback_record_changed',
              reason:
                'The host activation record changed while this rollback was waiting. Refresh the ' +
                'host state and review the new rollback target before trying again.'
            }
          }
          return rollbackMarkovdLocked(options, lock)
        },
        async () => {
          const { code, reason } = await markovdActivationFenceRefusal(options, 'rollback')
          return { outcome: 'refused', code, reason }
        }
      ),
    ['rolled-back']
  )
}
