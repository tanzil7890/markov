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
  revokeMarkovCloudSession: revokeMarkovCloudSessionMock,
  selectMarkovCloudOrg: vi.fn()
}))

import {
  connectCurrentMarkovProfile,
  getCurrentMarkovProfileAuthStatus,
  signOutCurrentMarkovProfile
} from './profile-cloud-service'

const earlierCloud: MarkovProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const laterCloud: MarkovProfileCloudSummary = {
  ...earlierCloud,
  cloudProfileId: 'cloud-profile-2',
  userId: 'user-2',
  email: 'ada@example.com'
}

const capabilities: MarkovCloudCapabilities = {
  flags: { share: true },
  refreshedAt: 11
}

const organizations: MarkovCloudOrgSummary[] = [{ orgId: 'org-1', name: 'Acme', role: 'Admin' }]

describe('Markov cloud overlapping connect', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-cloud-connect-overlap-'))
    beginMarkovCloudPkceFlowMock.mockReset()
    exchangeMarkovCloudAuthCodeMock.mockReset()
    revokeMarkovCloudSessionMock.mockReset()
    revokeMarkovCloudSessionMock.mockResolvedValue(undefined)
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.stubEnv('MARKOV_CLOUD_API_URL', 'https://markov-cloud.example')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', 'desktop-client')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('does not let an earlier sign-in overwrite a later successful connect', async () => {
    let finishFirst!: (value: {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
      state: string
    }) => void
    beginMarkovCloudPkceFlowMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve
        })
      )
      .mockResolvedValueOnce({
        code: 'later-code',
        codeVerifier: 'later-verifier',
        nonce: 'later-nonce',
        redirectUri: 'http://127.0.0.1:4101/auth/callback',
        state: 'later-state'
      })
    exchangeMarkovCloudAuthCodeMock.mockImplementation(async (_config, args) => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
      cloud: args.code === 'later-code' ? laterCloud : earlierCloud,
      organizations,
      capabilities
    }))

    const first = connectCurrentMarkovProfile(userDataPath)
    const later = connectCurrentMarkovProfile(userDataPath)
    await expect(later).resolves.toMatchObject({ status: 'connected' })
    expect(getCurrentMarkovProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')

    finishFirst({
      code: 'earlier-code',
      codeVerifier: 'earlier-verifier',
      nonce: 'earlier-nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'earlier-state'
    })
    await expect(first).resolves.toMatchObject({ status: 'cancelled' })
    expect(exchangeMarkovCloudAuthCodeMock).toHaveBeenCalledTimes(1)
    expect(exchangeMarkovCloudAuthCodeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ code: 'later-code' })
    )
    expect(getCurrentMarkovProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')
  })

  it('does not relink an in-flight later wait after sign-out', async () => {
    type PkceCode = {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
      state: string
    }
    let finishEarlierPkce!: (value: PkceCode) => void
    let finishLaterPkce!: (value: PkceCode) => void
    beginMarkovCloudPkceFlowMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishEarlierPkce = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishLaterPkce = resolve
        })
      )
    exchangeMarkovCloudAuthCodeMock.mockImplementation(async (_config, args) => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
      cloud: args.code === 'later-code' ? laterCloud : earlierCloud,
      organizations,
      capabilities
    }))

    const earlier = connectCurrentMarkovProfile(userDataPath)
    const later = connectCurrentMarkovProfile(userDataPath)
    finishEarlierPkce({
      code: 'earlier-code',
      codeVerifier: 'earlier-verifier',
      nonce: 'earlier-nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'earlier-state'
    })
    await expect(earlier).resolves.toMatchObject({ status: 'connected' })
    await expect(signOutCurrentMarkovProfile(userDataPath)).resolves.toMatchObject({
      status: 'signed-out'
    })
    finishLaterPkce({
      code: 'later-code',
      codeVerifier: 'later-verifier',
      nonce: 'later-nonce',
      redirectUri: 'http://127.0.0.1:4101/auth/callback',
      state: 'later-state'
    })
    await expect(later).resolves.toMatchObject({ status: 'cancelled' })
    expect(exchangeMarkovCloudAuthCodeMock).toHaveBeenCalledTimes(1)
    expect(getCurrentMarkovProfileAuthStatus(userDataPath)).toMatchObject({ state: 'local' })
  })
})
