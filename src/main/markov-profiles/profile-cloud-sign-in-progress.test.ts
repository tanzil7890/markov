import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { beginMarkovCloudPkceFlowMock, exchangeMarkovCloudAuthCodeMock, safeStorageMock } =
  vi.hoisted(() => ({
    beginMarkovCloudPkceFlowMock: vi.fn(),
    exchangeMarkovCloudAuthCodeMock: vi.fn(),
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
  revokeMarkovCloudSession: vi.fn().mockResolvedValue(undefined),
  selectMarkovCloudOrg: vi.fn()
}))

import { connectCurrentMarkovProfile, signOutCurrentMarkovProfile } from './profile-cloud-service'
import {
  cancelMarkovCloudSignIn,
  getMarkovCloudSignInProgress,
  onMarkovCloudSignInProgressChanged
} from './profile-cloud-sign-in-progress'

type BrowserWait = {
  link: string
  publish: () => void
  answer: (code: string) => void
  fail: (error: Error) => void
}

function queueBrowserWaits(): BrowserWait[] {
  const waits: BrowserWait[] = []
  beginMarkovCloudPkceFlowMock.mockImplementation(
    (
      _config,
      _profileId,
      options: { onAuthorizeUrl: (link: string) => void; signal: AbortSignal }
    ) =>
      new Promise((resolve, reject) => {
        const link = `https://markov-cloud.example/authorize?attempt=${waits.length + 1}`
        options.signal.addEventListener('abort', () =>
          reject(new Error('markov_cloud_auth_cancelled'))
        )
        waits.push({
          link,
          publish: () => options.onAuthorizeUrl(link),
          answer: (code) =>
            resolve({
              code,
              codeVerifier: 'verifier',
              nonce: 'nonce',
              redirectUri: 'http://127.0.0.1:4100/auth/callback',
              state: 'state'
            }),
          fail: reject
        })
      })
  )
  return waits
}

describe('Markov cloud sign-in progress', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-cloud-sign-in-progress-'))
    beginMarkovCloudPkceFlowMock.mockReset()
    exchangeMarkovCloudAuthCodeMock.mockReset()
    vi.stubEnv('MARKOV_CLOUD_API_URL', 'https://markov-cloud.example')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', 'desktop-client')
  })

  afterEach(async () => {
    await signOutCurrentMarkovProfile(userDataPath)
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('announces the newest wait and ends it when the wait times out', async () => {
    const changes: unknown[] = []
    const unsubscribe = onMarkovCloudSignInProgressChanged((progress) => changes.push(progress))
    const waits = queueBrowserWaits()
    const first = connectCurrentMarkovProfile(userDataPath)
    const second = connectCurrentMarkovProfile(userDataPath)
    await vi.waitFor(() => expect(waits).toHaveLength(2))
    waits[1].publish()

    waits[0].fail(new Error('markov_cloud_auth_timeout'))
    await expect(first).resolves.toMatchObject({ status: 'cancelled' })
    expect(getMarkovCloudSignInProgress()).toEqual({ link: waits[1].link })

    waits[1].fail(new Error('markov_cloud_auth_timeout'))
    await expect(second).resolves.toMatchObject({ status: 'timed-out' })
    expect(changes).toEqual([{ link: null }, { link: null }, { link: waits[1].link }, null])
    unsubscribe()
  })

  it('keeps the newest link when an older attempt reports its link late and then ends', async () => {
    const waits = queueBrowserWaits()
    const older = connectCurrentMarkovProfile(userDataPath)
    void connectCurrentMarkovProfile(userDataPath)
    await vi.waitFor(() => expect(waits).toHaveLength(2))

    waits[1].publish()
    waits[0].publish()
    expect(getMarkovCloudSignInProgress()).toEqual({ link: waits[1].link })

    waits[0].fail(new Error('markov_cloud_auth_denied'))
    await expect(older).resolves.toMatchObject({ status: 'cancelled' })
    expect(getMarkovCloudSignInProgress()).toEqual({ link: waits[1].link })
  })

  it('drops the link once the browser answers but stays in progress until sign-in ends', async () => {
    const waits = queueBrowserWaits()
    let failExchange!: (error: Error) => void
    exchangeMarkovCloudAuthCodeMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        failExchange = reject
      })
    )
    const attempt = connectCurrentMarkovProfile(userDataPath)
    await vi.waitFor(() => expect(waits).toHaveLength(1))
    waits[0].publish()

    waits[0].answer('code')
    await vi.waitFor(() => expect(exchangeMarkovCloudAuthCodeMock).toHaveBeenCalledOnce())
    expect(getMarkovCloudSignInProgress()).toEqual({ link: null })

    failExchange(new Error('exchange_failed'))
    await expect(attempt).resolves.toMatchObject({ status: 'failed' })
    expect(getMarkovCloudSignInProgress()).toBeNull()
  })

  it('cancels the browser wait silently', async () => {
    const waits = queueBrowserWaits()
    const attempt = connectCurrentMarkovProfile(userDataPath)
    await vi.waitFor(() => expect(waits).toHaveLength(1))
    waits[0].publish()

    cancelMarkovCloudSignIn()

    await expect(attempt).resolves.toMatchObject({ status: 'cancelled' })
    expect(getMarkovCloudSignInProgress()).toBeNull()
  })

  it('ends the progress on sign-out', async () => {
    const waits = queueBrowserWaits()
    const attempt = connectCurrentMarkovProfile(userDataPath)
    await vi.waitFor(() => expect(waits).toHaveLength(1))
    waits[0].publish()

    await signOutCurrentMarkovProfile(userDataPath)
    expect(getMarkovCloudSignInProgress()).toBeNull()
    waits[0].fail(new Error('markov_cloud_auth_timeout'))
    await expect(attempt).resolves.toMatchObject({ status: 'cancelled' })
  })
})
