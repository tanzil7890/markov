import { getAppEnvironment } from '../../shared/app-environment'
import {
  getMarkovProfileDataFile as getSharedMarkovProfileDataFile,
  getMarkovProfileStateDatabaseFile as getSharedMarkovProfileStateDatabaseFile
} from '../../shared/profile-state-storage-paths'
import { hasProfileStateDatabaseFiles } from '../persistence/profile-state/profile-state-storage-classification'
import { join } from 'node:path'

const LEGACY_DATA_FILE_NAME = 'markov-data.json'
const LEGACY_BROWSER_SESSION_META_FILE_NAME = 'browser-session-meta.json'
const PROFILE_INDEX_FILE_NAME = 'markov-profile-index.json'
const PROFILE_BROWSER_SESSION_META_FILE_NAME = 'browser-session-meta.json'
const PROFILE_DIRECTORY_NAME = 'profiles'
const PROFILE_MOVE_INTENT_DIRECTORY_NAME = 'profile-move-intents'

export const LEGACY_BACKUP_COUNT = 5

let profileUserDataPath: string | null = null

export function initMarkovProfilePaths(): void {
  profileUserDataPath = getAppEnvironment().getPath('userData')
}

export function getProfileUserDataPath(): string {
  if (!profileUserDataPath) {
    profileUserDataPath = getAppEnvironment().getPath('userData')
  }
  return profileUserDataPath
}

export function getMarkovProfileIndexPath(userDataPath = getProfileUserDataPath()): string {
  return join(userDataPath, PROFILE_INDEX_FILE_NAME)
}

export function getMarkovProfilesDirectory(userDataPath = getProfileUserDataPath()): string {
  return join(userDataPath, PROFILE_DIRECTORY_NAME)
}

/** Durable cross-profile move intents live outside either profile database. */
export function getMarkovProfileMoveIntentDirectory(
  userDataPath = getProfileUserDataPath()
): string {
  return join(userDataPath, PROFILE_MOVE_INTENT_DIRECTORY_NAME)
}

export function getMarkovProfileDirectory(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return join(getMarkovProfilesDirectory(userDataPath), profileId)
}

export function getMarkovProfileDataFile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return getSharedMarkovProfileDataFile(profileId, userDataPath)
}

export function getMarkovProfileStateDatabaseFile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return getSharedMarkovProfileStateDatabaseFile(profileId, userDataPath)
}

export function hasMarkovProfileStateDatabase(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): boolean {
  const databaseFile = getMarkovProfileStateDatabaseFile(profileId, userDataPath)
  return hasProfileStateDatabaseFiles(databaseFile)
}

export function getMarkovProfileBrowserSessionMetaFile(
  profileId: string,
  userDataPath = getProfileUserDataPath()
): string {
  return join(
    getMarkovProfileDirectory(profileId, userDataPath),
    PROFILE_BROWSER_SESSION_META_FILE_NAME
  )
}

export function legacyDataFilePath(userDataPath: string): string {
  return join(userDataPath, LEGACY_DATA_FILE_NAME)
}

export function legacyBrowserSessionMetaPath(userDataPath: string): string {
  return join(userDataPath, LEGACY_BROWSER_SESSION_META_FILE_NAME)
}

export function legacyBackupPath(userDataPath: string, index: number): string {
  return `${legacyDataFilePath(userDataPath)}.bak.${index}`
}

export function profileBackupPath(profileDataFile: string, index: number): string {
  return `${profileDataFile}.bak.${index}`
}
