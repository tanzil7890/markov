import { describe, expect, it } from 'vitest'
import {
  getLegacyManagedMarkovdOwnerEnvironmentId,
  getManagedMarkovdFenceEnvironmentId,
  isEphemeralRuntimeSshOwner,
  managedMarkovdServerName
} from './managed-markovd-ssh-owner'

describe('managed markovd SSH fence', () => {
  it('reads the fence from markovdFence, never from owner', () => {
    expect(getManagedMarkovdFenceEnvironmentId({ markovdFence: { environmentId: 'env-1' } })).toBe(
      'env-1'
    )
    const legacyOnly = {
      markovdFence: undefined,
      owner: { type: 'on-demand-runtime' as const, runtimeId: 'managed-markovd:old' }
    }
    expect(getManagedMarkovdFenceEnvironmentId({ ...legacyOnly })).toBeNull()
    expect(
      getManagedMarkovdFenceEnvironmentId({
        ...legacyOnly,
        markovdFence: { environmentId: 'env-2' }
      })
    ).toBe('env-2')
    expect(getManagedMarkovdFenceEnvironmentId(undefined)).toBeNull()
  })

  it('recognises the legacy owner fence only so loading can migrate it', () => {
    const legacy = { type: 'on-demand-runtime' as const, runtimeId: 'managed-markovd:env-1' }
    expect(getLegacyManagedMarkovdOwnerEnvironmentId(legacy)).toBe('env-1')
    expect(isEphemeralRuntimeSshOwner(legacy)).toBe(false)
  })

  it('keeps ordinary on-demand runtime targets ephemeral', () => {
    const owner = { type: 'on-demand-runtime' as const, runtimeId: 'runtime-1' }
    expect(getLegacyManagedMarkovdOwnerEnvironmentId(owner)).toBeNull()
    expect(isEphemeralRuntimeSshOwner(owner)).toBe(true)
  })

  it("names a recipe VM's server after its runtime, so two VMs of one recipe never collide", () => {
    const owner = { type: 'on-demand-runtime' as const, runtimeId: 'runtime-0123456789abcdef' }
    expect(managedMarkovdServerName({ label: 'Docker root', owner })).toBe(
      'Docker root VM 89abcdef'
    )
    expect(
      managedMarkovdServerName({
        label: 'Docker root',
        owner: { ...owner, runtimeId: 'runtime-fedcba9876543210' }
      })
    ).toBe('Docker root VM 76543210')
    expect(managedMarkovdServerName({ label: 'Builder' })).toBe('Builder')
  })
})
