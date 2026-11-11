import { browserSessionRegistry } from './browser-session-registry'
import type { BrowserSessionRegistryProfileOptions } from './browser-session-registry'
import { collectOrphanedBrowserRoutePartitionStorage } from '../routing/partitions/browser-route-partition-storage-runtime'
import { configureRouteSessionsForMarkovProfile } from '../routing/sessions/browser-route-session-runtime'
import { configureBrowserSitePermissionStore } from '../site-settings/browser-site-permission-store'
import { configureBrowserSiteDisplayStore } from '../site-settings/browser-site-display-store'
import { configureBrowserExtensionProfileDataDirectory } from '../extensions/profile-storage/browser-extension-profile-data-directory'
import { configurePairedRuntimeBrowserClientHostsForMarkovProfile } from '../client-hosts/lifecycle/paired-runtime-browser-client-host-runtime'
import { configureBrowserPasswordVaults } from '../../browser-passwords/browser-password-vaults'

let initialized = false

export function initializeBrowserSessionsForApp(
  activeProfile?: BrowserSessionRegistryProfileOptions & {
    listLocalSshTargetIds?: () => string[]
  }
): void {
  if (initialized) {
    return
  }

  if (activeProfile) {
    browserSessionRegistry.configureForMarkovProfile(activeProfile)
    configureBrowserSitePermissionStore(activeProfile.profileDirectory)
    configureBrowserSiteDisplayStore(activeProfile.profileDirectory)
    configureBrowserExtensionProfileDataDirectory(activeProfile.profileDirectory)
    configureBrowserPasswordVaults(activeProfile.profileDirectory)
    configureRouteSessionsForMarkovProfile({
      markovProfileId: activeProfile.markovProfileId,
      profileDirectory: activeProfile.profileDirectory
    })
    configurePairedRuntimeBrowserClientHostsForMarkovProfile({
      markovProfileId: activeProfile.markovProfileId
    })
    void collectOrphanedBrowserRoutePartitionStorage(activeProfile.listLocalSshTargetIds).catch(
      (error) => {
        console.warn('[browser-route-partition] orphan collection failed:', error)
      }
    )
  }

  // Replay cookies before Chromium opens the live DB via session.fromPartition.
  browserSessionRegistry.applyPendingCookieImport()
  browserSessionRegistry.initializeBrowserSessionsFromPersistedState()
  initialized = true
}

/** Whether a partition may be opened: before this, opening one would skip a pending cookie import. */
export function browserSessionsInitialized(): boolean {
  return initialized
}
