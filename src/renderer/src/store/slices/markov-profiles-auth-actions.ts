import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  ConnectCurrentMarkovProfileResult,
  CreateCloudLinkedMarkovProfileResult,
  RefreshCurrentMarkovProfileAuthResult,
  SelectMarkovProfileOrgResult,
  SignOutCurrentMarkovProfileResult
} from '../../../../shared/markov-profiles'
import type { AppState } from '../types'

export type MarkovProfilesAuthActions = {
  createCloudLinkedMarkovProfile: (args: {
    orgId?: string
    name?: string
  }) => Promise<CreateCloudLinkedMarkovProfileResult | null>
  connectCurrentMarkovProfile: () => Promise<ConnectCurrentMarkovProfileResult | null>
  refreshCurrentMarkovProfileAuth: () => Promise<RefreshCurrentMarkovProfileAuthResult | null>
  signOutCurrentMarkovProfile: () => Promise<SignOutCurrentMarkovProfileResult | null>
  selectMarkovProfileOrg: (orgId: string) => Promise<SelectMarkovProfileOrgResult | null>
}

export const createMarkovProfilesAuthActions: StateCreator<
  AppState,
  [],
  [],
  MarkovProfilesAuthActions
> = (set, get) => {
  let nextConnectAttempt = 0
  let appliedConnectAttempt = 0

  return {
    createCloudLinkedMarkovProfile: async (args) => {
      try {
        const result = await window.api.markovProfiles.createCloudLinked(args)
        set({
          markovProfileAuthStatus: result.auth,
          ...(result.status === 'created'
            ? {
                activeMarkovProfileId: result.activeProfileId,
                markovProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'created') {
          toast.success(
            translate('auto.store.slices.markov.profiles.319d7cf39b', 'Cloud profile created')
          )
        } else if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.markov.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.markov.profiles.f0c9e11a6d',
              'Failed to create cloud profile'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to create Markov cloud profile:', err)
        toast.error(
          translate(
            'auto.store.slices.markov.profiles.f0c9e11a6d',
            'Failed to create cloud profile'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    connectCurrentMarkovProfile: async () => {
      const attempt = ++nextConnectAttempt
      try {
        // Pending PKCE must not block retry; newer linked waits supersede older callbacks.
        const result = await window.api.markovProfiles.connectCurrent()
        if (attempt < appliedConnectAttempt) {
          return result
        }
        const alreadyConnected = get().markovProfileAuthStatus?.state === 'connected'
        set({
          markovProfileAuthStatus: result.auth,
          ...(result.status === 'connected'
            ? {
                activeMarkovProfileId: result.activeProfileId,
                markovProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'connected') {
          appliedConnectAttempt = attempt
          if (!alreadyConnected) {
            toast.success(
              translate('auto.store.slices.markov.profiles.9fcb07a796', 'Profile connected')
            )
          }
        } else if (result.status === 'unconfigured') {
          toast.error(
            translate(
              'auto.store.slices.markov.profiles.8b8fa73174',
              'Markov Cloud sign-in is not configured'
            ),
            {
              description: result.auth.setupMessage
            }
          )
        } else if (result.status === 'timed-out' && !alreadyConnected) {
          toast.error(
            translate('auto.store.slices.markov.profiles.signInTimedOut', 'Sign-in timed out')
          )
        } else if (
          result.status === 'failed' &&
          !alreadyConnected &&
          result.auth.state !== 'connected'
        ) {
          toast.error(
            translate('auto.store.slices.markov.profiles.33290e88ed', 'Failed to connect profile'),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to connect Markov profile:', err)
        if (
          attempt >= appliedConnectAttempt &&
          get().markovProfileAuthStatus?.state !== 'connected'
        ) {
          toast.error(
            translate('auto.store.slices.markov.profiles.33290e88ed', 'Failed to connect profile'),
            {
              description: err instanceof Error ? err.message : String(err)
            }
          )
        }
        return null
      }
    },

    refreshCurrentMarkovProfileAuth: async () => {
      try {
        const result = await window.api.markovProfiles.refreshAuth()
        set({
          markovProfileAuthStatus: result.auth,
          ...(result.status === 'refreshed'
            ? {
                activeMarkovProfileId: result.activeProfileId,
                markovProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.markov.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.markov.profiles.2f6c78a039',
              'Failed to refresh profile auth'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to refresh Markov profile auth:', err)
        toast.error(
          translate(
            'auto.store.slices.markov.profiles.2f6c78a039',
            'Failed to refresh profile auth'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    signOutCurrentMarkovProfile: async () => {
      nextConnectAttempt += 1
      appliedConnectAttempt = nextConnectAttempt
      try {
        const result = await window.api.markovProfiles.signOutCurrent()
        set({
          activeMarkovProfileId: result.activeProfileId,
          markovProfiles: result.profiles,
          markovProfileAuthStatus: result.auth
        })
        if (result.auth.state !== 'connected') {
          toast.success(
            translate('auto.store.slices.markov.profiles.a37b5e6d37', 'Signed out of profile')
          )
        }
        return result
      } catch (err) {
        console.error('Failed to sign out of Markov profile:', err)
        toast.error(
          translate('auto.store.slices.markov.profiles.83600521e7', 'Failed to sign out'),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    selectMarkovProfileOrg: async (orgId) => {
      try {
        const result = await window.api.markovProfiles.selectOrg({ orgId })
        set({
          markovProfileAuthStatus: result.auth,
          ...(result.status === 'selected'
            ? {
                activeMarkovProfileId: result.activeProfileId,
                markovProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.markov.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.markov.profiles.76deec8f58',
              'Failed to switch organization'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to switch Markov profile org:', err)
        toast.error(
          translate(
            'auto.store.slices.markov.profiles.76deec8f58',
            'Failed to switch organization'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    }
  }
}
