import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  MarkovCloudCapabilities,
  MarkovCloudOrgSummary,
  MarkovProfileCloudSummary
} from '../../shared/markov-profiles'

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
  app: { getPath: () => userDataPath },
  safeStorage: safeStorageMock
}))

vi.mock('./profile-cloud-pkce', () => ({
  beginMarkovCloudPkceFlow: beginMarkovCloudPkceFlowMock
}))

vi.mock('./profile-cloud-client', () => ({
  createMarkovCloudProfile: vi.fn(),
  exchangeMarkovCloudAuthCode: exchangeMarkovCloudAuthCodeMock,
  revokeMarkovCloudSession: revokeMarkovCloudSessionMock,
  selectMarkovCloudOrg: vi.fn()
}))

import {
  connectCurrentMarkovProfile,
  getCurrentMarkovProfileAuthStatus,
  signOutCurrentMarkovProfile
} from './profile-cloud-service'

const cloud: MarkovProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const laterCloud: MarkovProfileCloudSummary = {
  ...cloud,
  cloudProfileId: 'cloud-profile-2',
  email: 'ada@example.com'
}

const capabilities: MarkovCloudCapabilities = { flags: { share: true }, refreshedAt: 11 }
const organizations: MarkovCloudOrgSummary[] = [{ orgId: 'org-1', name: 'Acme', role: 'Admin' }]

describe('Markov cloud sign-out vs newer connect', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-cloud-sign-out-connect-'))
    beginMarkovCloudPkceFlowMock.mockReset()
    exchangeMarkovCloudAuthCodeMock.mockReset()
    revokeMarkovCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.stubEnv('MARKOV_CLOUD_API_URL', 'https://markov-cloud.example')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', 'desktop-client')
    beginMarkovCloudPkceFlowMock.mockResolvedValue({
      code: 'auth-code',
      codeVerifier: 'code-verifier',
      nonce: 'nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'state'
    })
    exchangeMarkovCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
      cloud,
      organizations,
      capabilities
    })
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('keeps a newer connect that finishes while sign-out is still revoking', async () => {
    await expect(connectCurrentMarkovProfile(userDataPath)).resolves.toMatchObject({
      status: 'connected'
    })
    let finishRevoke!: () => void
    revokeMarkovCloudSessionMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRevoke = resolve
      })
    )
    const signingOut = signOutCurrentMarkovProfile(userDataPath)
    exchangeMarkovCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'later-access',
      refreshToken: 'later-refresh',
      expiresAt: Date.now() + 3_600_000,
      cloud: laterCloud,
      organizations,
      capabilities
    })
    await expect(connectCurrentMarkovProfile(userDataPath)).resolves.toMatchObject({
      status: 'connected'
    })
    expect(getCurrentMarkovProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')
    finishRevoke()
    await expect(signingOut).resolves.toMatchObject({ status: 'signed-out' })
    expect(getCurrentMarkovProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'connected',
      cloud: { email: 'ada@example.com' }
    })
  })
})
