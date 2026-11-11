import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelTrackingResponse } from '../lib/unread-response-body.test-fixtures'
import type { MarkovCloudAuthConfig } from './profile-cloud-auth-config'
import type { MarkovCloudSession } from './profile-cloud-session-store'
import { refreshMarkovCloudCapabilities } from './profile-cloud-client'

const fetchMock = vi.fn()

const config: MarkovCloudAuthConfig = {
  apiBaseUrl: 'https://markov-cloud.example',
  authorizeEndpoint: 'https://markov-cloud.example/v1/desktop/auth/authorize',
  sessionEndpoint: 'https://markov-cloud.example/v1/desktop/auth/session',
  refreshEndpoint: 'https://markov-cloud.example/v1/desktop/auth/refresh',
  capabilitiesEndpoint: 'https://markov-cloud.example/v1/desktop/auth/capabilities',
  profileEndpoint: 'https://markov-cloud.example/v1/desktop/auth/profile',
  orgEndpoint: 'https://markov-cloud.example/v1/desktop/auth/org',
  logoutEndpoint: 'https://markov-cloud.example/v1/desktop/auth/logout',
  relayTokenEndpoint: 'https://markov-cloud.example/v1/desktop/auth/relay-token',
  connectorTokenEndpoint: 'https://markov-cloud.example/v1/desktop/auth/connector-token',
  relayDirectorUrl: 'https://relay.example',
  clientId: 'desktop-client',
  scope: 'openid profile email offline_access'
}

const session: MarkovCloudSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: 999,
  capabilities: { flags: { share: true }, refreshedAt: 1 }
}

describe('Markov cloud client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('cancels the unread error-response body so bundled undici cannot crash on socket close', async () => {
    let cancelledBodies = 0
    fetchMock.mockResolvedValue(
      cancelTrackingResponse(502, () => {
        cancelledBodies += 1
      })
    )

    await expect(refreshMarkovCloudCapabilities(config, session)).rejects.toThrow()
    expect(cancelledBodies).toBe(1)
  })
})
