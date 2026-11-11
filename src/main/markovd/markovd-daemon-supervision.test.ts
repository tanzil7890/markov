import { afterEach, describe, expect, it, vi } from 'vitest'

const initDaemonPtyProvider = vi.hoisted(() => vi.fn())
vi.mock('../daemon/providers/lifecycle/daemon-provider-init', () => ({ initDaemonPtyProvider }))

import { startMarkovdDaemon } from './markovd-daemon-supervision'
import { MarkovdTerminalsNotDurableError } from './markovd-serve-supervision'
import { resolveMarkovdExitCode } from './markovd-exit-code'
import {
  MARKOV_SERVE_SUPERVISED_ENV,
  MARKOVD_EXIT_TERMINALS_NOT_DURABLE
} from '../../shared/serve-supervised-terminal-durability'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env[MARKOV_SERVE_SUPERVISED_ENV]
})

describe('startMarkovdDaemon', () => {
  it('refuses to serve a supervised host whose terminals would die with it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    initDaemonPtyProvider.mockRejectedValue(new Error('daemon health check rejected'))

    process.env[MARKOV_SERVE_SUPERVISED_ENV] = '1'
    const supervised = startMarkovdDaemon('linux')
    await expect(supervised).rejects.toBeInstanceOf(MarkovdTerminalsNotDurableError)
    const error = await supervised.catch((caught: unknown) => caught)
    expect(resolveMarkovdExitCode(error)).toBe(MARKOVD_EXIT_TERMINALS_NOT_DURABLE)
    expect(String(error)).toContain('daemon health check rejected')
    expect(process.env[MARKOV_SERVE_SUPERVISED_ENV]).toBeUndefined()

    await expect(startMarkovdDaemon('linux')).resolves.toMatchObject({
      state: 'unavailable'
    })
  })
})
