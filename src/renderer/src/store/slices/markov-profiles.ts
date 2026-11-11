import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  MarkovCloudSignInProgress,
  MarkovProfileAuthStatus,
  MarkovProfileSummary,
  SwitchMarkovProfileResult,
  TransferMarkovProfileProjectArgs,
  TransferMarkovProfileProjectResult
} from '../../../../shared/markov-profiles'
import type { AppState } from '../types'
import {
  createMarkovProfilesAuthActions,
  type MarkovProfilesAuthActions
} from './markov-profiles-auth-actions'

export type MarkovProfilesSlice = MarkovProfilesAuthActions & {
  markovProfiles: MarkovProfileSummary[]
  activeMarkovProfileId: string | null
  markovProfileAuthStatus: MarkovProfileAuthStatus | null
  markovProfileSignInProgress: MarkovCloudSignInProgress | null
  markovProfilesMultiProfileUi: boolean
  markovProfilesLoading: boolean
  markovProfileSwitching: boolean
  fetchMarkovProfiles: () => Promise<void>
  fetchMarkovProfileAuthStatus: () => Promise<MarkovProfileAuthStatus | null>
  createLocalMarkovProfile: (name?: string) => Promise<MarkovProfileSummary | null>
  switchMarkovProfile: (profileId: string) => Promise<SwitchMarkovProfileResult | null>
  transferMarkovProfileProject: (
    args: TransferMarkovProfileProjectArgs
  ) => Promise<TransferMarkovProfileProjectResult | null>
}

export const createMarkovProfilesSlice: StateCreator<AppState, [], [], MarkovProfilesSlice> = (
  set,
  get,
  api
) => ({
  markovProfiles: [],
  activeMarkovProfileId: null,
  markovProfileAuthStatus: null,
  markovProfileSignInProgress: null,
  markovProfilesMultiProfileUi: false,
  markovProfilesLoading: false,
  markovProfileSwitching: false,

  fetchMarkovProfiles: async () => {
    set({ markovProfilesLoading: true })
    try {
      const [state, authStatus] = await Promise.all([
        window.api.markovProfiles.list(),
        window.api.markovProfiles.authStatus()
      ])
      set({
        activeMarkovProfileId: state.activeProfileId,
        markovProfiles: state.profiles,
        markovProfilesMultiProfileUi: state.multiProfileUi,
        markovProfileAuthStatus: authStatus,
        markovProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch Markov profiles:', err)
      set({ markovProfilesLoading: false })
    }
  },

  fetchMarkovProfileAuthStatus: async () => {
    try {
      const authStatus = await window.api.markovProfiles.authStatus()
      set({ markovProfileAuthStatus: authStatus })
      return authStatus
    } catch (err) {
      console.error('Failed to fetch Markov profile auth status:', err)
      return null
    }
  },

  createLocalMarkovProfile: async (name) => {
    try {
      const state = await window.api.markovProfiles.createLocal({ name })
      set({
        activeMarkovProfileId: state.activeProfileId,
        markovProfiles: state.profiles
      })
      void get().fetchMarkovProfileAuthStatus()
      return state.profile
    } catch (err) {
      console.error('Failed to create Markov profile:', err)
      toast.error(
        translate('auto.store.slices.markov.profiles.612f7f6861', 'Failed to create profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  ...createMarkovProfilesAuthActions(set, get, api),

  switchMarkovProfile: async (profileId) => {
    if (!profileId || profileId === get().activeMarkovProfileId) {
      return { status: 'already-active' }
    }
    set({ markovProfileSwitching: true })
    try {
      const result = await window.api.markovProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Only actual relaunch locks switcher; stale already-active answers must unlock it.
        set({ markovProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch Markov profile:', err)
      set({ markovProfileSwitching: false })
      toast.error(
        translate('auto.store.slices.markov.profiles.7d4bc516ee', 'Failed to switch profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  transferMarkovProfileProject: async (args) => {
    try {
      const result = await window.api.markovProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        toast.error(
          translate(
            'auto.store.slices.markov.profiles.f518e89aa5',
            'Project already exists in that profile'
          )
        )
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ markovProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer Markov profile project:', err)
      toast.error(
        translate('auto.store.slices.markov.profiles.f03ae7f27b', 'Failed to transfer project'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  }
})
