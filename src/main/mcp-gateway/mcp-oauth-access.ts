import type { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import { McpOAuthRequestError, refreshMcpAccessToken } from './mcp-oauth-token-client'
import type { McpHttpFetch } from './mcp-streamable-http-transport'

const EXPIRY_MARGIN_MS = 60_000

/** Hands out each connection's access token and renews it, one renewal at a time per connection. */
export class McpOAuthAccess {
  private readonly renewing = new Map<string, Promise<boolean>>()

  constructor(
    private readonly vault: McpConnectionSecretVault,
    private readonly fetch: McpHttpFetch,
    private readonly now: () => number
  ) {}

  /** Null when the connection has no sign-in. */
  async accessToken(connectionId: string): Promise<string | null> {
    const grant = (await this.vault.read(connectionId)).oauth
    if (!grant) {
      return null
    }
    if (grant.expiresAt !== null && grant.expiresAt - this.now() < EXPIRY_MARGIN_MS) {
      await this.renew(connectionId)
      return (await this.vault.read(connectionId)).oauth?.accessToken ?? grant.accessToken
    }
    return grant.accessToken
  }

  /** True when a new access token is in place. */
  renew(connectionId: string): Promise<boolean> {
    const running = this.renewing.get(connectionId)
    if (running) {
      return running
    }
    const renewal = this.renewOnce(connectionId).finally(() => {
      this.renewing.delete(connectionId)
    })
    this.renewing.set(connectionId, renewal)
    return renewal
  }

  private async renewOnce(connectionId: string): Promise<boolean> {
    const secrets = await this.vault.read(connectionId)
    const grant = secrets.oauth
    if (!grant?.refreshToken) {
      return false
    }
    try {
      const tokens = await refreshMcpAccessToken({
        server: grant.server,
        client: grant.client,
        resource: grant.resource,
        refreshToken: grant.refreshToken,
        fetch: this.fetch,
        now: this.now()
      })
      await this.vault.write(connectionId, { ...secrets, oauth: { ...grant, ...tokens } })
      return true
    } catch (error) {
      if (error instanceof McpOAuthRequestError && error.grantRejected) {
        // The sign-in was revoked; forgetting it makes the connection ask for a new one.
        await this.vault.write(connectionId, { ...secrets, oauth: null })
      }
      return false
    }
  }
}
