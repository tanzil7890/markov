import type { ProviderRateLimits } from '../../shared/rate-limit-types'

/** What a withheld provider reports: nothing to show, and nothing wrong. */
export function withheldUsageSnapshot(
  provider: ProviderRateLimits['provider'],
  now: number = Date.now()
): ProviderRateLimits {
  return {
    provider,
    session: null,
    weekly: null,
    updatedAt: now,
    error: null,
    status: 'unavailable'
  }
}
