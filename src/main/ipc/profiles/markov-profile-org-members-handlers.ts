import { ipcMain } from 'electron'
import type {
  MarkovOrgRole,
  MarkovProfileOrgInviteRevokeArgs,
  MarkovProfileOrgMemberChangeRoleArgs,
  MarkovProfileOrgMemberInviteArgs,
  MarkovProfileOrgMemberMutationResult,
  MarkovProfileOrgMemberRemoveArgs,
  MarkovProfileOrgMembersListArgs,
  MarkovProfileOrgMembersListResult
} from '../../../shared/markov-profiles'
import { getProfileUserDataPath } from '../../markov-profiles/profile-storage-paths'
import {
  changeMarkovProfileOrgMemberRole,
  inviteMarkovProfileOrgMember,
  listMarkovProfileOrgMembers,
  removeMarkovProfileOrgMember,
  revokeMarkovProfileOrgInvite
} from '../../markov-profiles/profile-cloud-org-members-service'

function orgMembersScopedArgs(args: unknown): { orgId: string; record: Record<string, unknown> } {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_markov_profile_org_selection')
  }
  const record = args as Record<string, unknown>
  const orgId = typeof record.orgId === 'string' ? record.orgId.trim() : ''
  if (!orgId) {
    throw new Error('invalid_markov_profile_org_selection')
  }
  return { orgId, record }
}

function orgRoleFromUnknown(value: unknown): MarkovOrgRole {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value
  }
  throw new Error('invalid_markov_org_role')
}

function orgEmailFromUnknown(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) {
    throw new Error('invalid_markov_org_member_email')
  }
  return email
}

function orgUserIdFromUnknown(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : ''
  if (!userId) {
    throw new Error('invalid_markov_org_member_user')
  }
  return userId
}

function orgMemberInviteArgsFromUnknown(args: unknown): MarkovProfileOrgMemberInviteArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email), role: orgRoleFromUnknown(record.role) }
}

function orgInviteRevokeArgsFromUnknown(args: unknown): MarkovProfileOrgInviteRevokeArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email) }
}

function orgMemberChangeRoleArgsFromUnknown(args: unknown): MarkovProfileOrgMemberChangeRoleArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return {
    orgId,
    userId: orgUserIdFromUnknown(record.userId),
    role: orgRoleFromUnknown(record.role)
  }
}

function orgMemberRemoveArgsFromUnknown(args: unknown): MarkovProfileOrgMemberRemoveArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, userId: orgUserIdFromUnknown(record.userId) }
}

export function registerMarkovProfileOrgMemberHandlers(): void {
  ipcMain.handle(
    'markovProfiles:orgMembersList',
    async (
      _event,
      rawArgs: MarkovProfileOrgMembersListArgs
    ): Promise<MarkovProfileOrgMembersListResult> =>
      listMarkovProfileOrgMembers(getProfileUserDataPath(), orgMembersScopedArgs(rawArgs).orgId)
  )

  ipcMain.handle(
    'markovProfiles:orgMemberInvite',
    async (
      _event,
      rawArgs: MarkovProfileOrgMemberInviteArgs
    ): Promise<MarkovProfileOrgMemberMutationResult> =>
      inviteMarkovProfileOrgMember(
        getProfileUserDataPath(),
        orgMemberInviteArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'markovProfiles:orgInviteRevoke',
    async (
      _event,
      rawArgs: MarkovProfileOrgInviteRevokeArgs
    ): Promise<MarkovProfileOrgMemberMutationResult> =>
      revokeMarkovProfileOrgInvite(
        getProfileUserDataPath(),
        orgInviteRevokeArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'markovProfiles:orgMemberChangeRole',
    async (
      _event,
      rawArgs: MarkovProfileOrgMemberChangeRoleArgs
    ): Promise<MarkovProfileOrgMemberMutationResult> =>
      changeMarkovProfileOrgMemberRole(
        getProfileUserDataPath(),
        orgMemberChangeRoleArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'markovProfiles:orgMemberRemove',
    async (
      _event,
      rawArgs: MarkovProfileOrgMemberRemoveArgs
    ): Promise<MarkovProfileOrgMemberMutationResult> =>
      removeMarkovProfileOrgMember(
        getProfileUserDataPath(),
        orgMemberRemoveArgsFromUnknown(rawArgs)
      )
  )
}
