import { describe, expect, it } from 'vitest'
import type { MarkovdMigrationManifestSource } from '../../shared/markovd-migration/markovd-migration-manifest'
import {
  assertMarkovdMigrationSourceServedHere,
  MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST
} from './markovd-migration-wsl-destination'

const WSL_SOURCE: MarkovdMigrationManifestSource = {
  kind: 'local-wsl',
  distro: 'Ubuntu',
  scopeRepoIds: ['repo-1'],
  scopeFolderWorkspaceIds: [],
  generation: 1
}
const WSL_HOST = { MARKOV_WSL_MARKOVD_HOST: '1', WSL_DISTRO_NAME: 'ubuntu' }

describe('WSL migration destination', () => {
  it('accepts its own distro, case-insensitively', () => {
    expect(() =>
      assertMarkovdMigrationSourceServedHere(WSL_SOURCE, WSL_HOST, 'linux')
    ).not.toThrow()
  })

  it.each([
    ['another distro', { ...WSL_HOST, WSL_DISTRO_NAME: 'Debian' }, 'linux'],
    ['a plain Linux host', {}, 'linux'],
    ['a desktop', WSL_HOST, 'darwin']
  ] as const)('refuses a WSL source on %s', (_label, env, platform) => {
    expect(() => assertMarkovdMigrationSourceServedHere(WSL_SOURCE, env, platform)).toThrow(
      MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST
    )
  })

  it('refuses a source from another registration of the same distro name', () => {
    const source = { ...WSL_SOURCE, distroGuid: '{AAAA}' }
    expect(() =>
      assertMarkovdMigrationSourceServedHere(
        source,
        { ...WSL_HOST, MARKOV_WSL_DISTRO_GUID: '{aaaa}' },
        'linux'
      )
    ).not.toThrow()
    for (const env of [{ ...WSL_HOST, MARKOV_WSL_DISTRO_GUID: '{BBBB}' }, WSL_HOST]) {
      expect(() => assertMarkovdMigrationSourceServedHere(source, env, 'linux')).toThrow(
        MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST
      )
    }
  })
})
