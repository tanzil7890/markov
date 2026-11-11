import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKOVD_TERMINAL_CENSUS_RUNTIME_CAPABILITY } from '../../shared/markovd-runtime-capabilities'
import {
  createEnvironmentFromPairingOffer,
  type KnownRuntimeEnvironment
} from '../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  emptyMarkovdActivationRecord,
  type MarkovdActivationRecord
} from '../managed-server/activation/markovd-activation-record'

const mocks = vi.hoisted(() => ({ send: vi.fn(), ensure: vi.fn(), verify: vi.fn() }))
vi.mock('../../shared/remote-runtime/remote-runtime-client', () => ({
  sendRemoteRuntimeRequestWithStatusPreflight: mocks.send
}))
vi.mock('../managed-server/lifecycle/markovd-managed-tunnel', () => ({
  ensureMarkovdManagedTunnel: mocks.ensure
}))
vi.mock('../managed-server/lifecycle/markovd-managed-serving-verify', () => ({
  verifyMarkovdManagedServing: mocks.verify
}))

const { collectManagedTerminalCensus } = await import('./markovd-terminal-census-client')
const collect = (record: MarkovdActivationRecord) =>
  collectManagedTerminalCensus('/profile', environment, record)

const environment: KnownRuntimeEnvironment = createEnvironmentFromPairingOffer({
  id: 'environment-1',
  name: 'Managed',
  now: 1,
  offer: { v: 2, endpoint: 'ws://127.0.0.1:46768', deviceToken: 't', publicKeyB64: 'k' },
  connectionDependency: 'ssh-tunnel'
})
const active = {
  ...emptyMarkovdActivationRecord(),
  active: '1.0.0',
  activatedAt: '2026-01-01T00:00:00.000Z'
}
const unverifiable = {
  liveSessions: null,
  startedSinceActivation: null,
  daemonProtocolVersion: null
}
const census = { liveSessions: 2, startedSinceActivation: 1, daemonProtocolVersion: 7 }

function answerWith(capabilities: string[], response: unknown) {
  mocks.send.mockImplementation(async (_pairing, _method, _params, _timeout, validate) => {
    validate({ ok: true, result: { capabilities } })
    return response
  })
}

describe('managed markovd terminal census client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.ensure.mockResolvedValue(environment)
    mocks.verify.mockResolvedValue({ state: 'serving' })
  })

  it('never starts a server just to reopen its terminal admission', async () => {
    await collectManagedTerminalCensus('/profile', environment, active, undefined, {
      closeAdmissionForMs: 0
    })
    // A server that stopped has nothing left to reopen; waking it could restart or recover it.
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.send.mock.calls[0]?.[2]).toMatchObject({ closeAdmissionForMs: 0 })
  })

  it.each([
    ['an older host without the capability', () => answerWith([], { ok: true, result: census })],
    [
      'method not found',
      () =>
        answerWith([MARKOVD_TERMINAL_CENSUS_RUNTIME_CAPABILITY], {
          ok: false,
          error: { code: 'method_not_found', message: 'no' }
        })
    ],
    [
      'a malformed answer',
      () => answerWith([MARKOVD_TERMINAL_CENSUS_RUNTIME_CAPABILITY], { ok: true, result: {} })
    ],
    ['loss of contact', () => mocks.send.mockRejectedValue(new Error('socket closed'))]
  ])('reads %s as unverifiable, never as zero', async (_label, arrange) => {
    arrange()
    await expect(collect(active)).resolves.toEqual(unverifiable)
  })
})
