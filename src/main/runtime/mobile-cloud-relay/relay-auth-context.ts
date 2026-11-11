import type { MarkovCloudAuthConfig } from '../../markov-profiles/profile-cloud-auth-config'
import { ensureActiveMarkovProfile } from '../../markov-profiles/profile-index-store'
import { readFreshMarkovCloudSession } from '../../markov-profiles/profile-cloud-session-refresh'
import type { RelayAuthContext } from './relay-auth-identity'

export async function readRelayAuthContext(
  authConfig: MarkovCloudAuthConfig,
  userDataPath: string
): Promise<RelayAuthContext | null> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (!active.profile.cloud) {
    return null
  }
  const session = await readFreshMarkovCloudSession(authConfig, active, userDataPath)
  if (session.status !== 'found') {
    return null
  }
  // Refresh/org selection can change linkage; derive identity from post-refresh profile state.
  const refreshed = ensureActiveMarkovProfile(userDataPath)
  const cloud = refreshed.profile.cloud
  if (!cloud || refreshed.profile.id !== active.profile.id) {
    return null
  }
  return {
    identity: {
      userId: cloud.userId,
      profileId: cloud.cloudProfileId,
      organizationId: cloud.activeOrgId ?? ''
    },
    accessToken: session.session.accessToken,
    relayEntitled: session.session.capabilities.flags['relay.use'] === true
  }
}
