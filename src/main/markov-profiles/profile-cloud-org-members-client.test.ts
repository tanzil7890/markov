import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkovCloudAuthConfig } from './profile-cloud-auth-config'
import type { MarkovCloudSession } from './profile-cloud-session-store'

import { listMarkovCloudOrgMembers } from './profile-cloud-org-members-client'

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
  capabilities: { flags: {}, refreshedAt: 1 }
}

function mockJsonResponse(value: unknown, init: { ok?: boolean; status?: number } = {}): void {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => value
  })
}

describe('Markov cloud org members client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('normalizes the roster, dropping malformed rows and defaulting the viewer role', async () => {
    mockJsonResponse({
      members: [
        { userId: 'user-1', email: 'nina@example.com', displayName: 'Nina', role: 'admin' },
        { userId: null, email: 'pending-user@example.com', role: 'member' },
        { userId: 'user-3', email: 'weird@example.com', role: 'superadmin' },
        { userId: 'user-4' }
      ],
      pendingInvites: [{ email: 'invitee@example.com', role: 'member', createdAt: 1712000000000 }],
      viewerRole: 'not-a-role',
      canManageMembers: true
    })

    await expect(listMarkovCloudOrgMembers(config, session, 'org-1')).resolves.toEqual({
      members: [
        { userId: 'user-1', email: 'nina@example.com', displayName: 'Nina', role: 'admin' },
        { userId: null, email: 'pending-user@example.com', displayName: undefined, role: 'member' },
        { userId: 'user-3', email: 'weird@example.com', displayName: undefined, role: 'member' }
      ],
      pendingInvites: [{ email: 'invitee@example.com', role: 'member', createdAt: 1712000000000 }],
      viewerRole: 'member',
      canManageMembers: true
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://markov-cloud.example/v1/desktop/orgs/org-1/members',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer access-token' })
      })
    )
  })
})
