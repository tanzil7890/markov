/** Startup phase timing for the real-distro lane; inert unless its launch env sets the variable. */
export const MARKOVD_STARTUP_TIMING_ENV = 'MARKOV_E2E_MARKOVD_STARTUP_TIMING'

export const MARKOVD_STARTUP_TIMING_PREFIX = '[markovd] startup timing '

/** Each phase's start and end, in ms since this process started. */
type MarkovdStartupPhase = [name: string, startMs: number, endMs: number]

export function createMarkovdStartupTiming(
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = () => performance.now(),
  write: (line: string) => void = (line) => console.error(line)
) {
  const enabled = env[MARKOVD_STARTUP_TIMING_ENV] === '1'
  const phases: MarkovdStartupPhase[] = []
  return {
    async time<T>(name: string, run: () => Promise<T>): Promise<T> {
      if (!enabled) {
        return run()
      }
      const startMs = now()
      try {
        return await run()
      } finally {
        phases.push([name, Math.round(startMs), Math.round(now())])
      }
    },
    /** One stderr line, so it lands in the slot log and never in the readiness stdout. */
    report(): void {
      if (enabled) {
        write(
          `${MARKOVD_STARTUP_TIMING_PREFIX}${JSON.stringify({ readyMs: Math.round(now()), phases })}`
        )
      }
    }
  }
}
