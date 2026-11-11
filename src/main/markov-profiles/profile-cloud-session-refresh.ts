import type { MarkovCloudAuthConfig } from './profile-cloud-auth-config'
import type { ActiveMarkovProfileState } from './profile-index-store'
import { markovCloudSessionKey, type MarkovCloudSession } from './profile-cloud-session-store'
import {
  isAmbiguousCloudRequestFailure,
  MarkovCloudRequestError,
  refreshMarkovCloudSession
} from './profile-cloud-client'
import type { MarkovCloudSessionExchangeResponse } from './profile-cloud-session-exchange'
import {
  AmbiguousRefreshReplayBlockedError,
  blocksAmbiguousRefreshReplay,
  forgetAmbiguousRefreshAttempt,
  recordAmbiguousRefreshAttempt,
  wasRefreshTokenAmbiguouslyAttempted
} from './profile-cloud-refresh-replay-guard'
import { emitMarkovCloudSessionInvalidated } from './profile-cloud-session-invalidation'
import {
  commitCloudSessionRotation,
  readCloudSession,
  signOutRevokedCloudSession,
  takeCloudSessionTicket
} from './profile-cloud-session-owner'

const CLOUD_SESSION_REFRESH_SKEW_MS = 60_000

export type FreshCloudSessionResult =
  | { status: 'found'; session: MarkovCloudSession }
  | { status: 'reconnect-required' }

export type CloudSessionOperationResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'reconnect-required' }

function shouldRefreshCloudSession(session: MarkovCloudSession, now = Date.now()): boolean {
  return session.expiresAt <= now + CLOUD_SESSION_REFRESH_SKEW_MS
}

export function isMarkovCloudAuthFailure(error: unknown): boolean {
  return (
    error instanceof MarkovCloudRequestError &&
    (error.statusCode === 401 || error.statusCode === 403)
  )
}

const inflightCloudSessionRefreshes = new Map<string, Promise<MarkovCloudSession>>()

class StaleCloudSessionMutationError extends Error {
  constructor() {
    super('stale_cloud_session_mutation')
  }
}

function clearCloudSessionIfUnchanged(
  profileId: string,
  userDataPath: string,
  failed: MarkovCloudSession
): void {
  if (!signOutRevokedCloudSession(profileId, userDataPath, failed)) {
    return
  }
  forgetAmbiguousRefreshAttempt(markovCloudSessionKey(profileId, userDataPath))
  // Invalidate the renderer’s cached Connected state immediately.
  emitMarkovCloudSessionInvalidated()
}

// Distinguish genuine revocation from ambiguous refresh replay without logging tokens.
function warnIfPossibleRefreshReplay(
  profileId: string,
  userDataPath: string,
  failed: MarkovCloudSession,
  error: unknown
): void {
  if (!(error instanceof MarkovCloudRequestError) || error.statusCode !== 401) {
    return
  }
  const key = markovCloudSessionKey(profileId, userDataPath)
  if (!wasRefreshTokenAmbiguouslyAttempted(key, failed.refreshToken)) {
    return
  }
  console.warn(
    '[markov-cloud] markov_cloud_refresh_possible_replay: refresh rejected 401 for a token whose earlier attempt never answered'
  )
}

type CloudSessionRefreshAttempt =
  | { status: 'refreshed'; response: MarkovCloudSessionExchangeResponse }
  | { status: 'rotated-elsewhere'; session: MarkovCloudSession }

function isRetryableCloudRefreshRejection(error: unknown): boolean {
  return error instanceof MarkovCloudRequestError && error.statusCode >= 500
}

async function attemptCloudSessionRefresh(
  key: string,
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string,
  session: MarkovCloudSession
): Promise<CloudSessionRefreshAttempt> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await refreshMarkovCloudSession(config, session)
      forgetAmbiguousRefreshAttempt(key)
      return { status: 'refreshed', response }
    } catch (error) {
      const ambiguous = isAmbiguousCloudRequestFailure(error)
      if (ambiguous) {
        recordAmbiguousRefreshAttempt(key, session.refreshToken)
      }
      // Retry only explicit 5xx rejection; ambiguous failures may have spent the token.
      const retryable = !ambiguous && attempt === 0 && isRetryableCloudRefreshRejection(error)
      if (!ambiguous && !retryable) {
        throw error
      }
      // Reuse concurrent rotations instead of replaying the now-spent token.
      const current = readCloudSession(active.profile.id, userDataPath)
      if (current.status === 'found' && current.session.refreshToken !== session.refreshToken) {
        return { status: 'rotated-elsewhere', session: current.session }
      }
      if (ambiguous) {
        throw error
      }
    }
  }
}

async function refreshStoredCloudSession(
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string,
  session: MarkovCloudSession
): Promise<MarkovCloudSession> {
  // Single-flight rotating tokens: a duplicate POST can revoke the whole family.
  const key = markovCloudSessionKey(active.profile.id, userDataPath)
  const inflight = inflightCloudSessionRefreshes.get(key)
  if (inflight) {
    return inflight
  }
  const task = (async () => {
    const current = readCloudSession(active.profile.id, userDataPath)
    if (current.status === 'found' && current.session.refreshToken !== session.refreshToken) {
      return current.session
    }
    if (!active.profile.cloud) {
      throw new StaleCloudSessionMutationError()
    }
    if (blocksAmbiguousRefreshReplay(key, session.refreshToken)) {
      throw new AmbiguousRefreshReplayBlockedError()
    }
    const linked = active.profile.cloud
    const ticket = takeCloudSessionTicket(active.profile.id, userDataPath)
    const attempt = await attemptCloudSessionRefresh(key, config, active, userDataPath, session)
    if (attempt.status === 'rotated-elsewhere') {
      return attempt.session
    }
    const refreshed = attempt.response
    if (
      refreshed.cloud.userId !== linked.userId ||
      refreshed.cloud.cloudProfileId !== linked.cloudProfileId
    ) {
      throw new StaleCloudSessionMutationError()
    }
    const saved = commitCloudSessionRotation(
      active.profile.id,
      userDataPath,
      ticket,
      session,
      refreshed
    )
    if (!saved) {
      throw new StaleCloudSessionMutationError()
    }
    return saved
  })()
  inflightCloudSessionRefreshes.set(key, task)
  try {
    return await task
  } finally {
    inflightCloudSessionRefreshes.delete(key)
  }
}

export async function readFreshMarkovCloudSession(
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string
): Promise<FreshCloudSessionResult> {
  const session = readCloudSession(active.profile.id, userDataPath)
  if (session.status !== 'found') {
    return { status: 'reconnect-required' }
  }
  if (!shouldRefreshCloudSession(session.session)) {
    return { status: 'found', session: session.session }
  }
  try {
    return {
      status: 'found',
      session: await refreshStoredCloudSession(config, active, userDataPath, session.session)
    }
  } catch (error) {
    if (isMarkovCloudAuthFailure(error)) {
      warnIfPossibleRefreshReplay(active.profile.id, userDataPath, session.session, error)
      clearCloudSessionIfUnchanged(active.profile.id, userDataPath, session.session)
      return { status: 'reconnect-required' }
    }
    throw error
  }
}

export async function forceRefreshMarkovCloudSession(
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string,
  session: MarkovCloudSession
): Promise<FreshCloudSessionResult> {
  try {
    return {
      status: 'found',
      session: await refreshStoredCloudSession(config, active, userDataPath, session)
    }
  } catch (error) {
    if (isMarkovCloudAuthFailure(error)) {
      warnIfPossibleRefreshReplay(active.profile.id, userDataPath, session, error)
      clearCloudSessionIfUnchanged(active.profile.id, userDataPath, session)
      return { status: 'reconnect-required' }
    }
    throw error
  }
}

export async function runWithFreshMarkovCloudSession<T>(
  config: MarkovCloudAuthConfig,
  active: ActiveMarkovProfileState,
  userDataPath: string,
  operation: (session: MarkovCloudSession) => Promise<T>
): Promise<CloudSessionOperationResult<T>> {
  const session = await readFreshMarkovCloudSession(config, active, userDataPath)
  if (session.status !== 'found') {
    return { status: 'reconnect-required' }
  }
  try {
    return { status: 'ok', value: await operation(session.session) }
  } catch (error) {
    if (!isMarkovCloudAuthFailure(error)) {
      throw error
    }
    const refreshed = await forceRefreshMarkovCloudSession(
      config,
      active,
      userDataPath,
      session.session
    )
    if (refreshed.status !== 'found') {
      return { status: 'reconnect-required' }
    }
    try {
      return { status: 'ok', value: await operation(refreshed.session) }
    } catch (retryError) {
      // Post-refresh 401 rejects the session; permission-only 403 must preserve it.
      if (retryError instanceof MarkovCloudRequestError && retryError.statusCode === 401) {
        clearCloudSessionIfUnchanged(active.profile.id, userDataPath, refreshed.session)
        return { status: 'reconnect-required' }
      }
      throw retryError
    }
  }
}
