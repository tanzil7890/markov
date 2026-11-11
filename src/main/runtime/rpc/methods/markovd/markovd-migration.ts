import type { z } from 'zod'
import {
  MarkovdMigrationCatalogParams,
  MarkovdMigrationCatalogReferenceParams,
  MarkovdMigrationCommitCatalogParams
} from '../../../../../shared/rpc-contract/markovd-migration-params'
import { parseMarkovdMigrationManifest } from '../../../../../shared/markovd-migration/markovd-migration-manifest-validation'
import { MarkovdMigrationSnapshotChunkRequestSchema } from '../../../../../shared/markovd-migration/markovd-migration-scrollback'
import { MarkovdMigrationBlobChunkRequestSchema } from '../../../../../shared/markovd-migration/markovd-migration-blob-transfer'
import { assertMarkovdMigrationManifestDigest } from '../../../../markovd/markovd-migration-manifest-digest'
import { assertMarkovdMigrationSourceServedHere } from '../../../../markovd/markovd-migration-wsl-destination'
import { defineMethod, type RpcContext } from '../../core'

export const MARKOVD_MIGRATION_METHODS = [
  defineMethod({
    name: 'markovd.migration.stageCatalog',
    permission: 'host-admin',
    params: MarkovdMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageMarkovdMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'markovd.migration.commitCatalog',
    permission: 'host-admin',
    params: MarkovdMigrationCommitCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.commitStagedMarkovdMigrationCatalog(migrationManifest(params), {
        signal: context.signal,
        ...(params.expectedBlobs ? { expectedBlobs: params.expectedBlobs } : {})
      })
    }
  }),
  defineMethod({
    name: 'markovd.migration.stageSnapshotChunk',
    permission: 'host-admin',
    params: MarkovdMigrationSnapshotChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageMarkovdMigrationSnapshotChunk(params)
    }
  }),
  // A separate method, not a field on stageSnapshotChunk: an older host would strip the field and
  // stage the bytes as a snapshot.
  defineMethod({
    name: 'markovd.migration.stageBlobChunk',
    permission: 'host-admin',
    params: MarkovdMigrationBlobChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageMarkovdMigrationBlobChunk(params)
    }
  }),
  defineMethod({
    name: 'markovd.migration.abortCatalog',
    permission: 'host-admin',
    params: MarkovdMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedMarkovdMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  // Why a reference: a source fenced on a manifest no request can carry must still be releasable.
  defineMethod({
    name: 'markovd.migration.abortCatalogByReference',
    permission: 'host-admin',
    params: MarkovdMigrationCatalogReferenceParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedMarkovdMigrationCatalogByReference(params, {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'markovd.migration.catalogState',
    permission: 'host-admin',
    params: MarkovdMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.getMarkovdMigrationCatalogState(migrationManifest(params))
    }
  })
]

function migrationManifest(params: z.infer<typeof MarkovdMigrationCatalogParams>) {
  const manifest = parseMarkovdMigrationManifest(params.manifest)
  // Raw, not parsed: parsing drops fields this host predates, which a newer client signed.
  assertMarkovdMigrationManifestDigest(params.manifest)
  assertMarkovdMigrationSourceServedHere(manifest.source)
  return manifest
}

function requireMigrationRuntimeClient(context: RpcContext): void {
  if (context.clientKind !== 'runtime' || !context.pairedDeviceId) {
    throw new Error('markovd_migration_runtime_client_required')
  }
}
