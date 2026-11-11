import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  MarkovCloudCapabilities,
  MarkovCloudOrgSummary,
  MarkovProfileCloudSummary
} from '../../shared/markov-profiles'
import type { MarkovCloudSessionExchangeResponse } from './profile-cloud-session-exchange'

const {
  beginMarkovCloudPkceFlowMock,
  createMarkovCloudProfileMock,
  exchangeMarkovCloudAuthCodeMock,
  refreshMarkovCloudCapabilitiesMock,
  refreshMarkovCloudSessionMock,
  MarkovCloudRequestErrorMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginMarkovCloudPkceFlowMock: vi.fn(),
  createMarkovCloudProfileMock: vi.fn(),
  exchangeMarkovCloudAuthCodeMock: vi.fn(),
  refreshMarkovCloudCapabilitiesMock: vi.fn(),
  refreshMarkovCloudSessionMock: vi.fn(),
  MarkovCloudRequestErrorMock: class MarkovCloudRequestError extends Error {
    constructor(public readonly statusCode: number) {
      super(`markov_cloud_request_failed_${statusCode}`)
      this.name = 'MarkovCloudRequestError'
    }
  },
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
  MarkovCloudRequestError: MarkovCloudRequestErrorMock,
  isAmbiguousCloudRequestFailure: (error: unknown) =>
    !(error instanceof MarkovCloudRequestErrorMock),
  createMarkovCloudProfile: createMarkovCloudProfileMock,
  exchangeMarkovCloudAuthCode: exchangeMarkovCloudAuthCodeMock,
  refreshMarkovCloudCapabilities: refreshMarkovCloudCapabilitiesMock,
  refreshMarkovCloudSession: refreshMarkovCloudSessionMock,
  revokeMarkovCloudSession: vi.fn(),
  selectMarkovCloudOrg: vi.fn()
}))

import {
  connectCurrentMarkovProfile,
  createCloudLinkedMarkovProfile,
  getCurrentMarkovProfileAuthStatus,
  refreshCurrentMarkovProfileAuth
} from './profile-cloud-service'

const cloudSummary: MarkovProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const capabilities: MarkovCloudCapabilities = {
  flags: { share: true },
  refreshedAt: 11
}

const organizations: MarkovCloudOrgSummary[] = [
  { orgId: 'org-1', name: 'Acme', role: 'Admin' },
  { orgId: 'org-2', name: 'Personal' }
]

function futureExpiresAt(): number {
  return Date.now() + 3_600_000
}

function configureCloudEnv(): void {
  vi.stubEnv('MARKOV_CLOUD_API_URL', 'https://markov-cloud.example')
  vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', 'desktop-client')
}

function mockSuccessfulConnect(expiresAt = futureExpiresAt()): void {
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
    expiresAt,
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies MarkovCloudSessionExchangeResponse)
}

describe('Markov cloud profile service session refresh', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-cloud-service-refresh-'))
    beginMarkovCloudPkceFlowMock.mockReset()
    createMarkovCloudProfileMock.mockReset()
    exchangeMarkovCloudAuthCodeMock.mockReset()
    refreshMarkovCloudCapabilitiesMock.mockReset()
    refreshMarkovCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('MARKOV_CLOUD_API_URL', '')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('refreshes an expired access token before creating cloud profiles', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentMarkovProfile(userDataPath)
    refreshMarkovCloudSessionMock.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: cloudSummary,
      organizations,
      capabilities
    } satisfies MarkovCloudSessionExchangeResponse)
    createMarkovCloudProfileMock.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: {
        ...cloudSummary,
        cloudProfileId: 'cloud-profile-2',
        activeOrgId: 'org-1',
        activeOrgName: 'Acme'
      },
      organizations,
      capabilities
    } satisfies MarkovCloudSessionExchangeResponse)

    const result = await createCloudLinkedMarkovProfile(userDataPath, {
      orgId: 'org-1',
      name: 'Acme'
    })

    expect(result.status).toBe('created')
    expect(refreshMarkovCloudSessionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ refreshToken: 'refresh-token' })
    )
    expect(createMarkovCloudProfileMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      { orgId: 'org-1', name: 'Acme' }
    )
  })

  it('clears stale active org metadata when capability refresh returns no active org', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    exchangeMarkovCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: { ...cloudSummary, activeOrgId: 'org-1', activeOrgName: 'Acme' },
      organizations,
      capabilities
    } satisfies MarkovCloudSessionExchangeResponse)
    await connectCurrentMarkovProfile(userDataPath)
    refreshMarkovCloudCapabilitiesMock.mockResolvedValue({
      cloud: cloudSummary,
      organizations: [],
      capabilities: {
        flags: { share: false },
        refreshedAt: 31
      }
    })

    const result = await refreshCurrentMarkovProfileAuth(userDataPath)
    const status = getCurrentMarkovProfileAuthStatus(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(status.cloud?.activeOrgId).toBeUndefined()
    expect(status.cloud?.activeOrgName).toBeUndefined()
    expect(status.organizations).toEqual([])
    expect(status.capabilities).toEqual({
      flags: { share: false },
      refreshedAt: 31
    })
  })

  it('requires reconnect when an expired refresh token is rejected', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentMarkovProfile(userDataPath)
    refreshMarkovCloudSessionMock.mockRejectedValue(new MarkovCloudRequestErrorMock(401))

    const result = await refreshCurrentMarkovProfileAuth(userDataPath)

    expect(result.status).toBe('reconnect-required')
    expect(getCurrentMarkovProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'reconnect-required',
      persistence: 'none',
      cloud: cloudSummary
    })
  })
})
