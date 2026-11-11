import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import {
  MARKOV_PROFILE_AUTH_STATUS_CHANGED_CHANNEL,
  MARKOV_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL,
  type MarkovCloudSignInProgress,
  type MarkovProfileListResult,
  type SwitchMarkovProfileResult,
  type TransferMarkovProfileProjectResult
} from '../../shared/markov-profiles'
import { prepareAndInvokeAppRestart } from '../renderer-restart-wiring'
import { awaitBeforeUnloadCheckpoint } from '../preload-runtime-support'

export const markovProfilesApi = {
  list: () => ipcRenderer.invoke('markovProfiles:list'),
  authStatus: () => ipcRenderer.invoke('markovProfiles:authStatus'),
  onAuthStatusChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(MARKOV_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(MARKOV_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
  },
  onSignInProgressChanged: (
    callback: (progress: MarkovCloudSignInProgress | null) => void
  ): (() => void) => {
    const listener = (_event: unknown, progress: MarkovCloudSignInProgress | null): void =>
      callback(progress)
    ipcRenderer.on(MARKOV_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, listener)
    return () =>
      ipcRenderer.removeListener(MARKOV_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, listener)
  },
  createLocal: (args) => ipcRenderer.invoke('markovProfiles:createLocal', args),
  createCloudLinked: (args) => ipcRenderer.invoke('markovProfiles:createCloudLinked', args),
  switchProfile: (args) =>
    prepareAndInvokeAppRestart(
      window,
      (): Promise<SwitchMarkovProfileResult> => ipcRenderer.invoke('markovProfiles:switch', args),
      awaitBeforeUnloadCheckpoint,
      (result) => result.status === 'relaunching'
    ),
  transferProject: async (args) => {
    const invoke = (): Promise<TransferMarkovProfileProjectResult> =>
      ipcRenderer.invoke('markovProfiles:transferProject', args)
    if (args.mode !== 'move') {
      return invoke()
    }
    const current: MarkovProfileListResult = await ipcRenderer.invoke('markovProfiles:list')
    if (args.sourceProfileId !== current.activeProfileId) {
      return invoke()
    }
    return prepareAndInvokeAppRestart(
      window,
      invoke,
      awaitBeforeUnloadCheckpoint,
      (result) => result.status === 'transferred' && result.willRelaunch === true
    )
  },
  findProjectProfiles: (args) => ipcRenderer.invoke('markovProfiles:findProjectProfiles', args),
  connectCurrent: () => ipcRenderer.invoke('markovProfiles:connectCurrent'),
  signInProgress: () => ipcRenderer.invoke('markovProfiles:signInProgress'),
  cancelSignIn: () => ipcRenderer.invoke('markovProfiles:cancelSignIn'),
  refreshAuth: () => ipcRenderer.invoke('markovProfiles:refreshAuth'),
  signOutCurrent: () => ipcRenderer.invoke('markovProfiles:signOutCurrent'),
  selectOrg: (args) => ipcRenderer.invoke('markovProfiles:selectOrg', args),
  orgMembersList: (args) => ipcRenderer.invoke('markovProfiles:orgMembersList', args),
  orgMemberInvite: (args) => ipcRenderer.invoke('markovProfiles:orgMemberInvite', args),
  orgInviteRevoke: (args) => ipcRenderer.invoke('markovProfiles:orgInviteRevoke', args),
  orgMemberChangeRole: (args) => ipcRenderer.invoke('markovProfiles:orgMemberChangeRole', args),
  orgMemberRemove: (args) => ipcRenderer.invoke('markovProfiles:orgMemberRemove', args)
} satisfies PreloadApi['markovProfiles']
