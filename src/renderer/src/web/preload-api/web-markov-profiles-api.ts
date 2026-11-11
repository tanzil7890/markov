import type { PreloadApi } from '../../../../preload/api-types'
import {
  DEFAULT_LOCAL_MARKOV_PROFILE_ID,
  createDefaultLocalMarkovProfile
} from '../../../../shared/markov-profiles'
import { noopUnsubscribe } from './web-storage'

export function createWebMarkovProfilesApi(): Partial<PreloadApi> {
  const webMarkovProfileAuthStatus = () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_MARKOV_PROFILE_ID,
      configured: false,
      state: 'unconfigured' as const,
      persistence: 'none' as const,
      setupMessage: 'Markov Cloud sign-in is not available in the browser fallback.'
    })
  return {
    markovProfiles: {
      list: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_MARKOV_PROFILE_ID,
          profiles: [createDefaultLocalMarkovProfile(0)],
          multiProfileUi: false
        }),
      authStatus: webMarkovProfileAuthStatus,
      onAuthStatusChanged: () => noopUnsubscribe,
      onSignInProgressChanged: () => noopUnsubscribe,
      createLocal: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_MARKOV_PROFILE_ID,
          profiles: [createDefaultLocalMarkovProfile(0)],
          profile: createDefaultLocalMarkovProfile(0)
        }),
      createCloudLinked: async () => ({
        status: 'unconfigured',
        auth: await webMarkovProfileAuthStatus()
      }),
      switchProfile: () => Promise.resolve({ status: 'already-active' }),
      transferProject: (args) =>
        Promise.resolve({
          status: 'duplicate-target',
          sourceProfileId: args.sourceProfileId,
          targetProfileId: args.targetProfileId,
          sourceRepoId: args.repoId,
          duplicateRepoId: args.repoId
        }),
      findProjectProfiles: async () => ({ projects: [] }),
      connectCurrent: async () => ({
        status: 'unconfigured',
        auth: await webMarkovProfileAuthStatus()
      }),
      signInProgress: async () => null,
      cancelSignIn: async () => {},
      refreshAuth: async () => ({
        status: 'unconfigured',
        auth: await webMarkovProfileAuthStatus()
      }),
      signOutCurrent: async () => ({
        status: 'signed-out',
        auth: await webMarkovProfileAuthStatus(),
        activeProfileId: DEFAULT_LOCAL_MARKOV_PROFILE_ID,
        profiles: [createDefaultLocalMarkovProfile(0)]
      }),
      selectOrg: async () => ({
        status: 'unconfigured',
        auth: await webMarkovProfileAuthStatus()
      }),
      orgMembersList: async () => ({ status: 'unconfigured' }),
      orgMemberInvite: async () => ({ status: 'unconfigured' }),
      orgInviteRevoke: async () => ({ status: 'unconfigured' }),
      orgMemberChangeRole: async () => ({ status: 'unconfigured' }),
      orgMemberRemove: async () => ({ status: 'unconfigured' })
    }
  }
}
