import { ipcMain, type WebContents } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import { relaunchApp, type AppRelaunchReason } from '../../startup/quit/app-relaunch'
import { quitProcess } from '../../startup/process-quit-request'
import type {
  CreateLocalMarkovProfileArgs,
  CreateLocalMarkovProfileResult,
  CreateCloudLinkedMarkovProfileArgs,
  CreateCloudLinkedMarkovProfileResult,
  FindMarkovProfileProjectsByPathArgs,
  FindMarkovProfileProjectsByPathResult,
  MarkovProfileListResult,
  RefreshCurrentMarkovProfileAuthResult,
  SwitchMarkovProfileArgs,
  SwitchMarkovProfileResult,
  TransferMarkovProfileProjectArgs,
  TransferMarkovProfileProjectResult,
  ConnectCurrentMarkovProfileResult,
  MarkovProfileAuthStatus,
  MarkovCloudSignInProgress,
  SelectMarkovProfileOrgArgs,
  SelectMarkovProfileOrgResult,
  SignOutCurrentMarkovProfileResult
} from '../../../shared/markov-profiles'
import {
  createLocalMarkovProfile,
  getMarkovProfileListState,
  setActiveMarkovProfile
} from '../../markov-profiles/profile-index-store'
import { seedNewMarkovProfileTelemetryConsent } from '../../markov-profiles/profile-telemetry-consent-seed'
import { getProfileUserDataPath } from '../../markov-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../../markov-profiles/profile-ui-scope'
import { transferMarkovProfileProject } from '../../markov-profiles/profile-project-transfer'
import { transferActiveProfileProject } from '../../markov-profiles/profile-active-transfer'
import { findMarkovProfileProjectsByPath } from '../../markov-profiles/profile-project-presence'
import {
  flushActiveProfileBeforeFileMutation,
  flushActiveProfileBeforeRelaunch
} from '../../markov-profiles/profile-persistence-deadline'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import {
  createCloudLinkedMarkovProfile,
  connectCurrentMarkovProfile,
  getCurrentMarkovProfileAuthStatus,
  selectCurrentMarkovProfileOrg,
  signOutCurrentMarkovProfile
} from '../../markov-profiles/profile-cloud-service'
import { refreshCurrentMarkovProfileAuth } from '../../markov-profiles/profile-cloud-capability-refresh'
import { registerMarkovProfileOrgMemberHandlers } from './markov-profile-org-members-handlers'
import { onMarkovCloudSessionInvalidated } from '../../markov-profiles/profile-cloud-session-invalidation'
import {
  broadcastMarkovProfileAuthStatusChanged,
  broadcastMarkovProfileSignInProgressChanged
} from './markov-profile-auth-status-broadcast'
import {
  cancelMarkovCloudSignIn,
  getMarkovCloudSignInProgress,
  onMarkovCloudSignInProgressChanged
} from '../../markov-profiles/profile-cloud-sign-in-progress'
import { profileIdFromArgs } from './markov-profile-id-arg'
import { transferProjectArgsFromUnknown } from './markov-profile-project-transfer-args'

type RegisterMarkovProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
  onAfterSignOut?: () => void
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindMarkovProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_markov_profile_project_path')
  }
  const candidate = args as FindMarkovProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_markov_profile_project_path')
  }
  let executionHostId: FindMarkovProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_markov_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_markov_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

function orgIdFromUnknown(args: unknown): string {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_markov_profile_org_selection')
  }
  const orgId = (args as SelectMarkovProfileOrgArgs).orgId?.trim()
  if (!orgId) {
    throw new Error('invalid_markov_profile_org_selection')
  }
  return orgId
}

function createCloudLinkedProfileArgsFromUnknown(
  args: unknown
): CreateCloudLinkedMarkovProfileArgs {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const candidate = args as CreateCloudLinkedMarkovProfileArgs
  const orgId = typeof candidate.orgId === 'string' ? candidate.orgId.trim() : undefined
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined
  return {
    ...(orgId ? { orgId } : {}),
    ...(name ? { name } : {})
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[markov-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

type ProfileRelaunchReason = Extract<AppRelaunchReason, `profile-${string}`>

function scheduleProfileRelaunch(reason: ProfileRelaunchReason, sender: WebContents): void {
  if (!sender.isDestroyed()) {
    sender.send('app:restart-committed')
  }
  setTimeout(() => {
    relaunchApp(reason)
    // Normal quit preserves renderer scrollback, PTY teardown, stats flush and final daemon checkpoints.
    quitProcess()
  }, 150)
}

export function registerMarkovProfileHandlers(
  store: Store,
  options: RegisterMarkovProfileHandlersOptions = {}
): void {
  ipcMain.handle('markovProfiles:list', (): MarkovProfileListResult => ({
    ...getMarkovProfileListState(),
    multiProfileUi: isMultiProfileUiEnabled()
  }))

  ipcMain.handle('markovProfiles:authStatus', (): MarkovProfileAuthStatus =>
    getCurrentMarkovProfileAuthStatus(getProfileUserDataPath())
  )

  // Push background invalidation; re-entering onAuthMutation would loop into the relay coordinator that just failed.
  onMarkovCloudSessionInvalidated(broadcastMarkovProfileAuthStatusChanged)
  onMarkovCloudSignInProgressChanged(broadcastMarkovProfileSignInProgressChanged)

  ipcMain.handle(
    'markovProfiles:createLocal',
    (_event, args?: CreateLocalMarkovProfileArgs): CreateLocalMarkovProfileResult => {
      const result = createLocalMarkovProfile(args)
      seedNewMarkovProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'markovProfiles:switch',
    async (event, args: SwitchMarkovProfileArgs): Promise<SwitchMarkovProfileResult> => {
      const profileId = profileIdFromArgs(args)
      const current = getMarkovProfileListState()
      if (profileId === current.activeProfileId) {
        return { status: 'already-active' }
      }

      // Flush the source profile before switching the startup index; keep its writer alive through relaunch cleanup.
      await flushActiveProfileBeforeRelaunch(store)
      setActiveMarkovProfile(profileId)
      await runBeforeProfileRelaunch(options.onBeforeRelaunch)

      scheduleProfileRelaunch('profile-switch', event.sender)

      return { status: 'relaunching' }
    }
  )

  ipcMain.handle(
    'markovProfiles:transferProject',
    async (
      event,
      rawArgs: TransferMarkovProfileProjectArgs
    ): Promise<TransferMarkovProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      const current = getMarkovProfileListState()
      if (args.targetProfileId === current.activeProfileId) {
        throw new Error('active_target_markov_profile_transfer_requires_relaunch')
      }
      if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
        // Finish transfer before relaunch side effects so validation failure cannot strand the app quitting.
        const result = await transferActiveProfileProject(
          args,
          getProfileUserDataPath(),
          store,
          async () => {
            await runBeforeProfileRelaunch(options.onBeforeRelaunch)
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
        )
        if (result.status === 'transferred') {
          await runBeforeProfileRelaunch(options.onBeforeRelaunch)
          try {
            setActiveMarkovProfile(args.targetProfileId)
          } finally {
            // The source has already changed and its writer cannot resume.
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
          return { ...result, willRelaunch: true }
        }
        return result
      }
      if (args.sourceProfileId !== current.activeProfileId) {
        await store.flushPendingOrThrowAsync({ drainToStableGeneration: false })
        return transferMarkovProfileProject(args, getProfileUserDataPath())
      }
      const maintenance = await flushActiveProfileBeforeFileMutation(store)
      try {
        return transferMarkovProfileProject(args, getProfileUserDataPath())
      } finally {
        await maintenance.resume()
      }
    }
  )

  ipcMain.handle(
    'markovProfiles:findProjectProfiles',
    (_event, rawArgs: FindMarkovProfileProjectsByPathArgs): FindMarkovProfileProjectsByPathResult =>
      findMarkovProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )

  ipcMain.handle(
    'markovProfiles:connectCurrent',
    async (): Promise<ConnectCurrentMarkovProfileResult> => {
      const result = await connectCurrentMarkovProfile(getProfileUserDataPath())
      if (result.status === 'connected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle('markovProfiles:signInProgress', (): MarkovCloudSignInProgress | null =>
    getMarkovCloudSignInProgress()
  )

  ipcMain.handle('markovProfiles:cancelSignIn', (): void => cancelMarkovCloudSignIn())

  ipcMain.handle(
    'markovProfiles:createCloudLinked',
    async (
      _event,
      rawArgs?: CreateCloudLinkedMarkovProfileArgs
    ): Promise<CreateCloudLinkedMarkovProfileResult> => {
      const result = await createCloudLinkedMarkovProfile(
        getProfileUserDataPath(),
        createCloudLinkedProfileArgsFromUnknown(rawArgs)
      )
      if (result.status === 'created') {
        seedNewMarkovProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'markovProfiles:refreshAuth',
    async (): Promise<RefreshCurrentMarkovProfileAuthResult> => {
      const result = await refreshCurrentMarkovProfileAuth(getProfileUserDataPath())
      if (result.status === 'refreshed') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'markovProfiles:signOutCurrent',
    async (): Promise<SignOutCurrentMarkovProfileResult> => {
      options.onBeforeSignOut?.()
      return signOutCurrentMarkovProfile(getProfileUserDataPath()).finally(options.onAfterSignOut)
    }
  )

  ipcMain.handle(
    'markovProfiles:selectOrg',
    async (_event, rawArgs: SelectMarkovProfileOrgArgs): Promise<SelectMarkovProfileOrgResult> => {
      const result = await selectCurrentMarkovProfileOrg(
        getProfileUserDataPath(),
        orgIdFromUnknown(rawArgs)
      )
      if (result.status === 'selected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  registerMarkovProfileOrgMemberHandlers()
}
