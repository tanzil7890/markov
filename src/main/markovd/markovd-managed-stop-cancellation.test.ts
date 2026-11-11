import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as WindowsAcl from '../../shared/secure-path-windows-acl'
import type { MarkovdManagedStopRequest } from '../../shared/markovd-stop-request'

import { acquireMarkovdInstanceLock } from './markovd-instance-lock'
import { markovdManagedStopRequestPath } from './markovd-managed-stop-request'
import { cancelMarkovdManagedStop } from './markovd-managed-stop-cancellation'
import { claimMarkovdManagedStopDecision } from './markovd-managed-stop-decision'

import { completeMarkovdManagedStop } from './markovd-managed-stop-completion'

import { installMarkovdStopRequestListeners } from './markovd-stop-request-listener'

const hardening = vi.hoisted(() => ({ pending: new Set<Promise<void>>() }))

vi.mock('../../shared/secure-path-windows-acl', async (importOriginal) => {
  const acl = await importOriginal<typeof WindowsAcl>()
  return {
    ...acl,
    restrictWindowsDirectory: (dirPath: string): Promise<boolean> => {
      const restricted = acl.restrictWindowsDirectory(dirPath)
      const pending = restricted.then(() => undefined)
      hardening.pending.add(pending)
      void pending.then(() => hardening.pending.delete(pending))
      return restricted
    }
  }
})

const roots: string[] = []
afterEach(async () => {
  // ACL updates must finish before their temporary directories disappear.
  await Promise.all(hardening.pending)
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})

function running(): MarkovdManagedStopRequest {
  const root = mkdtempSync(join(tmpdir(), 'markovd-stop-cancel-'))
  roots.push(root)
  const lock = acquireMarkovdInstanceLock(root, {
    identity: () => 'uid-1000',
    startedAtMs: () => 5
  })
  const { pid, startedAtMs, nonce } = lock.record
  return {
    schemaVersion: 1,
    transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
    version: '1.0.0',
    runtimeId: 'runtime-1',
    instance: { pid, startedAtMs, nonce, lockPath: lock.path }
  }
}

describe('cancelling a managed stop', () => {
  it('reports dispatched once markovd acted first, and leaves its request in place', () => {
    const request = running()
    writeFileSync(markovdManagedStopRequestPath(request.instance), JSON.stringify(request))
    expect(claimMarkovdManagedStopDecision(request, 'dispatched')).toBe('dispatched')
    expect(cancelMarkovdManagedStop(request)).toBe('dispatched')
    expect(existsSync(markovdManagedStopRequestPath(request.instance))).toBe(true)
  })

  it('never removes another transaction pending for the same instance', () => {
    const request = running()
    const other = { ...request, transactionId: '5a7e1f0c-3b2d-4e6f-9a8b-7c6d5e4f3a2b' }
    writeFileSync(markovdManagedStopRequestPath(request.instance), JSON.stringify(other))
    expect(cancelMarkovdManagedStop(request)).toBe('canceled')
    expect(existsSync(markovdManagedStopRequestPath(request.instance))).toBe(true)
  })

  it('does not reissue a cancelled transaction while markovd keeps running', async () => {
    const request = running()
    cancelMarkovdManagedStop(request)
    expect(
      await completeMarkovdManagedStop(request, {
        probeProcess: () => 'alive',
        startedAtMs: () => 5,
        sleep: async () => {}
      })
    ).toBe('live')
    expect(existsSync(markovdManagedStopRequestPath(request.instance))).toBe(false)
  })

  it('keeps markovd running when its listener meets a cancelled request', async () => {
    const request = running()
    cancelMarkovdManagedStop(request)
    writeFileSync(markovdManagedStopRequestPath(request.instance), JSON.stringify(request))
    const onRequest = vi.fn()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'markovd-stop-cancel-slot-'))
    roots.push(root)
    const listener = installMarkovdStopRequestListeners(onRequest, {
      installRoot: root,
      managedStop: {
        version: request.version,
        runtimeId: request.runtimeId,
        instance: request.instance
      },
      pollIntervalMs: 10
    })
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    listener.close()
    expect(onRequest).not.toHaveBeenCalled()
    expect(String(report.mock.calls[0]?.[1])).toContain('markovd_managed_stop_canceled')
    expect(existsSync(markovdManagedStopRequestPath(request.instance))).toBe(false)
  })
})
