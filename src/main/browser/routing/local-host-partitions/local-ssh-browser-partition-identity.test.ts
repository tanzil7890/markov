import { describe, expect, it } from 'vitest'
import { sshExecutionHostStorageIdentity } from '../identity/browser-execution-host-storage-identity'
import {
  deriveBrowserRoutePartition,
  deriveBrowserRoutePartitionStorageScope,
  deriveLocalSshBrowserRoutePartitionStorageScope
} from '../partitions/browser-route-identity'
import { localSshBrowserAuthorityConnectionIdentity } from './local-ssh-browser-partitions'

function derive(markovProfileId: string, browserProfileId: string, targetId: string) {
  return deriveBrowserRoutePartition({
    markovProfileId,
    browserProfileId,
    authorityConnectionIdentity: localSshBrowserAuthorityConnectionIdentity(markovProfileId),
    executionHostIdentity: sshExecutionHostStorageIdentity(targetId)
  })
}

describe('local ssh browser partition identity', () => {
  it('pins the golden partition so no per-boot value can sneak into the name', () => {
    // Changing this cookie-storage identity requires a migration.
    expect(derive('local-default', 'default', 'ssh-target-1').partition).toBe(
      'persist:markov-browser-v1-129506a6e0b187cfe30f70c054ce4f3915288d73f98774fb9556ba67c35ed6e8'
    )
  })

  it('derives one stable partition per (profile, target) and separates each axis', () => {
    const base = derive('local-default', 'default', 'ssh-target-1')
    expect(derive('local-default', 'default', 'ssh-target-1')).toEqual(base)
    expect(derive('local-default', 'default', 'ssh-target-2').partition).not.toBe(base.partition)
    expect(derive('local-default', 'session-a', 'ssh-target-1').partition).not.toBe(base.partition)
    expect(derive('profile-b', 'default', 'ssh-target-1').partition).not.toBe(base.partition)
  })

  it('separates the local-ssh storage scope domain from environment scopes', () => {
    expect(
      deriveLocalSshBrowserRoutePartitionStorageScope({
        markovProfileId: 'local-default',
        targetId: 'same-id'
      })
    ).not.toBe(
      deriveBrowserRoutePartitionStorageScope({
        markovProfileId: 'local-default',
        environmentId: 'same-id'
      })
    )
  })
})
