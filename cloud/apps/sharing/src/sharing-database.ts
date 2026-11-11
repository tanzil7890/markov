import {
  openCloudDatabase,
  openInMemoryCloudDatabase,
  type CloudDatabase,
  type OpenCloudDatabaseInput
} from '@markov-cloud/cloud-database'
import { sharingSchemaStatements } from './sharing-schema.js'

export async function openSharingDatabase(
  input: Omit<OpenCloudDatabaseInput, 'service' | 'schemaStatements'>
): Promise<CloudDatabase> {
  return await openCloudDatabase({
    ...input,
    service: 'sharing',
    schemaStatements: sharingSchemaStatements()
  })
}

export async function openInMemorySharingDatabase(): Promise<CloudDatabase> {
  return await openInMemoryCloudDatabase(sharingSchemaStatements())
}
