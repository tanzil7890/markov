/** Unknown failures, including older hosts without census support, stay unverifiable and never mean zero live terminals. */
import { MARKOVD_TERMINAL_CENSUS_RUNTIME_CAPABILITY } from '../../shared/markovd-runtime-capabilities'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../shared/electron-remote-runtime-client-capabilities'
import type { PairedRuntimeConnection } from '../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  getPreferredPairedRuntimeConnection,
  type KnownRuntimeEnvironment
} from '../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  MARKOVD_TERMINAL_CENSUS_METHOD,
  MarkovdTerminalCensusSchema,
  type MarkovdTerminalCensus,
  UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
} from '../../shared/markovd-terminal-census'
import { sendRemoteRuntimeRequestWithStatusPreflight } from '../../shared/remote-runtime/remote-runtime-client'
import type { MarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record'
import { ensureMarkovdManagedTunnel } from '../managed-server/lifecycle/markovd-managed-tunnel'
import { verifyMarkovdManagedServing } from '../managed-server/lifecycle/markovd-managed-serving-verify'

export type MarkovdTerminalCensusRequestOptions = {
  releaseFinishedAutomationTerminals?: boolean
  /** Close the server's terminal admission this long before counting; 0 reopens it. */
  closeAdmissionForMs?: number
}

/** Wake idle servers behind ensured tunnels; failed wake/tunnel stays unverifiable. */
export async function collectManagedTerminalCensus(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  record: MarkovdActivationRecord,
  timeoutMs = 15_000,
  options: MarkovdTerminalCensusRequestOptions = {}
): Promise<MarkovdTerminalCensus> {
  if (!record.active) {
    return { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
  }
  const activatedAt = record.activatedAt ? Date.parse(record.activatedAt) : Number.NaN
  if (!Number.isFinite(activatedAt) || activatedAt < 0) {
    return UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
  }
  try {
    // Use the tunnel's returned pairing; re-pairing may have retired the caller's token.
    const current = await ensureMarkovdManagedTunnel(userDataPath, environment.id)
    // Wake before census, except for reopen: a stopped server has no admission to release.
    if (options.closeAdmissionForMs !== 0) {
      await verifyMarkovdManagedServing(userDataPath, environment.id)
    }
    return await requestMarkovdTerminalCensus(
      getPreferredPairedRuntimeConnection(current),
      activatedAt,
      timeoutMs,
      options
    )
  } catch {
    return UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
  }
}

export async function requestMarkovdTerminalCensus(
  connection: PairedRuntimeConnection,
  activatedAt: number,
  timeoutMs = 15_000,
  options: MarkovdTerminalCensusRequestOptions = {}
): Promise<MarkovdTerminalCensus> {
  try {
    const response = await sendRemoteRuntimeRequestWithStatusPreflight<unknown>(
      connection,
      MARKOVD_TERMINAL_CENSUS_METHOD,
      {
        activatedAt,
        ...(options.releaseFinishedAutomationTerminals
          ? { releaseFinishedAutomationTerminals: true }
          : {}),
        // Older servers safely omit both unsupported admission request and reply fields.
        ...(options.closeAdmissionForMs === undefined
          ? {}
          : { closeAdmissionForMs: options.closeAdmissionForMs })
      },
      timeoutMs,
      (status) => {
        if (
          !status.ok ||
          !status.result.capabilities?.includes(MARKOVD_TERMINAL_CENSUS_RUNTIME_CAPABILITY)
        ) {
          throw new Error('This host’s Markov server does not report a terminal census.')
        }
      },
      undefined,
      ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
    )
    return response.ok
      ? MarkovdTerminalCensusSchema.parse(response.result)
      : UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
  } catch {
    return UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
  }
}
