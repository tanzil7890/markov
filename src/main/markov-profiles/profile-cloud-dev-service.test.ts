import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const {
  beginMarkovCloudPkceFlowMock,
  exchangeMarkovCloudAuthCodeMock,
  revokeMarkovCloudSessionMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginMarkovCloudPkceFlowMock: vi.fn(),
  exchangeMarkovCloudAuthCodeMock: vi.fn(),
  revokeMarkovCloudSessionMock: vi.fn(),
  safeStorageMock: {
    decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataPath
  },
  safeStorage: safeStorageMock
}))

vi.mock('./profile-cloud-pkce', () => ({
  beginMarkovCloudPkceFlow: beginMarkovCloudPkceFlowMock
}))

vi.mock('./profile-cloud-client', () => ({
  createMarkovCloudProfile: vi.fn(),
  exchangeMarkovCloudAuthCode: exchangeMarkovCloudAuthCodeMock,
  refreshMarkovCloudCapabilities: vi.fn(),
  refreshMarkovCloudSession: vi.fn(),
  revokeMarkovCloudSession: revokeMarkovCloudSessionMock,
  selectMarkovCloudOrg: vi.fn()
}))

import {
  connectCurrentMarkovProfile,
  getCurrentMarkovProfileAuthStatus,
  signOutCurrentMarkovProfile
} from './profile-cloud-service'

describe('Markov cloud dev auth service', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-cloud-dev-auth-'))
    beginMarkovCloudPkceFlowMock.mockReset()
    exchangeMarkovCloudAuthCodeMock.mockReset()
    revokeMarkovCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MARKOV_CLOUD_DEV_AUTH', '1')
    vi.stubEnv('MARKOV_CLOUD_API_URL', '')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('signs out locally without calling the cloud logout endpoint', async () => {
    await connectCurrentMarkovProfile(userDataPath)
    const regionCache = join(userDataPath, 'markov-relay-region-preference.json')
    writeFileSync(regionCache, '{}')

    const result = await signOutCurrentMarkovProfile(userDataPath)

    expect(result.status).toBe('signed-out')
    expect(existsSync(regionCache)).toBe(false)
    expect(revokeMarkovCloudSessionMock).not.toHaveBeenCalled()
    expect(getCurrentMarkovProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'local',
      persistence: 'none'
    })
  })
})
