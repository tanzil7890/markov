/** Set by `markov serve` on its markovd child: '1' when a service manager supervises it, '' otherwise. */
export const MARKOV_SERVE_SUPERVISED_ENV = 'MARKOV_SERVE_SUPERVISED'

/** EX_TEMPFAIL: a supervised markovd had no terminal daemon, so its terminals would die on restart. */
export const MARKOVD_EXIT_TERMINALS_NOT_DURABLE = 75
