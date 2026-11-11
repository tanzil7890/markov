import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import { recordMarkovdUpdateFailedThisLaunch } from '../../managed-server/lifecycle/markovd-managed-update-failure-memory'
import type { ServeReadiness } from '../../server/serve-readiness'

import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { admitWslMarkovdUpdate } from './wsl-markovd-update-admission'

const { adoptRunningMarkovdVersion, readMarkovdActivationRecord } = vi.hoisted(() => ({
  adoptRunningMarkovdVersion: vi.fn(),
  readMarkovdActivationRecord: vi.fn()
}))

vi.mock('../../ssh/markovd-running-version-adoption', () => ({ adoptRunningMarkovdVersion }))
vi.mock('../../managed-server/activation/markovd-activation-record-store', () => ({
  readMarkovdActivationRecord
}))

// Mixed versions between this desktop and a WSL distro's markovd: they update independently.
const OLDER = '1.5.0+aaaaaaaaaaaa'
const NEWER = '1.6.0+bbbbbbbbbbbb'
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
let hostSeq = 0

function running(version: string, appVersion: string): MarkovdActivationRecord {
  return {
    schemaVersion: 1,
    active: version,
    previous: null,
    activatedAt: '2026-10-01T00:00:00.000Z',
    snapshot: null,
    activeAppVersion: appVersion
  }
}

function admit(
  record: MarkovdActivationRecord,
  desktop: { candidateVersion: string; appVersion: string },
  options: { intent?: 'connect' | 'update' | 'force'; host?: { kind: 'wsl'; id: string } } = {}
) {
  return admitWslMarkovdUpdate({
    slot,
    record,
    ...desktop,
    host: options.host ?? { kind: 'wsl', id: `Ubuntu-${(hostSeq += 1)}` },
    intent: options.intent ?? 'connect'
  })
}

beforeEach(() => {
  adoptRunningMarkovdVersion.mockReset()
  readMarkovdActivationRecord.mockReset()
})

describe('WSL markovd admission across desktop and host versions', () => {
  describe('an older desktop meets the markovd a newer desktop deployed', () => {
    const olderDesktop = { candidateVersion: OLDER, appVersion: '1.5.0' }

    it('keeps the newer markovd serving its terminals, with no Update hint', async () => {
      adoptRunningMarkovdVersion.mockResolvedValue({ version: NEWER, readiness, reprobe: vi.fn() })
      for (const intent of ['connect', 'update'] as const) {
        expect(await admit(running(NEWER, '1.6.0'), olderDesktop, { intent })).toEqual({
          action: 'serve',
          version: NEWER,
          readiness,
          deferredUpdate: null
        })
      }
      expect(adoptRunningMarkovdVersion).toHaveBeenCalledWith(slot, running(NEWER, '1.6.0'), OLDER)
    })
  })

  describe('a newer desktop meets the markovd an older desktop deployed', () => {
    const newerDesktop = { candidateVersion: NEWER, appVersion: '1.6.0' }

    it('keeps the older markovd serving after a failed update, and offers Force', async () => {
      const host = { kind: 'wsl' as const, id: 'Ubuntu-failed' }
      recordMarkovdUpdateFailedThisLaunch(host, {
        code: 'markovd_activation_failed',
        reason: 'boom'
      })
      adoptRunningMarkovdVersion.mockResolvedValue({ version: OLDER, readiness, reprobe: vi.fn() })
      expect(await admit(running(OLDER, '1.5.0'), newerDesktop, { host })).toEqual({
        action: 'serve',
        version: OLDER,
        readiness,
        deferredUpdate: {
          candidateVersion: NEWER,
          code: 'markovd_activation_failed',
          reason: 'boom',
          forceable: true
        }
      })
    })
  })
})
