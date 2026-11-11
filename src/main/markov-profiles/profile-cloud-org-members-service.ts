import type {
  MarkovProfileOrgInviteRevokeArgs,
  MarkovProfileOrgMemberChangeRoleArgs,
  MarkovProfileOrgMemberInviteArgs,
  MarkovProfileOrgMemberMutationResult,
  MarkovProfileOrgMemberRemoveArgs,
  MarkovProfileOrgMembersListResult
} from '../../shared/markov-profiles'
import type { ActiveMarkovProfileState } from './profile-index-store'
import { ensureActiveMarkovProfile } from './profile-index-store'
import type { MarkovCloudAuthConfig } from './profile-cloud-auth-config'
import { getMarkovCloudAuthConfig, isMarkovCloudDevAuthEnabled } from './profile-cloud-auth-config'
import type { MarkovCloudSession } from './profile-cloud-session-store'
import { MarkovCloudRequestError } from './profile-cloud-client'
import { runWithFreshMarkovCloudSession } from './profile-cloud-session-refresh'
import {
  changeMarkovCloudOrgMemberRole,
  inviteMarkovCloudOrgMember,
  listMarkovCloudOrgMembers,
  removeMarkovCloudOrgMember,
  revokeMarkovCloudOrgInvite
} from './profile-cloud-org-members-client'
import {
  changeDevMarkovCloudOrgMemberRole,
  inviteDevMarkovCloudOrgMember,
  listDevMarkovCloudOrgMembers,
  removeDevMarkovCloudOrgMember,
  revokeDevMarkovCloudOrgInvite
} from './profile-cloud-dev-org-members'

type OrgCallResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'reconnect-required' }
  | { status: 'request-error'; error: MarkovCloudRequestError }
  | { status: 'failed'; error: string }

// Only 401 should trigger session refresh; return business/permission failures as values.
async function runOrgMemberCall<T>(
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string,
  call: (session: MarkovCloudSession) => Promise<T>
): Promise<OrgCallResult<T>> {
  try {
    const operation = await runWithFreshMarkovCloudSession(
      config,
      active,
      userDataPath,
      async (session) => {
        try {
          return { ok: true as const, value: await call(session) }
        } catch (error) {
          if (error instanceof MarkovCloudRequestError && error.statusCode !== 401) {
            return { ok: false as const, error }
          }
          throw error
        }
      }
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required' }
    }
    const outcome = operation.value
    return outcome.ok
      ? { status: 'ok', value: outcome.value }
      : { status: 'request-error', error: outcome.error }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function mapMutationRequestError(
  error: MarkovCloudRequestError
): MarkovProfileOrgMemberMutationResult {
  switch (error.statusCode) {
    case 403:
      return { status: 'forbidden' }
    case 404:
      return { status: 'not-found' }
    case 409:
      return {
        status: 'conflict',
        reason: error.errorCode === 'already_member' ? 'already_member' : 'already_invited'
      }
    case 400:
      return {
        status: 'invalid',
        reason:
          error.errorCode === 'cannot_remove_self' ? 'cannot_remove_self' : 'cannot_change_own_role'
      }
    default:
      return { status: 'failed', error: error.message }
  }
}

function mapMutationResult(result: OrgCallResult<void>): MarkovProfileOrgMemberMutationResult {
  switch (result.status) {
    case 'ok':
      return { status: 'ok' }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return mapMutationRequestError(result.error)
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function listMarkovProfileOrgMembers(
  userDataPath: string,
  orgId: string
): Promise<MarkovProfileOrgMembersListResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    return { status: 'ok', roster: listDevMarkovCloudOrgMembers(orgId) }
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  const result = await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
    listMarkovCloudOrgMembers(configState.config, session, orgId)
  )
  switch (result.status) {
    case 'ok':
      return { status: 'ok', roster: result.value }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return { status: 'failed', error: result.error.message }
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function inviteMarkovProfileOrgMember(
  userDataPath: string,
  args: MarkovProfileOrgMemberInviteArgs
): Promise<MarkovProfileOrgMemberMutationResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    return inviteDevMarkovCloudOrgMember(args)
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      inviteMarkovCloudOrgMember(configState.config, session, args)
    )
  )
}

export async function revokeMarkovProfileOrgInvite(
  userDataPath: string,
  args: MarkovProfileOrgInviteRevokeArgs
): Promise<MarkovProfileOrgMemberMutationResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    return revokeDevMarkovCloudOrgInvite(args)
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      revokeMarkovCloudOrgInvite(configState.config, session, args)
    )
  )
}

export async function changeMarkovProfileOrgMemberRole(
  userDataPath: string,
  args: MarkovProfileOrgMemberChangeRoleArgs
): Promise<MarkovProfileOrgMemberMutationResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    return changeDevMarkovCloudOrgMemberRole(args)
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      changeMarkovCloudOrgMemberRole(configState.config, session, args)
    )
  )
}

export async function removeMarkovProfileOrgMember(
  userDataPath: string,
  args: MarkovProfileOrgMemberRemoveArgs
): Promise<MarkovProfileOrgMemberMutationResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    return removeDevMarkovCloudOrgMember(args)
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      removeMarkovCloudOrgMember(configState.config, session, args)
    )
  )
}
