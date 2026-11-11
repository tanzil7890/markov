import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE } from '../../../shared/wsl-host-types'
import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { admitWslMarkovdUpdate } from './wsl-markovd-update-admission'

const { adoptRunningMarkovdVersion } = vi.hoisted(() => ({ adoptRunningMarkovdVersion: vi.fn() }))

vi.mock('../../ssh/markovd-running-version-adoption', () => ({ adoptRunningMarkovdVersion }))
vi.mock('../../managed-server/activation/markovd-activation-record-store', () => ({
  readMarkovdActivationRecord: vi.fn()
}))

const RUNNING = '1.5.0+aaaaaaaaaaaa'
const BUNDLED = '1.6.0+bbbbbbbbbbbb'
const slot: MarkovdSlotOptions = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every host call is mocked at its module.
  conn: {} as MarkovdSlotOptions['conn'],
  host: getRemoteHostPlatform('linux-x64'),
  remoteHome: '/home/u',
  nodePath: '',
  userDataDir: '/home/u/.markov',
  bindHost: '127.0.0.1',
  port: 6768
}
const readiness: ServeReadiness = {
  runtimeId: 'wsl-runtime',
  boundEndpoint: '127.0.0.1:6768',
  advertisedEndpoint: null,
  managedWslCliReconciliation: 'settled',
  pairing: { available: false, reason: 'disabled_by_operator', guidance: '' }
}
const record: MarkovdActivationRecord = {
  schemaVersion: 1,
  active: RUNNING,
  previous: null,
  activatedAt: '2026-10-01T00:00:00.000Z',
  snapshot: null,
  activeAppVersion: '1.5.0'
}
let hostSeq = 0

function admit(intent: 'connect' | 'update' | 'force', moveRunning: boolean) {
  return admitWslMarkovdUpdate({
    slot,
    record,
    candidateVersion: BUNDLED,
    appVersion: '1.6.0',
    host: { kind: 'wsl', id: `Ubuntu-${(hostSeq += 1)}` },
    intent,
    moveRunning
  })
}

beforeEach(() => {
  adoptRunningMarkovdVersion.mockReset()
  adoptRunningMarkovdVersion.mockResolvedValue({ version: RUNNING, readiness, reprobe: vi.fn() })
})

describe('a WSL markovd update while a project moves onto the host', () => {
  it.each(['connect', 'update', 'force'] as const)(
    'keeps the running server for the move on %s, and says the update waits for it',
    async (intent) => {
      expect(await admit(intent, true)).toEqual({
        action: 'serve',
        version: RUNNING,
        readiness,
        deferredUpdate: {
          candidateVersion: BUNDLED,
          code: MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE,
          reason: expect.stringContaining('once the move finishes'),
          forceable: false
        }
      })
    }
  )

  it('updates as before once no move runs', async () => {
    expect(await admit('connect', false)).toEqual({ action: 'deploy', record })
    expect(adoptRunningMarkovdVersion).not.toHaveBeenCalled()
  })
})
