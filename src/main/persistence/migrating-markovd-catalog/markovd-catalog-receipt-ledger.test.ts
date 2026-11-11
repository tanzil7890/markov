import { describe, expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import { MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS } from '../../../shared/markovd-migration/markovd-migration-manifest-validation'
import { manifest } from './persistence-markovd-migration-catalog-fixture'
import {
  expireMarkovdMigrationStages,
  findMarkovdMigrationImportReceipt,
  MARKOVD_MIGRATION_STAGE_TTL_MS,
  recordMarkovdMigrationImportReceipt
} from './markovd-catalog-receipt-ledger'

const empty = { repositories: [], projectGroups: [], folderWorkspaces: [] }

function receiptFor(migrationId: string) {
  const input = manifest({ migrationId, payload: empty })
  return {
    input,
    receipt: {
      version: input.version,
      migrationId,
      manifestSha256: input.manifestSha256,
      source: input.source,
      importedAt: '2026-10-01T00:00:00.000Z',
      repositoryIds: [],
      projectGroupIds: [],
      folderWorkspaceIds: []
    }
  }
}

describe('markovd migration receipt ledger', () => {
  it('keeps answering for a commit whose receipt aged out of the bounded list', () => {
    const state = getDefaultPersistedState('/tmp/markovd-receipt-ledger')
    const first = receiptFor('migration-0')
    recordMarkovdMigrationImportReceipt(state, first.receipt)
    for (let index = 1; index <= MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS; index++) {
      recordMarkovdMigrationImportReceipt(state, receiptFor(`migration-${index}`).receipt)
    }
    expect(state.markovdMigrationImportReceipts).toHaveLength(MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS)
    expect(findMarkovdMigrationImportReceipt(state, first.input)).toEqual(first.receipt)
    expect(findMarkovdMigrationImportReceipt(state, receiptFor('never').input)).toBeUndefined()
  })

  it('expires a stage no client came back for', () => {
    const state = getDefaultPersistedState('/tmp/markovd-receipt-ledger')
    const stagedAt = '2026-10-01T00:00:00.000Z'
    state.markovdMigrationStagedCatalogs = [{ version: 1, manifest: manifest(), stagedAt }]
    const start = Date.parse(stagedAt)
    expect(expireMarkovdMigrationStages(state, start + MARKOVD_MIGRATION_STAGE_TTL_MS - 1)).toBe(
      false
    )
    expect(expireMarkovdMigrationStages(state, start + MARKOVD_MIGRATION_STAGE_TTL_MS)).toBe(true)
    expect(state.markovdMigrationStagedCatalogs).toEqual([])
  })
})
