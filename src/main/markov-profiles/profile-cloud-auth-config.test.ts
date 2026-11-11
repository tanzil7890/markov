import { describe, expect, it, vi } from 'vitest'
import {
  allowsPlaintextMarkovCloudSession,
  getMarkovCloudAuthConfig,
  isMarkovCloudDevAuthEnabled
} from './profile-cloud-auth-config'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

describe('Markov cloud auth config', () => {
  it('rejects loopback HTTP endpoints in packaged builds', () => {
    expect(
      getMarkovCloudAuthConfig(
        {
          MARKOV_CLOUD_API_URL: 'http://localhost:4100',
          MARKOV_CLOUD_CLIENT_ID: 'desktop-client'
        },
        true
      )
    ).toMatchObject({ configured: false })

    const httpsState = getMarkovCloudAuthConfig(
      {
        MARKOV_CLOUD_API_URL: 'https://markov-cloud.example',
        MARKOV_CLOUD_CLIENT_ID: 'desktop-client'
      },
      true
    )
    expect(httpsState.configured).toBe(true)
  })

  it('rejects non-HTTPS non-loopback API URLs', () => {
    expect(
      getMarkovCloudAuthConfig({
        MARKOV_CLOUD_API_URL: 'http://markov-cloud.example',
        MARKOV_CLOUD_CLIENT_ID: 'desktop-client'
      })
    ).toMatchObject({ configured: false })
  })

  it('ignores dev flags in packaged builds even without NODE_ENV', () => {
    expect(
      allowsPlaintextMarkovCloudSession({ MARKOV_CLOUD_ALLOW_PLAINTEXT_SESSION: '1' }, true)
    ).toBe(false)
    expect(isMarkovCloudDevAuthEnabled({ MARKOV_CLOUD_DEV_AUTH: '1' }, true)).toBe(false)
  })
})
