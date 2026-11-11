import type {
  ConnectCurrentMarkovProfileResult,
  CreateCloudLinkedMarkovProfileArgs,
  CreateCloudLinkedMarkovProfileResult,
  MarkovProfileAuthStatus,
  SelectMarkovProfileOrgResult,
  SignOutCurrentMarkovProfileResult
} from '../../shared/markov-profiles'
import { ensureActiveMarkovProfile } from './profile-index-store'
import { getMarkovCloudAuthConfig, isMarkovCloudDevAuthEnabled } from './profile-cloud-auth-config'
import {
  invalidateCloudSessionChanges,
  readCloudSession,
  signInCloudSession,
  signOutCloudSession
} from './profile-cloud-session-owner'
import {
  createMarkovCloudProfile,
  exchangeMarkovCloudAuthCode,
  revokeMarkovCloudSession
} from './profile-cloud-client'
import { beginMarkovCloudPkceFlow } from './profile-cloud-pkce'
import {
  createCloudLinkedMarkovProfileRecord,
  linkMarkovProfileToCloud,
  unlinkMarkovProfileFromCloud
} from './profile-cloud-index'
import { runWithFreshMarkovCloudSession } from './profile-cloud-session-refresh'
import {
  connectDevMarkovCloudProfile,
  createDevCloudLinkedMarkovProfile,
  selectDevMarkovCloudOrg
} from './profile-cloud-dev-service'
import { getMarkovProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { selectCloudOrg } from './profile-cloud-org-selection'
import {
  endMarkovCloudSignInProgress,
  setMarkovCloudSignInLink,
  startMarkovCloudSignInProgress
} from './profile-cloud-sign-in-progress'
import { clearRelayRegionPreferenceCache } from '../runtime/mobile-cloud-relay/relay-region-preference'

export { refreshCurrentMarkovProfileAuth } from './profile-cloud-capability-refresh'

let nextCloudConnectAttempt = 0
let linkedCloudConnectAttempt = 0

function invalidateOutstandingCloudConnectAttempts(): void {
  nextCloudConnectAttempt += 1
  linkedCloudConnectAttempt = nextCloudConnectAttempt
  endMarkovCloudSignInProgress()
}

function activeAuth(
  active: ReturnType<typeof ensureActiveMarkovProfile>,
  userDataPath: string
): MarkovProfileAuthStatus {
  return getMarkovProfileAuthStatusFromProfile(active, userDataPath)
}

export function getCurrentMarkovProfileAuthStatus(userDataPath: string): MarkovProfileAuthStatus {
  return getMarkovProfileAuthStatusFromProfile(
    ensureActiveMarkovProfile(userDataPath),
    userDataPath
  )
}

export async function connectCurrentMarkovProfile(
  userDataPath: string
): Promise<ConnectCurrentMarkovProfileResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    const list = connectDevMarkovCloudProfile(active, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  }

  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: activeAuth(active, userDataPath)
    }
  }

  const attempt = ++nextCloudConnectAttempt
  const browserWait = new AbortController()
  startMarkovCloudSignInProgress(attempt, () => browserWait.abort())
  try {
    const code = await beginMarkovCloudPkceFlow(configState.config, active.profile.id, {
      signal: browserWait.signal,
      onAuthorizeUrl: (link) => setMarkovCloudSignInLink(attempt, link)
    })
    // The callback listener has closed, so its browser link is dead.
    setMarkovCloudSignInLink(attempt, null)
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentMarkovProfileAuthStatus(userDataPath)
      }
    }
    const exchange = await exchangeMarkovCloudAuthCode(configState.config, {
      ...code,
      localProfileId: active.profile.id
    })
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentMarkovProfileAuthStatus(userDataPath)
      }
    }
    signInCloudSession(active.profile.id, userDataPath, exchange)
    const list = linkMarkovProfileToCloud(active.profile.id, exchange.cloud, userDataPath)
    linkedCloudConnectAttempt = attempt
    return {
      status: 'connected',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'markov_cloud_auth_timeout' && attempt === nextCloudConnectAttempt) {
      return {
        status: 'timed-out',
        auth: getCurrentMarkovProfileAuthStatus(userDataPath)
      }
    }
    if (
      message === 'markov_cloud_auth_timeout' ||
      message === 'markov_cloud_auth_denied' ||
      message === 'markov_cloud_auth_cancelled'
    ) {
      return {
        status: 'cancelled',
        auth: getCurrentMarkovProfileAuthStatus(userDataPath)
      }
    }
    return {
      status: 'failed',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      error: message
    }
  } finally {
    endMarkovCloudSignInProgress(attempt)
  }
}

export async function signOutCurrentMarkovProfile(
  userDataPath: string
): Promise<SignOutCurrentMarkovProfileResult> {
  // Pending browser sign-ins must not relink after explicit sign-out.
  invalidateOutstandingCloudConnectAttempts()
  const signOutEpoch = linkedCloudConnectAttempt
  const active = ensureActiveMarkovProfile(userDataPath)
  const configState = getMarkovCloudAuthConfig()
  const session = readCloudSession(active.profile.id, userDataPath)
  // Fence before network I/O so in-flight refreshes cannot save after sign-out.
  invalidateCloudSessionChanges(active.profile.id, userDataPath)
  if (!isMarkovCloudDevAuthEnabled() && configState.configured && session.status === 'found') {
    await revokeMarkovCloudSession(configState.config, session.session).catch(() => undefined)
  }
  if (linkedCloudConnectAttempt > signOutEpoch) {
    const current = ensureActiveMarkovProfile(userDataPath)
    return {
      status: 'signed-out',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: current.index.activeProfileId,
      profiles: current.index.profiles
    }
  }
  signOutCloudSession(active.profile.id, userDataPath)
  const list = unlinkMarkovProfileFromCloud(active.profile.id, userDataPath)
  try {
    clearRelayRegionPreferenceCache(userDataPath)
  } catch {
    // A leftover latency cache must not fail the sign-out itself.
  }
  return {
    status: 'signed-out',
    auth: getCurrentMarkovProfileAuthStatus(userDataPath),
    activeProfileId: list.activeProfileId,
    profiles: list.profiles
  }
}

export async function createCloudLinkedMarkovProfile(
  userDataPath: string,
  args: CreateCloudLinkedMarkovProfileArgs
): Promise<CreateCloudLinkedMarkovProfileResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    const result = createDevCloudLinkedMarkovProfile(active, userDataPath, args)
    if (result.status !== 'created') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'created',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles,
      profile: result.list.profile
    }
  }

  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const operation = await runWithFreshMarkovCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => createMarkovCloudProfile(configState.config, session, args)
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    const created = operation.value
    const list = createCloudLinkedMarkovProfileRecord(
      created.cloud,
      { name: args.name },
      userDataPath
    )
    signInCloudSession(list.profile.id, userDataPath, created)
    return {
      status: 'created',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles,
      profile: list.profile
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function selectCurrentMarkovProfileOrg(
  userDataPath: string,
  orgId: string
): Promise<SelectMarkovProfileOrgResult> {
  const active = ensureActiveMarkovProfile(userDataPath)
  if (isMarkovCloudDevAuthEnabled()) {
    const result = selectDevMarkovCloudOrg(active, userDataPath, orgId)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }

  const configState = getMarkovCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const list = await selectCloudOrg({
      config: configState.config,
      active,
      userDataPath,
      orgId
    })
    if (!list) {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentMarkovProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
