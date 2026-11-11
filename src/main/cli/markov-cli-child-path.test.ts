import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../../config/scripts/test-runtime/environment/vitest-host-ports-setup'

const shim = vi.hoisted(() => ({ ensureLinuxTerminalMarkovCliShimDir: vi.fn() }))
vi.mock('./linux-terminal-markov-cli-shim', () => shim)

import { prependMarkovCliDirToChildPath } from './markov-cli-child-path'

const USER_DATA = '/data/markov'
const SHIM_DIR = join(USER_DATA, 'linux-markov-cli-shim')

beforeEach(() => {
  installFakeAppEnvironment()
  shim.ensureLinuxTerminalMarkovCliShimDir.mockReset()
  shim.ensureLinuxTerminalMarkovCliShimDir.mockReturnValue(SHIM_DIR)
})

afterEach(() => installFakeAppEnvironment())

describe('prependMarkovCliDirToChildPath', () => {
  it.each(['linux', 'darwin'] as const)(
    'uses the %s execution host CLI and profile over inherited values',
    (platform) => {
      const launcher = join(USER_DATA, 'cli', 'bin', 'markov')
      installFakeAppEnvironment({ getCliLauncherPath: () => launcher })
      const env: Record<string, string> = {
        PATH: `/usr/bin:${join(USER_DATA, 'cli', 'bin')}::/bin`,
        MARKOV_USER_DATA_PATH: '/parent/profile',
        MARKOV_CLI_COMMAND: '/parent/markov',
        MARKOV_CLI_BIN_DIR: '/parent/bin'
      }
      expect(
        prependMarkovCliDirToChildPath(env, {
          isPackaged: true,
          userDataPath: USER_DATA,
          resourcesPath: null,
          platform
        })
      ).toBe(launcher)
      expect(env.PATH).toBe(`${join(USER_DATA, 'cli', 'bin')}:/usr/bin:/bin`)
      expect(env.MARKOV_USER_DATA_PATH).toBe(USER_DATA)
      expect(env.MARKOV_CLI_COMMAND).toBe(launcher)
      expect(env.MARKOV_CLI_BIN_DIR).toBe(join(USER_DATA, 'cli', 'bin'))
      expect(shim.ensureLinuxTerminalMarkovCliShimDir).not.toHaveBeenCalled()
    }
  )
  it('exports the owning packaged Linux launcher and profile together with PATH', () => {
    const env = {
      PATH: `/usr/bin:${SHIM_DIR}::/bin`,
      MARKOV_CLI_COMMAND: '/other/markov',
      MARKOV_USER_DATA_PATH: '/other/profile'
    }
    const launcher = prependMarkovCliDirToChildPath(env, {
      isPackaged: true,
      userDataPath: USER_DATA,
      platform: 'linux'
    })

    expect(launcher).toBe(join(SHIM_DIR, 'markov'))
    expect(env.MARKOV_CLI_COMMAND).toBe(launcher)
    expect(env.MARKOV_USER_DATA_PATH).toBe(USER_DATA)
    expect(env.PATH).toBe(`${SHIM_DIR}:/usr/bin:/bin`)
  })

  it('puts a Windows execution host CLI first on Path without a POSIX restore dir', () => {
    const binDir = join(USER_DATA, 'cli', 'bin')
    const launcher = join(binDir, 'markov.exe')
    installFakeAppEnvironment({ getCliLauncherPath: () => launcher })
    const env: Record<string, string> = {
      Path: `C:\\Windows;${binDir};;C:\\Tools`,
      MARKOV_USER_DATA_PATH: 'C:\\parent\\profile',
      MARKOV_CLI_COMMAND: 'C:\\parent\\markov.exe',
      MARKOV_CLI_BIN_DIR: '/parent/bin'
    }
    expect(
      prependMarkovCliDirToChildPath(env, {
        isPackaged: true,
        userDataPath: USER_DATA,
        resourcesPath: null,
        platform: 'win32'
      })
    ).toBe(launcher)
    expect(env).toEqual({
      Path: `${binDir};C:\\Windows;C:\\Tools`,
      MARKOV_USER_DATA_PATH: USER_DATA,
      MARKOV_CLI_COMMAND: launcher
    })
  })

  it('writes no trailing delimiter when nothing was inherited', () => {
    const env: Record<string, string> = { PATH: '' }
    const inheritedPath = process.env.PATH
    delete process.env.PATH
    try {
      prependMarkovCliDirToChildPath(env, {
        isPackaged: false,
        userDataPath: USER_DATA,
        platform: 'linux'
      })
    } finally {
      if (inheritedPath !== undefined) {
        process.env.PATH = inheritedPath
      }
    }
    // Why: an empty trailing segment resolves as `.` in some shells.
    expect(env.PATH).toBe(join(USER_DATA, 'cli', 'bin'))
  })
})
