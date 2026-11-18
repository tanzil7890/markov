import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { hasUsageData } from '../../../../shared/usage-provider-windows'
import { isOfferedUsageProvider } from '../../../../shared/agent-launch/catalog/offered-usage-trackers'

export type UsageProviderSettings = Pick<
  GlobalSettings,
  | 'codexManagedAccounts'
  | 'claudeManagedAccounts'
  | 'opencodeSessionCookie'
  | 'geminiCliOAuthEnabled'
> & {
  // Antigravity setup is a checked item plus PATH detection; agy usage needs no Gemini OAuth.
  antigravityUsageConfigured: boolean
  // Why: MiniMax/Grok sign-in live on disk, not in settings; main sets these each poll.
  minimaxCookieConfigured: boolean
  minimaxApiKeyConfigured: boolean
  // Main reports safeStorage plan-key presence so ZCode survives reload before the first poll.
  zcodePlanApiKeyConfigured: boolean
  // Main reports OpenCode key presence because the renderer cannot inspect its environment or CLI store.
  opencodeGoApiKeyConfigured: boolean
  grokAuthConfigured: boolean
  cursorAuthConfigured: boolean
}

type UsageProviderSnapshots = {
  claude: ProviderRateLimits | null | undefined
  codex: ProviderRateLimits | null | undefined
  gemini: ProviderRateLimits | null | undefined
  opencodeGo: ProviderRateLimits | null | undefined
  kimi: ProviderRateLimits | null | undefined
  antigravity: ProviderRateLimits | null | undefined
  minimax: ProviderRateLimits | null | undefined
  grok: ProviderRateLimits | null | undefined
  cursor: ProviderRateLimits | null | undefined
  zcode?: ProviderRateLimits | null
}

type UsageProviderId = ProviderRateLimits['provider']

function isProviderSnapshotPending(provider: ProviderRateLimits | null | undefined): boolean {
  return provider == null || (provider.status === 'fetching' && !hasUsageData(provider))
}

// Hide unavailable/unproven snapshots; retain configured providers through transient errors to avoid flicker.
export function isProviderConfigured(
  provider: ProviderRateLimits | null | undefined
): provider is ProviderRateLimits {
  // Older main processes may omit newer provider keys during HMR.
  if (provider == null || provider.status === 'unavailable') {
    return false
  }
  if (provider.status === 'fetching' && !hasUsageData(provider)) {
    return false
  }
  return true
}

const USAGE_PROVIDER_IDS: readonly UsageProviderId[] = [
  'claude',
  'codex',
  'gemini',
  'opencode-go',
  'kimi',
  'antigravity',
  'minimax',
  'grok',
  'cursor',
  'zcode'
]

// Why offered only: sign-in saved for a withheld provider must not read as usage being set up.
export function hasUsageProviderSettings(
  settings: Partial<UsageProviderSettings> | null | undefined
): boolean {
  return USAGE_PROVIDER_IDS.some(
    (providerId) =>
      isOfferedUsageProvider(providerId) &&
      hasUsageProviderSettingsForProvider(providerId, settings)
  )
}

export function hasUsageProviderSettingsForProvider(
  providerId: UsageProviderId,
  settings: Partial<UsageProviderSettings> | null | undefined
): boolean {
  if (!settings) {
    return false
  }
  if (providerId === 'claude') {
    return (settings.claudeManagedAccounts?.length ?? 0) > 0
  }
  if (providerId === 'codex') {
    return (settings.codexManagedAccounts?.length ?? 0) > 0
  }
  if (providerId === 'gemini') {
    return settings.geminiCliOAuthEnabled === true
  }
  if (providerId === 'opencode-go') {
    return (
      Boolean(settings.opencodeSessionCookie?.trim()) ||
      settings.opencodeGoApiKeyConfigured === true
    )
  }
  if (providerId === 'antigravity') {
    // The agy probe needs only the PATH-gated checked item, independent of Gemini OAuth.
    return settings.antigravityUsageConfigured === true
  }
  if (providerId === 'minimax') {
    return settings.minimaxCookieConfigured === true || settings.minimaxApiKeyConfigured === true
  }
  if (providerId === 'grok') {
    return settings.grokAuthConfigured === true
  }
  if (providerId === 'cursor') {
    return settings.cursorAuthConfigured === true
  }
  if (providerId === 'zcode') {
    return settings.zcodePlanApiKeyConfigured === true
  }
  return false
}

export function createPendingProviderSnapshot(providerId: UsageProviderId): ProviderRateLimits {
  return {
    provider: providerId,
    session: null,
    weekly: null,
    ...(providerId === 'opencode-go' ? { monthly: null } : {}),
    // Bucket-backed providers need bucket-shaped pending skeletons to avoid layout changes on their first reading.
    ...(providerId === 'gemini' || providerId === 'cursor' || providerId === 'antigravity'
      ? { buckets: [] }
      : {}),
    updatedAt: 0,
    error: null,
    status: 'fetching'
  }
}

export function getVisibleUsageProvider(
  providerId: UsageProviderId,
  provider: ProviderRateLimits | null | undefined,
  settings: Partial<UsageProviderSettings> | null | undefined
): ProviderRateLimits | null {
  if (!isOfferedUsageProvider(providerId)) {
    return null
  }
  if (isProviderConfigured(provider)) {
    return provider
  }
  if (!hasUsageProviderSettingsForProvider(providerId, settings)) {
    return null
  }
  return provider ?? createPendingProviderSnapshot(providerId)
}

export function isUsageEmptyState(
  providers: UsageProviderSnapshots,
  settings: Partial<UsageProviderSettings> | null | undefined
): boolean {
  // Wait for settings hydration before offering setup that could contradict saved accounts.
  if (!settings) {
    return false
  }
  // A withheld provider is neither awaited nor counted; its snapshot never becomes a meter.
  const snapshots: [UsageProviderId, ProviderRateLimits | null | undefined][] = [
    ['claude', providers.claude],
    ['codex', providers.codex],
    ['gemini', providers.gemini],
    ['opencode-go', providers.opencodeGo],
    ['kimi', providers.kimi],
    ['antigravity', providers.antigravity],
    ['minimax', providers.minimax],
    ['grok', providers.grok],
    ['cursor', providers.cursor],
    ['zcode', providers.zcode]
  ]
  const offered = snapshots.filter(([providerId]) => isOfferedUsageProvider(providerId))
  // System-default Claude/Codex have no saved account row; wait for snapshots before proposing setup.
  const awaitingSnapshot = offered.some(([providerId, provider]) => {
    if (providerId === 'antigravity') {
      return (
        hasUsageProviderSettingsForProvider('antigravity', settings) &&
        isProviderSnapshotPending(provider)
      )
    }
    // Older main processes omit ZCode entirely; only a present snapshot can be pending.
    if (providerId === 'zcode') {
      return providers.zcode !== undefined && isProviderSnapshotPending(provider)
    }
    return isProviderSnapshotPending(provider)
  })
  if (awaitingSnapshot) {
    return false
  }
  return (
    !hasUsageProviderSettings(settings) &&
    !offered.some(([, provider]) => isProviderConfigured(provider))
  )
}
