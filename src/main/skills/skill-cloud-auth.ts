import type { SkillCloudOperation, SkillCloudOptions } from '../../shared/skill-cloud-contract'
import { ensureActiveMarkovProfile } from '../markov-profiles/profile-index-store'
import { getMarkovCloudAuthConfig } from '../markov-profiles/profile-cloud-auth-config'
import { runWithFreshMarkovCloudSession } from '../markov-profiles/profile-cloud-session-refresh'
import {
  allowsArtifactCloudAuthOverride,
  resolveArtifactCloudApiUrl
} from '../artifacts/artifact-cloud-config'

export async function runSkillCloudOperation<T>(input: {
  userDataPath: string
  options: SkillCloudOptions
  operation(token: string, apiUrl: string): Promise<T>
}): Promise<SkillCloudOperation<T>> {
  const apiUrl = resolveArtifactCloudApiUrl(input.options.apiUrl)
  const active = ensureActiveMarkovProfile(input.userDataPath)
  const stamp = {
    profileId: active.profile.id,
    userId: active.profile.cloud?.userId,
    cloudProfileId: active.profile.cloud?.cloudProfileId,
    organizationId: active.profile.cloud?.activeOrgId ?? ''
  }
  const assertCurrent = () => {
    const current = ensureActiveMarkovProfile(input.userDataPath)
    if (
      current.profile.id !== stamp.profileId ||
      current.profile.cloud?.userId !== stamp.userId ||
      current.profile.cloud?.cloudProfileId !== stamp.cloudProfileId ||
      (current.profile.cloud?.activeOrgId ?? '') !== stamp.organizationId
    ) {
      throw new Error('The signed-in Markov account changed during the skill request.')
    }
  }
  const override = input.options.authToken?.trim() || process.env.MARKOV_CLOUD_AUTH_TOKEN?.trim()
  if (override) {
    if (!allowsArtifactCloudAuthOverride()) {
      throw new Error('Skill authentication overrides are available only in development builds.')
    }
    const value = await input.operation(override, apiUrl)
    assertCurrent()
    return { status: 'ok', value }
  }
  const config = getMarkovCloudAuthConfig()
  if (!config.configured) {
    return { status: 'unconfigured', message: config.setupMessage }
  }
  const result = await runWithFreshMarkovCloudSession(
    config.config,
    active,
    input.userDataPath,
    async (session) => {
      const value = await input.operation(session.accessToken, apiUrl)
      assertCurrent()
      return value
    }
  )
  return result.status === 'ok'
    ? { status: 'ok', value: result.value }
    : { status: 'reconnect-required' }
}
