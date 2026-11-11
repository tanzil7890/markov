import type {
  CreateCloudLinkedMarkovProfileArgs,
  MarkovProfileListState
} from '../../shared/markov-profiles'
import type { ActiveMarkovProfileState } from './profile-index-store'
import {
  createCloudLinkedMarkovProfileRecord,
  linkMarkovProfileToCloud
} from './profile-cloud-index'
import { readCloudSession, signInCloudSession } from './profile-cloud-session-owner'
import { createDevMarkovCloudSession } from './profile-cloud-dev-auth'

type DevProfileListResult = MarkovProfileListState

type DevCreateProfileResult =
  | {
      status: 'created'
      list: ReturnType<typeof createCloudLinkedMarkovProfileRecord>
    }
  | { status: 'reconnect-required' }

type DevMutationResult =
  | {
      status: 'updated'
      list: DevProfileListResult
    }
  | { status: 'reconnect-required' }

export function connectDevMarkovCloudProfile(
  active: ActiveMarkovProfileState,
  userDataPath: string
): DevProfileListResult {
  const session = createDevMarkovCloudSession({ localProfileId: active.profile.id })
  signInCloudSession(active.profile.id, userDataPath, session)
  return linkMarkovProfileToCloud(active.profile.id, session.cloud, userDataPath)
}

export function createDevCloudLinkedMarkovProfile(
  active: ActiveMarkovProfileState,
  userDataPath: string,
  args: CreateCloudLinkedMarkovProfileArgs
): DevCreateProfileResult {
  if (readCloudSession(active.profile.id, userDataPath).status !== 'found') {
    return { status: 'reconnect-required' }
  }
  const session = createDevMarkovCloudSession({ orgId: args.orgId })
  const list = createCloudLinkedMarkovProfileRecord(
    session.cloud,
    { name: args.name },
    userDataPath
  )
  signInCloudSession(list.profile.id, userDataPath, session)
  return { status: 'created', list }
}

export function refreshDevMarkovCloudProfile(
  active: ActiveMarkovProfileState,
  userDataPath: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevMarkovCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId: active.profile.cloud.activeOrgId
  })
  signInCloudSession(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkMarkovProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}

export function selectDevMarkovCloudOrg(
  active: ActiveMarkovProfileState,
  userDataPath: string,
  orgId: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevMarkovCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId
  })
  signInCloudSession(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkMarkovProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}
