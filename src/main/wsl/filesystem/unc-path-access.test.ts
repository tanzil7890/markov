import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProcessResult } from '@markov/process-host/process-spec'
import { parseWslPath, wslUncDirectoryExistsAsync } from './unc-path-access'
import { toLinuxPath, toWindowsWslPath } from '../../../shared/wsl-paths'

const { runProcessMock, runProcessSyncMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  runProcessSyncMock: vi.fn()
}))

vi.mock('@markov/process-host', () => ({
  runProcess: runProcessMock,
  runProcessSync: runProcessSyncMock
}))

vi.mock('../execution/wsl-interop-spawn-directory', () => ({
  resolveWslInteropSpawnCwd: () => 'C:\\Windows'
}))

// These cases model hosts with no registered distro; the lost-output fallback has its own suite.
vi.mock('../discovery/wsl-registered-distro-fallback', () => ({
  listedOrRegisteredWslDistros: async (listed: string[]) => listed,
  readRegisteredWslDistrosLater: () => {},
  isWslListOutputLost: () => false,
  resetWslListOutputLost: () => {},
  runningWhenListedNone: async () => []
}))

function exited(stdout: string, code: number | null = 0): ProcessResult {
  return { code, signal: null, stdout, stderr: '', timedOut: false }
}

async function withPlatformAsync<T>(value: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value })
  try {
    return await fn()
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: original })
  }
}

describe('wsl path helpers', () => {
  it('parses WSL UNC paths on Windows', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32'
    })

    try {
      expect(parseWslPath('\\\\wsl.localhost\\Ubuntu\\home\\sam\\repo')).toEqual({
        distro: 'Ubuntu',
        linuxPath: '/home/sam/repo'
      })
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: originalPlatform
      })
    }
  })

  it('converts Windows drive paths to /mnt paths for WSL commands', () => {
    expect(toLinuxPath('C:\\Users\\casey\\git\\markov')).toBe('/mnt/c/Users/casey/git/markov')
  })

  it('converts /mnt drive paths back to native Windows form', () => {
    expect(toWindowsWslPath('/mnt/c/Users/casey/git/markov', 'Ubuntu')).toBe(
      'C:\\Users\\casey\\git\\markov'
    )
  })
})

describe('wslUncDirectoryExistsAsync', () => {
  afterEach(() => {
    runProcessMock.mockReset()
  })

  it('returns true when the distro reports the directory exists', async () => {
    runProcessMock.mockResolvedValue(exited('__MARKOV_DIRECTORY_EXISTS__'))

    await expect(
      withPlatformAsync('win32', () =>
        wslUncDirectoryExistsAsync('\\\\wsl.localhost\\Ubuntu\\home\\sam\\repo')
      )
    ).resolves.toBe(true)
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'wsl.exe',
        timeoutMs: 5000,
        args: [
          '-d',
          'Ubuntu',
          '--exec',
          'sh',
          '-c',
          expect.stringContaining('__MARKOV_DIRECTORY_EXISTS__'),
          'sh',
          '/home/sam/repo'
        ]
      })
    )
  })

  it('distinguishes a missing directory from an inconclusive probe', async () => {
    runProcessMock
      .mockResolvedValueOnce(exited('__MARKOV_DIRECTORY_MISSING__'))
      .mockResolvedValueOnce(exited('', 4294967295))

    await withPlatformAsync('win32', async () => {
      await expect(
        wslUncDirectoryExistsAsync('\\\\wsl.localhost\\Ubuntu\\home\\sam\\missing')
      ).resolves.toBe(false)
      await expect(
        wslUncDirectoryExistsAsync('\\\\wsl.localhost\\Ubuntu\\home\\sam\\repo')
      ).resolves.toBeNull()
    })
  })

  it('returns null without spawning for paths outside WSL or off Windows', async () => {
    await expect(
      withPlatformAsync('win32', () => wslUncDirectoryExistsAsync('C:\\Users\\sam\\repo'))
    ).resolves.toBeNull()
    await expect(
      withPlatformAsync('linux', () =>
        wslUncDirectoryExistsAsync('\\\\wsl.localhost\\Ubuntu\\home\\sam')
      )
    ).resolves.toBeNull()
    expect(runProcessMock).not.toHaveBeenCalled()
  })
})
