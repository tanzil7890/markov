import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MarkovCloudRequestError } from './profile-cloud-client'

const {
  runWithFreshMarkovCloudSessionMock,
  listMarkovCloudOrgMembersMock,
  inviteMarkovCloudOrgMemberMock,
  revokeMarkovCloudOrgInviteMock,
  changeMarkovCloudOrgMemberRoleMock,
  removeMarkovCloudOrgMemberMock
} = vi.hoisted(() => ({
  runWithFreshMarkovCloudSessionMock: vi.fn(),
  listMarkovCloudOrgMembersMock: vi.fn(),
  inviteMarkovCloudOrgMemberMock: vi.fn(),
  revokeMarkovCloudOrgInviteMock: vi.fn(),
  changeMarkovCloudOrgMemberRoleMock: vi.fn(),
  removeMarkovCloudOrgMemberMock: vi.fn()
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataPath }
}))

vi.mock('./profile-cloud-session-refresh', () => ({
  runWithFreshMarkovCloudSessionMock,
  runWithFreshMarkovCloudSession: runWithFreshMarkovCloudSessionMock
}))

vi.mock('./profile-cloud-org-members-client', () => ({
  listMarkovCloudOrgMembers: listMarkovCloudOrgMembersMock,
  inviteMarkovCloudOrgMember: inviteMarkovCloudOrgMemberMock,
  revokeMarkovCloudOrgInvite: revokeMarkovCloudOrgInviteMock,
  changeMarkovCloudOrgMemberRole: changeMarkovCloudOrgMemberRoleMock,
  removeMarkovCloudOrgMember: removeMarkovCloudOrgMemberMock
}))

import {
  changeMarkovProfileOrgMemberRole,
  inviteMarkovProfileOrgMember,
  removeMarkovProfileOrgMember,
  revokeMarkovProfileOrgInvite
} from './profile-cloud-org-members-service'

const fakeSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  capabilities: { flags: {}, refreshedAt: 1 }
}

// Business 4xx return as values, so the session layer sees only thrown auth failures.
function runOperationDirectly(): void {
  runWithFreshMarkovCloudSessionMock.mockImplementation(
    async (
      _config: unknown,
      _active: unknown,
      _path: unknown,
      op: (session: unknown) => unknown
    ) => ({
      status: 'ok',
      value: await op(fakeSession)
    })
  )
}

function configureCloudEnv(): void {
  vi.stubEnv('MARKOV_CLOUD_API_URL', 'https://markov-cloud.example')
  vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', 'desktop-client')
}

describe('Markov cloud org members service (configured)', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'markov-org-members-'))
    runWithFreshMarkovCloudSessionMock.mockReset()
    listMarkovCloudOrgMembersMock.mockReset()
    inviteMarkovCloudOrgMemberMock.mockReset()
    revokeMarkovCloudOrgInviteMock.mockReset()
    changeMarkovCloudOrgMemberRoleMock.mockReset()
    removeMarkovCloudOrgMemberMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('MARKOV_CLOUD_DEV_AUTH', '')
    vi.stubEnv('MARKOV_CLOUD_API_URL', '')
    vi.stubEnv('MARKOV_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('maps a 409 already_member invite conflict', async () => {
    configureCloudEnv()
    runOperationDirectly()
    inviteMarkovCloudOrgMemberMock.mockRejectedValue(
      new MarkovCloudRequestError(409, 'already_member')
    )

    await expect(
      inviteMarkovProfileOrgMember(userDataPath, {
        orgId: 'org-1',
        email: 'a@b.com',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'conflict', reason: 'already_member' })
  })

  it('maps a 403 role change to forbidden', async () => {
    configureCloudEnv()
    runOperationDirectly()
    changeMarkovCloudOrgMemberRoleMock.mockRejectedValue(new MarkovCloudRequestError(403))

    await expect(
      changeMarkovProfileOrgMemberRole(userDataPath, {
        orgId: 'org-1',
        userId: 'user-2',
        role: 'admin'
      })
    ).resolves.toEqual({ status: 'forbidden' })
  })

  it('maps a 400 cannot_remove_self to an invalid result', async () => {
    configureCloudEnv()
    runOperationDirectly()
    removeMarkovCloudOrgMemberMock.mockRejectedValue(
      new MarkovCloudRequestError(400, 'cannot_remove_self')
    )

    await expect(
      removeMarkovProfileOrgMember(userDataPath, { orgId: 'org-1', userId: 'user-1' })
    ).resolves.toEqual({ status: 'invalid', reason: 'cannot_remove_self' })
  })

  it('maps a 404 revoke to not-found', async () => {
    configureCloudEnv()
    runOperationDirectly()
    revokeMarkovCloudOrgInviteMock.mockRejectedValue(new MarkovCloudRequestError(404))

    await expect(
      revokeMarkovProfileOrgInvite(userDataPath, { orgId: 'org-1', email: 'gone@b.com' })
    ).resolves.toEqual({ status: 'not-found' })
  })
})
