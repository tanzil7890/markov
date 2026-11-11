import { z } from 'zod'
import { hashToken } from './opaque-token.js'

const ACCOUNTS_TIMEOUT_MS = 5_000
const MAX_CACHED_CALLERS = 10_000

const CapabilitiesResponseSchema = z.object({ cloud: z.object({ userId: z.string().min(1) }) })

export type CallerLookup =
  | { status: 'ok'; userId: string }
  | { status: 'unauthorized' }
  | { status: 'unavailable' }

export class AccountsCallerLookup {
  private readonly cache = new Map<string, { userId: string; expiresAt: number }>()

  constructor(
    private readonly accountsUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly now: () => number,
    private readonly cacheMs: number
  ) {}

  async lookup(accessToken: string): Promise<CallerLookup> {
    const cacheKey = hashToken(accessToken)
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > this.now()) {
      return { status: 'ok', userId: cached.userId }
    }
    this.cache.delete(cacheKey)
    let response: Response
    try {
      response = await this.fetcher(`${this.accountsUrl}/v1/desktop/auth/capabilities`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: '{}',
        redirect: 'error',
        signal: AbortSignal.timeout(ACCOUNTS_TIMEOUT_MS)
      })
    } catch {
      return { status: 'unavailable' }
    }
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined)
      return { status: 'unauthorized' }
    }
    const parsed = response.ok
      ? CapabilitiesResponseSchema.safeParse(await response.json().catch(() => null))
      : null
    if (!parsed?.success) {
      await response.body?.cancel().catch(() => undefined)
      return { status: 'unavailable' }
    }
    this.remember(cacheKey, parsed.data.cloud.userId)
    return { status: 'ok', userId: parsed.data.cloud.userId }
  }

  private remember(cacheKey: string, userId: string): void {
    if (this.cache.size >= MAX_CACHED_CALLERS) {
      const now = this.now()
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(key)
      }
      // Map iteration is insertion order, so this drops the oldest entry.
      const oldest = this.cache.keys().next()
      if (this.cache.size >= MAX_CACHED_CALLERS && !oldest.done) this.cache.delete(oldest.value)
    }
    this.cache.set(cacheKey, { userId, expiresAt: this.now() + this.cacheMs })
  }
}
