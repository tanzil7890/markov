import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MARKOVD_MANAGED_ACTIVATION_ROOT_ENV } from '../../shared/markovd-managed-launch-env'
import {
  MARKOVD_COMPILE_CACHE_DIRNAME,
  enableManagedMarkovdCompileCache,
  markovdCompileCacheEnv
} from './markovd-compile-cache'

const managed = {
  [MARKOVD_MANAGED_ACTIVATION_ROOT_ENV]: '/home/u/.markov-remote/.fence'
}

describe('managed markovd compile cache', () => {
  it('never writes into a slot no client manages, such as a packaged app', () => {
    const enableCompileCache = vi.fn()
    enableManagedMarkovdCompileCache('/Applications/Markov.app/markovd', {}, { enableCompileCache })
    expect(enableCompileCache).not.toHaveBeenCalled()
  })

  it('starts as before on a runtime without the API or with an unwritable slot', () => {
    expect(() => enableManagedMarkovdCompileCache('/slot', managed, {})).not.toThrow()
    const enableCompileCache = vi.fn(() => {
      throw new Error('EACCES')
    })
    expect(() =>
      enableManagedMarkovdCompileCache('/slot', managed, { enableCompileCache })
    ).not.toThrow()
  })

  it('hands the preflight child the slot cache only when this process enabled one', () => {
    const enabled = { getCompileCacheDir: () => '/slot/x/v24' }
    expect(markovdCompileCacheEnv('/slot', enabled, managed)).toEqual({
      NODE_COMPILE_CACHE: join('/slot', MARKOVD_COMPILE_CACHE_DIRNAME)
    })
    expect(
      markovdCompileCacheEnv('/slot', { getCompileCacheDir: () => undefined }, managed)
    ).toEqual({})
    expect(markovdCompileCacheEnv('/slot', {}, managed)).toEqual({})
    expect(markovdCompileCacheEnv('/slot', enabled, {})).toEqual({})
  })
})
