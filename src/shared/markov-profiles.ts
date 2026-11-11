import { MARKOV_BROWSER_PARTITION } from './constants'
import type { ExecutionHostId } from './execution-host'

export const MARKOV_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_MARKOV_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_MARKOV_PROFILE_NAME = 'Personal'
/** Main -> renderer push when the stored auth status changed without the renderer asking. */
export const MARKOV_PROFILE_AUTH_STATUS_CHANGED_CHANNEL = 'markovProfiles:authStatusChanged'
export const MARKOV_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL =
  'markovProfiles:signInProgressChanged'
const LEGACY_MARKOV_BROWSER_SESSION_PARTITION_PREFIX = 'persist:markov-browser-session-'

export type MarkovProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type MarkovProfileKind = 'local' | 'cloud-linked'

export type MarkovProfileCloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type MarkovCloudOrgSummary = {
  orgId: string
  name: string
  role?: string
}

export type MarkovCloudCapabilityFlags = Record<string, boolean>

export type MarkovCloudCapabilities = {
  flags: MarkovCloudCapabilityFlags
  refreshedAt: number
}

export type MarkovCloudSessionPersistence = 'none' | 'encrypted' | 'memory-only' | 'dev-plaintext'

export type MarkovProfileAuthState = 'local' | 'unconfigured' | 'connected' | 'reconnect-required'

export type MarkovProfileAuthStatus = {
  activeProfileId: string
  configured: boolean
  state: MarkovProfileAuthState
  persistence: MarkovCloudSessionPersistence
  cloud?: MarkovProfileCloudSummary
  organizations?: MarkovCloudOrgSummary[]
  capabilities?: MarkovCloudCapabilities
  credentialError?: string
  setupMessage?: string
}

export type MarkovProfileSummary = {
  id: string
  name: string
  avatar: MarkovProfileAvatar
  kind: MarkovProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  cloud?: MarkovProfileCloudSummary
}

export type MarkovProfileIndex = {
  schemaVersion: number
  activeProfileId: string
  profiles: MarkovProfileSummary[]
}

export type MarkovProfileListState = {
  activeProfileId: string
  profiles: MarkovProfileSummary[]
}

export type MarkovProfileListResult = MarkovProfileListState & {
  // Gate the multi-profile switcher; default builds use one-profile account menus.
  multiProfileUi: boolean
}

export type CreateLocalMarkovProfileArgs = {
  name?: string
}

export type CreateLocalMarkovProfileResult = MarkovProfileListState & {
  profile: MarkovProfileSummary
}

export type CreateCloudLinkedMarkovProfileArgs = {
  orgId?: string
  name?: string
}

export type SwitchMarkovProfileArgs = {
  profileId: string
}

export type SwitchMarkovProfileResult = {
  status: 'already-active' | 'relaunching'
}

export type TransferMarkovProfileProjectMode = 'move' | 'copy'

export type TransferMarkovProfileProjectArgs = {
  sourceProfileId: string
  targetProfileId: string
  repoId: string
  mode: TransferMarkovProfileProjectMode
}

export type FindMarkovProfileProjectsByPathArgs = {
  path: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  excludeProfileId?: string | null
}

export type MarkovProfileProjectPresence = {
  profileId: string
  profileName: string
  profileKind: MarkovProfileKind
  repoId: string
  repoName: string
}

export type FindMarkovProfileProjectsByPathResult = {
  projects: MarkovProfileProjectPresence[]
}

export type TransferMarkovProfileProjectResult =
  | {
      status: 'transferred'
      mode: TransferMarkovProfileProjectMode
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

/** A sign-in in flight; `link` is set only while the browser has not answered yet. */
export type MarkovCloudSignInProgress = { link: string | null }

export type ConnectCurrentMarkovProfileResult =
  | {
      status: 'connected'
      auth: MarkovProfileAuthStatus
      activeProfileId: string
      profiles: MarkovProfileSummary[]
    }
  | {
      status: 'unconfigured'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'cancelled'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'timed-out'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: MarkovProfileAuthStatus
      error: string
    }

export type CreateCloudLinkedMarkovProfileResult =
  | {
      status: 'created'
      auth: MarkovProfileAuthStatus
      activeProfileId: string
      profiles: MarkovProfileSummary[]
      profile: MarkovProfileSummary
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: MarkovProfileAuthStatus
      error: string
    }

export type SignOutCurrentMarkovProfileResult = {
  status: 'signed-out'
  auth: MarkovProfileAuthStatus
  activeProfileId: string
  profiles: MarkovProfileSummary[]
}

export type SelectMarkovProfileOrgArgs = {
  orgId: string
}

export type SelectMarkovProfileOrgResult =
  | {
      status: 'selected'
      auth: MarkovProfileAuthStatus
      activeProfileId: string
      profiles: MarkovProfileSummary[]
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: MarkovProfileAuthStatus
      error: string
    }

export type RefreshCurrentMarkovProfileAuthResult =
  | {
      status: 'refreshed'
      auth: MarkovProfileAuthStatus
      activeProfileId: string
      profiles: MarkovProfileSummary[]
    }
  | {
      status: 'local' | 'unconfigured' | 'reconnect-required'
      auth: MarkovProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: MarkovProfileAuthStatus
      error: string
    }

// Mirror the server’s fixed role enum so UI options cannot drift from accepted API values.
export type MarkovOrgRole = 'owner' | 'admin' | 'member'

export type MarkovOrgMember = {
  // Provisioned teammates without sign-in have no userId; disable mutations requiring that key.
  userId: string | null
  email: string
  displayName?: string
  role: MarkovOrgRole
}

export type MarkovOrgPendingInvite = {
  email: string
  role: MarkovOrgRole
  createdAt: number
}

export type MarkovOrgMembersRoster = {
  members: MarkovOrgMember[]
  pendingInvites: MarkovOrgPendingInvite[]
  viewerRole: MarkovOrgRole
  canManageMembers: boolean
}

export type MarkovProfileOrgMembersListArgs = {
  orgId: string
}

export type MarkovProfileOrgMemberInviteArgs = {
  orgId: string
  email: string
  role: MarkovOrgRole
}

export type MarkovProfileOrgInviteRevokeArgs = {
  orgId: string
  email: string
}

export type MarkovProfileOrgMemberChangeRoleArgs = {
  orgId: string
  userId: string
  role: MarkovOrgRole
}

export type MarkovProfileOrgMemberRemoveArgs = {
  orgId: string
  userId: string
}

export type MarkovProfileOrgMembersListResult =
  | { status: 'ok'; roster: MarkovOrgMembersRoster }
  | { status: 'unconfigured' | 'reconnect-required' }
  | { status: 'failed'; error: string }

export type MarkovOrgInviteConflictReason = 'already_member' | 'already_invited'
export type MarkovOrgMutationInvalidReason = 'cannot_change_own_role' | 'cannot_remove_self'

export type MarkovProfileOrgMemberMutationResult =
  | { status: 'ok' }
  | { status: 'unconfigured' | 'reconnect-required' | 'forbidden' | 'not-found' }
  | { status: 'conflict'; reason: MarkovOrgInviteConflictReason }
  | { status: 'invalid'; reason: MarkovOrgMutationInvalidReason }
  | { status: 'failed'; error: string }

export function createDefaultLocalMarkovProfile(now: number): MarkovProfileSummary {
  return {
    id: DEFAULT_LOCAL_MARKOV_PROFILE_ID,
    name: DEFAULT_LOCAL_MARKOV_PROFILE_NAME,
    avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function profilePartitionHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getMarkovProfileBrowserPartitionSegment(profileId: string): string {
  const safe = profileId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'profile'
  return `${safe}-${profilePartitionHash(profileId)}`
}

export function getMarkovProfileBrowserDefaultPartition(profileId: string): string {
  if (profileId === DEFAULT_LOCAL_MARKOV_PROFILE_ID) {
    return MARKOV_BROWSER_PARTITION
  }
  return `persist:markov-profile-${getMarkovProfileBrowserPartitionSegment(profileId)}-browser-default`
}

export function getMarkovProfileBrowserSessionPartition(
  profileId: string,
  browserSessionProfileId: string
): string {
  if (profileId === DEFAULT_LOCAL_MARKOV_PROFILE_ID) {
    return `${LEGACY_MARKOV_BROWSER_SESSION_PARTITION_PREFIX}${browserSessionProfileId}`
  }
  return `persist:markov-profile-${getMarkovProfileBrowserPartitionSegment(
    profileId
  )}-browser-session-${browserSessionProfileId}`
}
