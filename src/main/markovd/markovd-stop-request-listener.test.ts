import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MARKOVD_STOP_REQUEST_FILENAME } from '../../shared/markovd-stop-request'
import { acquireMarkovdInstanceLock } from './markovd-instance-lock'
import { markovdManagedStopRequestPath } from './markovd-managed-stop-request'
import {
  installMarkovdStopRequestListeners,
  type MarkovdStopRequestListener
} from './markovd-stop-request-listener'

const roots: string[] = []
const listeners: MarkovdStopRequestListener[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const listener of listeners.splice(0)) {
    listener.close()
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function directory(): string {
  const root = mkdtempSync(join(tmpdir(), 'markovd-stop-listener-'))
  roots.push(root)
  return root
}

function managedContext() {
  const lock = acquireMarkovdInstanceLock(directory(), { identity: () => 'uid-1000' })
  const { pid, startedAtMs, nonce } = lock.record
  return {
    version: '1.0.0',
    runtimeId: 'runtime-1',
    instance: { pid, startedAtMs, nonce, lockPath: lock.path }
  }
}

function listen(
  onRequest: () => void,
  options: Parameters<typeof installMarkovdStopRequestListeners>[1]
) {
  const listener = installMarkovdStopRequestListeners(onRequest, { pollIntervalMs: 10, ...options })
  listeners.push(listener)
  return listener
}

describe('markovd stop-request listeners', () => {
  it('picks up a slot request written later, once', async () => {
    const installRoot = directory()
    const onRequest = vi.fn()
    listen(onRequest, { installRoot })
    writeFileSync(join(installRoot, MARKOVD_STOP_REQUEST_FILENAME), '')
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce())
    writeFileSync(join(installRoot, MARKOVD_STOP_REQUEST_FILENAME), '')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onRequest).toHaveBeenCalledOnce()
  })

  it('stops after preparation even when preparation fails', async () => {
    const managedStop = managedContext()
    const onRequest = vi.fn()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    listen(onRequest, {
      installRoot: directory(),
      managedStop,
      beforeManagedStop: async () => {
        throw new Error('daemon unreachable')
      }
    })
    writeFileSync(
      markovdManagedStopRequestPath(managedStop.instance),
      JSON.stringify({
        schemaVersion: 1,
        transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
        retireIdleDaemon: true,
        ...managedStop
      })
    )
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce())
    expect(report).toHaveBeenCalledWith(
      '[markovd] managed stop preparation failed:',
      expect.any(Error)
    )
  })

  it('stops on a valid managed request and keeps it as evidence', async () => {
    const managedStop = managedContext()
    const onRequest = vi.fn()
    listen(onRequest, { installRoot: directory(), managedStop })
    const path = markovdManagedStopRequestPath(managedStop.instance)
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
        ...managedStop
      })
    )
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce())
    expect(existsSync(path)).toBe(true)
  })

  it('acts once on a managed request written before the listeners were installed', async () => {
    const managedStop = managedContext()
    writeFileSync(
      markovdManagedStopRequestPath(managedStop.instance),
      JSON.stringify({
        schemaVersion: 1,
        transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
        ...managedStop
      })
    )
    const onRequest = vi.fn()
    const prepare = vi.fn(async () => {})
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    listen(onRequest, { installRoot: directory(), managedStop, beforeManagedStop: prepare })
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(prepare).toHaveBeenCalledOnce()
    expect(onRequest).toHaveBeenCalledOnce()
    expect(report).not.toHaveBeenCalled()
  })

  it('ignores a managed request for another runtime and reports it once', async () => {
    const managedStop = managedContext()
    const onRequest = vi.fn()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    listen(onRequest, { installRoot: directory(), managedStop })
    writeFileSync(
      markovdManagedStopRequestPath(managedStop.instance),
      JSON.stringify({
        schemaVersion: 1,
        transactionId: '0b9f6a3e-9e2c-4c8e-8f58-4c0f6b1d2e3a',
        ...managedStop,
        runtimeId: 'runtime-2'
      })
    )
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onRequest).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledOnce()
  })

  it('stops watching once closed', async () => {
    const installRoot = directory()
    const onRequest = vi.fn()
    listen(onRequest, { installRoot }).close()
    writeFileSync(join(installRoot, MARKOVD_STOP_REQUEST_FILENAME), '')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onRequest).not.toHaveBeenCalled()
  })
})
