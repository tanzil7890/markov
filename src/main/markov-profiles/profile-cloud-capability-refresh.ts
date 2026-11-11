import type { RefreshCurrentMarkovProfileAuthResult } from '../../shared/markov-profiles'
import { getMarkovCloudAuthConfig, isMarkovCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { getMarkovProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { refreshMarkovCloudCapabilities } from './profile-cloud-client'
import { ensureActiveMarkovProfile } from './profile-index-store'
import { refreshDevMarkovCloudProfile } from './profile-cloud-dev-service'
import {
  commitCloudSessionCapabilities,
  takeCloudSessionTicket,
  type CloudSessionTicket
} from './profile-cloud-session-owner'
import { runWithFreshMarkovCloudSession } from './profile-cloud-session-refresh'

export async function refreshCurrentMarkovProfileAuth(
  userDataPath: string
): Promise<RefreshCurrentMarkovProfileAuthResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  const auth = () => getMarkovProfileAuthStatusFromProfile(active, userDataPath)
  if (!active.profile.cloud) {
    return { status: 'local', auth: auth() }
  }
  if (isMarkovCloudDevAuthEnabled()) {
    const result = refreshDevMarkovCloudProfile(active, userDataPath)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: auth() }
    }
    return {
      status: 'refreshed',
      auth: auth(),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }
  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: auth() }
  }
  try {
    const cloud = active.profile.cloud
    let ticket: CloudSessionTicket | undefined
    const operation = await runWithFreshMarkovCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => {
        // Take the ticket after refresh because refreshing may relink the session.
        ticket = takeCloudSessionTicket(active.profile.id, userDataPath)
        return refreshMarkovCloudCapabilities(configState.config, session)
      }
    )
    if (operation.status !== 'ok' || !ticket) {
      return { status: 'reconnect-required', auth: auth() }
    }
    const refresh = operation.value
    if (
      refresh.cloud &&
      (refresh.cloud.userId !== cloud.userId ||
        refresh.cloud.cloudProfileId !== cloud.cloudProfileId)
    ) {
      throw new Error('markov_cloud_identity_changed_during_capability_refresh')
    }
    const list = commitCloudSessionCapabilities(active.profile.id, userDataPath, ticket, refresh)
    if (!list) {
      return { status: 'reconnect-required', auth: auth() }
    }
    return {
      status: 'refreshed',
      auth: getMarkovProfileAuthStatusFromProfile(
        ensureActiveMarkovProfile(userDataPath),
        userDataPath
      ),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: auth(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
