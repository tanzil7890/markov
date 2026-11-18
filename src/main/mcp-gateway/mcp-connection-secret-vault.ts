import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { getSecretStore } from '../../shared/secret-store'
import { durableWriteTempPath, writeFileDurable } from '../filesystem/durable-file-write'
import { mcpAuthorizationServerSchema } from './mcp-oauth-discovery'
import { mcpOAuthClientSchema } from './mcp-oauth-token-client'

const vaultFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Base64 ciphertext of one connection's secrets, keyed by connection id. */
  sealed: z.record(z.string(), z.string())
})

const mcpOAuthGrantSchema = z.object({
  server: mcpAuthorizationServerSchema,
  resource: z.string(),
  client: mcpOAuthClientSchema,
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.number().nullable()
})

const connectionSecretsSchema = z.object({
  /** Header values (http) or environment values (stdio) by name. */
  values: z.record(z.string(), z.string()),
  oauth: mcpOAuthGrantSchema.nullable()
})

export type McpConnectionSecrets = z.infer<typeof connectionSecretsSchema>

export const EMPTY_MCP_CONNECTION_SECRETS: McpConnectionSecrets = { values: {}, oauth: null }

export class McpSecretVaultUnavailableError extends Error {
  constructor(detail: string | null) {
    super(
      detail ??
        'This computer has no keychain Markov can use, so the secret was not saved. Connections without secrets still work.'
    )
    this.name = 'McpSecretVaultUnavailableError'
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Connection secrets sealed by the host secret store; plaintext never touches disk. */
export class McpConnectionSecretVault {
  private sealed: Record<string, string> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  /** Secrets that can no longer be unsealed read as absent, so the person is asked again. */
  async read(connectionId: string): Promise<McpConnectionSecrets> {
    const ciphertext = (await this.load())[connectionId]
    if (!ciphertext) {
      return EMPTY_MCP_CONNECTION_SECRETS
    }
    try {
      return connectionSecretsSchema.parse(
        JSON.parse(getSecretStore().decryptString(Buffer.from(ciphertext, 'base64')))
      )
    } catch {
      return EMPTY_MCP_CONNECTION_SECRETS
    }
  }

  async write(connectionId: string, secrets: McpConnectionSecrets): Promise<void> {
    const empty = Object.keys(secrets.values).length === 0 && secrets.oauth === null
    if (empty) {
      await this.remove(connectionId)
      return
    }
    const store = getSecretStore()
    if (!store.isEncryptionAvailable()) {
      throw new McpSecretVaultUnavailableError(store.describeProtectionGap())
    }
    const ciphertext = store.encryptString(JSON.stringify(secrets)).toString('base64')
    await this.update((sealed) => ({ ...sealed, [connectionId]: ciphertext }))
  }

  async remove(connectionId: string): Promise<void> {
    if (!Object.hasOwn(await this.load(), connectionId)) {
      return
    }
    await this.update((sealed) =>
      Object.fromEntries(Object.entries(sealed).filter(([id]) => id !== connectionId))
    )
  }

  /** Only a missing or malformed file reads as empty; a file that cannot be read is left alone. */
  private async load(): Promise<Record<string, string>> {
    if (this.sealed) {
      return this.sealed
    }
    let text: string
    try {
      text = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error
      }
      this.sealed = {}
      return this.sealed
    }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    this.sealed = vaultFileSchema.safeParse(parsed).data?.sealed ?? {}
    return this.sealed
  }

  private async update(
    change: (sealed: Record<string, string>) => Record<string, string>
  ): Promise<void> {
    const update = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        const next = change(await this.load())
        await mkdir(dirname(this.filePath), { recursive: true })
        await writeFileDurable(
          durableWriteTempPath(this.filePath),
          this.filePath,
          JSON.stringify({ schemaVersion: 1, sealed: next }),
          0o600
        )
        this.sealed = next
      })
    this.writeChain = update
    await update
  }
}
