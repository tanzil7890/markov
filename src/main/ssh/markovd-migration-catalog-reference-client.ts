import { parseMarkovdMigrationCatalogReferenceAbortResult } from '../../shared/markovd-migration/markovd-migration-catalog-state'
import type {
  MarkovdMigrationCatalogReference,
  MarkovdMigrationCatalogReferenceAbortResult
} from '../../shared/markovd-migration/markovd-migration-manifest'
import { MARKOVD_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY } from '../../shared/markovd-runtime-capabilities'
import { parsePairingCode } from '../../shared/remote-runtime/pairing/pairing'
import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import {
  MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED,
  sendSupportedMigrationRequest,
  type CatalogRequestOptions
} from './markovd-migration-catalog-client'

/** Unlike migration-unsupported, this refusal cannot prove no earlier stage exists. */
export const MARKOVD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED =
  'markovd_migration_destination_abort_by_reference_unsupported:Update Markov on this host to cancel this move.'

/** Abort by manifest identity when the full request cannot fit the sealed frame. */
export async function abortRemoteMarkovdMigrationCatalogByReference(
  pairingCode: string,
  manifest: MarkovdMigrationCatalogReference,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationCatalogReferenceAbortResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('markovd_migration_pairing_code_invalid')
  }
  let supportsReference = false
  let response: RuntimeRpcResponse<unknown>
  try {
    response = await sendSupportedMigrationRequest(
      pairing,
      'markovd.migration.abortCatalogByReference',
      { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 },
      options,
      false,
      null,
      (capabilities) => {
        supportsReference = capabilities.includes(
          MARKOVD_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY
        )
        if (!supportsReference) {
          throw new Error(MARKOVD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
        }
      }
    )
  } catch (error) {
    // A missing method on a host that advertised it proves nothing about what it staged.
    if (
      supportsReference &&
      error instanceof Error &&
      error.message === MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED
    ) {
      throw new Error(MARKOVD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
    }
    throw error
  }
  if (!response.ok) {
    throw new Error(`markovd_migration_abort_failed:${response.error.message}`)
  }
  return parseMarkovdMigrationCatalogReferenceAbortResult(response.result, manifest)
}
