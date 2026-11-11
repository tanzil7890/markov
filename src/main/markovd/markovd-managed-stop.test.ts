import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as WindowsAcl from '../../shared/secure-path-windows-acl'
import type { MarkovdManagedStopRequest } from '../../shared/markovd-stop-request'
import { acquireMarkovdInstanceLock, type MarkovdInstanceLock } from './markovd-instance-lock'
import {
  markovdManagedStopRequestPath,
  validateMarkovdManagedStopRequest
} from './markovd-managed-stop-request'
import {
  completeMarkovdManagedStop,
  type MarkovdManagedStopCompletionOptions
} from './markovd-managed-stop-completion'
import {
  markovdStopReceiptPath,
  readMarkovdCompletedStopReceipt
} from './markovd-completed-stop-receipt'
import { runMarkovdManagedStopCommand } from './markovd-managed-stop-command'

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
    rmSync(root, { recursive: true, force: true })
  }
})

function running(): { lock: MarkovdInstanceLock; request: MarkovdManagedStopRequest } {
  const root = mkdtempSync(join(tmpdir(), 'markovd-managed-stop-'))
  roots.push(root)
  const lock = acquireMarkovdInstanceLock(root, {
    identity: () => 'uid-1000',
    version: () => '1.0.0',
    startedAtMs: () => 5_000,
    incarnation: () => null
  })
  const { pid, startedAtMs, nonce } = lock.record
  return {
    lock,
    request: {
      schemaVersion: 1,
      transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
      version: '1.0.0',
      runtimeId: 'runtime-1',
      instance: { pid, startedAtMs, nonce, lockPath: lock.path }
    }
  }
}

const context = ({ version, runtimeId, instance }: MarkovdManagedStopRequest) => ({
  version,
  runtimeId,
  instance
})

function options(
  overrides: Partial<MarkovdManagedStopCompletionOptions> = {}
): MarkovdManagedStopCompletionOptions {
  return {
    probeProcess: () => 'alive',
    startedAtMs: () => 5_000,
    sleep: async () => {},
    attempts: 3,
    now: () => new Date('2026-10-01T00:00:00.000Z'),
    ...overrides
  }
}

describe('managed stop requests', () => {
  it('accepts only a request naming this runtime, version and instance', () => {
    const { request } = running()
    const path = markovdManagedStopRequestPath(request.instance)
    writeFileSync(path, JSON.stringify(request))
    expect(validateMarkovdManagedStopRequest(context(request), path)).toEqual(request)
    for (const mismatch of [
      { ...request, version: '0.9.0' },
      { ...request, runtimeId: 'runtime-2' },
      { ...request, instance: { ...request.instance, pid: request.instance.pid + 1 } },
      {
        ...request,
        instance: { ...request.instance, lockPath: `${request.instance.lockPath}.old` }
      }
    ]) {
      writeFileSync(path, JSON.stringify(mismatch))
      expect(() => validateMarkovdManagedStopRequest(context(request), path)).toThrow(
        'identity_mismatch'
      )
    }
  })

  it('accepts the same lock path spelled differently, as a Windows client sends it', () => {
    const { request } = running()
    const path = markovdManagedStopRequestPath(request.instance)
    const { lockPath } = request.instance
    const respelled = `${dirname(lockPath)}/./${basename(lockPath)}`.replaceAll(sep, '/')
    expect(respelled).not.toBe(lockPath)
    const sent = { ...request, instance: { ...request.instance, lockPath: respelled } }
    writeFileSync(path, JSON.stringify(sent))
    expect(validateMarkovdManagedStopRequest(context(request), path)).toEqual(sent)
  })

  it('refuses a request once the instance lock names another holder', () => {
    const { lock, request } = running()
    const path = markovdManagedStopRequestPath(request.instance)
    writeFileSync(path, JSON.stringify(request))
    writeFileSync(lock.path, JSON.stringify({ ...lock.record, nonce: 'successor' }))
    expect(() => validateMarkovdManagedStopRequest(context(request), path)).toThrow(
      'instance_lock_changed'
    )
  })
})

describe('completing a managed stop', () => {
  it('writes the request, waits for proven exit, then persists a receipt', async () => {
    const { request } = running()
    const probes = ['alive', 'alive', 'missing'] as const
    let index = 0
    const verdict = await completeMarkovdManagedStop(
      request,
      options({ probeProcess: () => probes[Math.min(index++, probes.length - 1)] })
    )
    expect(verdict).toBe('exited')
    expect(
      JSON.parse(readFileSync(markovdManagedStopRequestPath(request.instance), 'utf8'))
    ).toEqual(request)
    expect(readMarkovdCompletedStopReceipt(request)).toMatchObject({
      kind: 'markovd_managed_stop_completed',
      exitedAt: '2026-10-01T00:00:00.000Z'
    })
  })

  it.each([
    ['an unanswerable probe', { probeProcess: () => 'unverifiable' as const }],
    ['a reused PID with no readable start time', { startedAtMs: () => null, attempts: 1 }]
  ])('never reports exit for %s', async (_name, overrides) => {
    const { request } = running()
    const verdict = await completeMarkovdManagedStop(request, options(overrides))
    expect(verdict).not.toBe('exited')
    expect(existsSync(markovdStopReceiptPath(request, 'completed'))).toBe(false)
  })

  it('does not address a live process that no longer holds the lock it published', async () => {
    const { lock, request } = running()
    writeFileSync(lock.path, JSON.stringify({ ...lock.record, nonce: 'successor' }))
    expect(await completeMarkovdManagedStop(request, options())).toBe('unverifiable')
    expect(existsSync(markovdManagedStopRequestPath(request.instance))).toBe(false)
  })

  it('does not overwrite another transaction pending for the same instance', async () => {
    const { request } = running()
    const pending = { ...request, transactionId: '5a7e1f0c-3b2d-4e6f-9a8b-7c6d5e4f3a2b' }
    writeFileSync(markovdManagedStopRequestPath(request.instance), JSON.stringify(pending))
    expect(await completeMarkovdManagedStop(request, options())).toBe('unverifiable')
  })

  it('reads the request from a staged file instead of argv', async () => {
    const { lock, request } = running()
    const staged = join(lock.path, '..', 'staged-request.json')
    writeFileSync(staged, JSON.stringify(request))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const completion = await runMarkovdManagedStopCommand(
      ['--complete-managed-stop', '--request-file', staged],
      options({ probeProcess: () => 'missing' })
    )
    expect(completion).toMatchObject({
      transactionId: request.transactionId,
      verdict: 'exited'
    })
    await expect(
      runMarkovdManagedStopCommand(['--complete-managed-stop', '--request-file'])
    ).rejects.toThrow('invalid_arguments')
  })
})
