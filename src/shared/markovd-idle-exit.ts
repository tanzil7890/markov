/** Managed SSH markovd stops after 15 unused minutes like the relay; the next connect restarts it. */
import { z } from 'zod'

/** Test-only quiet period; a client forwards it to the servers it launches. */
export const MARKOVD_E2E_IDLE_TIMEOUT_ENV = 'MARKOV_E2E_MARKOVD_IDLE_TIMEOUT_MS'
export const MARKOVD_IDLE_EXIT_TIMEOUT_MS = 15 * 60_000
const MARKOVD_E2E_IDLE_TIMEOUT_MAX_MS = 60 * 60_000

export function readMarkovdE2EIdleTimeoutMs(env: NodeJS.ProcessEnv): number | null {
  const raw = env[MARKOVD_E2E_IDLE_TIMEOUT_ENV]
  const value = raw ? Number(raw) : Number.NaN
  return Number.isSafeInteger(value) && value >= 1 && value <= MARKOVD_E2E_IDLE_TIMEOUT_MAX_MS
    ? value
    : null
}

/** Client-chosen quiet period for the hosts it launches; older markovds ignore it and keep the default. */
export const MARKOVD_IDLE_TIMEOUT_ENV = 'MARKOV_MARKOVD_IDLE_TIMEOUT_MS'
const MARKOVD_IDLE_TIMEOUT_MIN_MS = 60_000
/** WSL hosts: an idle markovd holds the distro's VM (about 1.2 GB); a cold reopen costs about 4 s. */
export const WSL_MARKOVD_IDLE_EXIT_TIMEOUT_MS = 5 * 60_000

/** Only shortens the default; anything unset, malformed or under a minute keeps it. */
export function readMarkovdIdleTimeoutMs(env: NodeJS.ProcessEnv): number | null {
  const raw = env[MARKOVD_IDLE_TIMEOUT_ENV]
  const value = raw ? Number(raw) : Number.NaN
  return Number.isSafeInteger(value) &&
    value >= MARKOVD_IDLE_TIMEOUT_MIN_MS &&
    value <= MARKOVD_IDLE_EXIT_TIMEOUT_MS
    ? value
    : null
}

/** Written to the data root just before an idle stop; the next start reports and clears it. */
export const MARKOVD_IDLE_STOP_RECORD_FILENAME = 'markovd-idle-stop.json'

export const MarkovdIdleStopRecordSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('markovd_idle_stop'),
  pid: z.number().int().positive(),
  version: z.string().max(255),
  quietSince: z.iso.datetime({ offset: true }),
  stoppedAt: z.iso.datetime({ offset: true }),
  idleTimeoutMs: z.number().int().positive()
})

export type MarkovdIdleStopRecord = z.infer<typeof MarkovdIdleStopRecordSchema>

/**
 * In a WSL distro's data root (`~/.markov`): markovd's pid, written on an idle stop that left no
 * terminal daemon. The distro holder ends once that pid exits, so WSL may stop the idle distro.
 */
export const MARKOVD_WSL_HOLDER_RELEASE_FILENAME = 'wsl-holder-release'

/** Beside the release request: the first few things keeping an idle distro held, one line. */
export const MARKOVD_WSL_HOLDER_BLOCKED_FILENAME = 'wsl-holder-blocked'
