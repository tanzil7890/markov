import { describe, expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { markovdMigrationCutoverFixture } from '../../ssh/markovd-migration-cutover-fixture'
import { subtractMarkovdMigrationClientState } from './markovd-source-client-subtraction'

const worktreeId = 'repo-1::/srv/worktree'

function manifest(): MarkovdMigrationManifest {
  const base = markovdMigrationCutoverFixture('m-1', 'target-1', {
    environmentId: 'environment-1'
  }).manifest
  return {
    ...base,
    payload: {
      ...base.payload,
      dormantState: {
        version: 1,
        worktreeMeta: [],
        worktreeLineage: [],
        workspaceLineage: [],
        sparsePresets: [],
        retiredWorktreeNames: [],
        retiredWorktreeNamespaces: [],
        clientState: {
          clientHostedBrowserCloseIntents: [
            { sourceEnvironmentId: 'old', browserPageId: 'page-1', worktreeId, closedAt: 42 },
            { sourceEnvironmentId: 'old', browserPageId: 'page-2', worktreeId, closedAt: 43 }
          ]
        }
      }
    }
  }
}

describe('retiring client-hosted browser close intents', () => {
  it('moves close intents to the destination and accepts an exact retry', () => {
    const state = getDefaultPersistedState('/home/test')
    state.workspaceSession.clientHostedBrowserCloseIntentsByEnvironment = {
      old: [
        { browserPageId: 'page-1', worktreeId, closedAt: 42 },
        { browserPageId: 'page-2', worktreeId, closedAt: 43 }
      ]
    }
    subtractMarkovdMigrationClientState(state, manifest())
    const moved = {
      'environment-1': [
        { browserPageId: 'page-1', worktreeId, closedAt: 42 },
        { browserPageId: 'page-2', worktreeId, closedAt: 43 }
      ]
    }
    expect(state.workspaceSession.clientHostedBrowserCloseIntentsByEnvironment).toEqual(moved)
    expect(() => subtractMarkovdMigrationClientState(state, manifest())).not.toThrow()
    expect(state.workspaceSession.clientHostedBrowserCloseIntentsByEnvironment).toEqual(moved)
  })

  it('still refuses a source intent that is gone without reaching the destination', () => {
    const state = getDefaultPersistedState('/home/test')
    state.workspaceSession.clientHostedBrowserCloseIntentsByEnvironment = {
      old: [{ browserPageId: 'page-2', worktreeId, closedAt: 43 }],
      'environment-1': [{ browserPageId: 'page-1', worktreeId, closedAt: 99 }]
    }
    expect(() => subtractMarkovdMigrationClientState(state, manifest())).toThrow(
      'markovd_migration_source_close_intent_changed'
    )
  })
})
