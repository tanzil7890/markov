import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPlatformUserDataPath } from './metadata'
import { getMacOpenArgs } from './launch'
import { pinLaunchUserDataPath, resolveLaunchUserDataPath } from './launch-user-data-path'

describe('resolveLaunchUserDataPath', () => {
  it('prefers MARKOV_USER_DATA_PATH, made absolute', () => {
    expect(
      resolveLaunchUserDataPath({
        MARKOV_USER_DATA_PATH: 'rel/profile',
        MARKOV_DEV_USER_DATA_PATH: '/dev',
        MARKOV_APP_EXECUTABLE_NEEDS_APP_ROOT: '1'
      })
    ).toBe(resolve('rel/profile'))
  })

  it("falls back to the dev app's own profile for a dev executable", () => {
    expect(resolveLaunchUserDataPath({ MARKOV_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' })).toBe(
      resolve(join(getPlatformUserDataPath(), '..', 'markov-dev'))
    )
  })

  it('ignores MARKOV_DEV_USER_DATA_PATH for a packaged executable', () => {
    expect(resolveLaunchUserDataPath({ MARKOV_DEV_USER_DATA_PATH: '/dev' })).toBe(
      getPlatformUserDataPath()
    )
  })
})

describe('pinLaunchUserDataPath', () => {
  it('sets the dev override only for a dev executable', () => {
    expect(pinLaunchUserDataPath(['--no-sandbox'], {}, '/p')).toEqual({
      args: ['--no-sandbox', '--user-data-dir=/p'],
      env: { MARKOV_USER_DATA_PATH: '/p' }
    })
    expect(
      pinLaunchUserDataPath([], { MARKOV_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' }, '/p').env
    ).toMatchObject({ MARKOV_DEV_USER_DATA_PATH: '/p' })
  })
})

describe('getMacOpenArgs', () => {
  it('reopens the bundle as before on the default profile', () => {
    expect(getMacOpenArgs('/Applications/Markov.app', getPlatformUserDataPath())).toEqual([
      '/Applications/Markov.app'
    ])
  })

  it('starts a new instance on another profile instead of activating the running app', () => {
    expect(getMacOpenArgs('/Applications/Markov.app', '/isolated/p')).toEqual([
      '-n',
      '/Applications/Markov.app',
      '--args',
      '--user-data-dir=/isolated/p'
    ])
  })
})
