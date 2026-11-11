import { createHash } from 'node:crypto'
import type { MarkovdMigrationBlobDescriptor } from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import { sameMarkovdMigrationBlob } from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import {
  MAX_MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES,
  MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
  MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
  parseMarkovdMigrationTerminalRestoreHintsDocument,
  type MarkovdMigrationTerminalRestoreHint
} from '../../../shared/markovd-migration/markovd-migration-terminal-restore-hints'
import type { MarkovdMigrationBlobSource } from '../../ssh/markovd-migration-blob-coordinator'

export type WslMoveRestoreHintsBlob = {
  descriptor: MarkovdMigrationBlobDescriptor
  bytes: Buffer
  source: MarkovdMigrationBlobSource
}

/** Omit the blob when there are no hints. */
export function buildWslMoveRestoreHintsBlob(
  hints: readonly MarkovdMigrationTerminalRestoreHint[]
): WslMoveRestoreHintsBlob | null {
  if (hints.length === 0) {
    return null
  }
  // Validate before staging so malformed hints fail while the source still owns the move.
  const document = parseMarkovdMigrationTerminalRestoreHintsDocument({
    version: MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
    hints: hints.map((hint) => ({ paneKey: hint.paneKey, cwd: hint.cwd }))
  })
  const bytes = Buffer.from(JSON.stringify(document), 'utf8')
  if (bytes.length > MAX_MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES) {
    throw new Error('markovd_migration_terminal_restore_hints_too_large')
  }
  const descriptor: MarkovdMigrationBlobDescriptor = {
    blobKind: 'terminal-restore-hints',
    key: MARKOVD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length
  }
  return {
    descriptor,
    bytes,
    source: {
      readChunk: async (requested, offset, maxBytes) => {
        if (!sameMarkovdMigrationBlob(requested, descriptor)) {
          throw new Error(`markovd_migration_source_blob_changed:${requested.blobKind}`)
        }
        return bytes.subarray(offset, offset + maxBytes)
      }
    }
  }
}
