// `markov serve --supervise` runs markovd under a service manager, which restarts it routinely.
import process from 'node:process'
import { MARKOV_SERVE_SUPERVISED_ENV } from '../../shared/serve-supervised-terminal-durability'

/** A supervised service must not hand out terminals that its next restart would kill. */
export class MarkovdTerminalsNotDurableError extends Error {
  constructor(readonly daemonFailure: string) {
    super(
      `The terminal daemon did not start (${daemonFailure}). This server runs under a service ` +
        'manager, so it will not start with terminals that a restart would lose; the supervisor ' +
        'retries with backoff.'
    )
    this.name = 'MarkovdTerminalsNotDurableError'
  }
}

/** Read once and drop it, so nothing markovd starts inherits it. */
export function takeMarkovdServeSupervision(env: NodeJS.ProcessEnv = process.env): boolean {
  const supervised = env[MARKOV_SERVE_SUPERVISED_ENV] === '1'
  delete env[MARKOV_SERVE_SUPERVISED_ENV]
  return supervised
}
