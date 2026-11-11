import {
  openCloudDatabase,
  openInMemoryCloudDatabase,
  type CloudDatabase,
  type OpenCloudDatabaseInput
} from '@markov-cloud/cloud-database'
import { accountsSchemaStatements } from './accounts-schema.js'

export async function openAccountsDatabase(
  input: Omit<OpenCloudDatabaseInput, 'service' | 'schemaStatements'>
): Promise<CloudDatabase> {
  return await openCloudDatabase({
    ...input,
    service: 'accounts',
    schemaStatements: accountsSchemaStatements()
  })
}

export async function openInMemoryAccountsDatabase(): Promise<CloudDatabase> {
  return await openInMemoryCloudDatabase(accountsSchemaStatements())
}
