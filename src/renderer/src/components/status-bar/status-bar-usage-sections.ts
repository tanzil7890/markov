import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import { isCursorUsageBucket } from '../../../../shared/cursor-usage-buckets'
import { translate } from '@/i18n/i18n'
import { formatRateLimitWindowChipLabel } from '../../../../shared/rate-limit-window-label'
import { getUsageHeadlineSection } from './UsageRosterPanel'

export type StatusBarUsageSection = {
  key: string
  window: RateLimitWindow
  label: string
  labelFirst?: boolean
  /** The label is time left until this window resets. */
  countdown?: boolean
}

function windowSection(key: string, window: RateLimitWindow): StatusBarUsageSection {
  return {
    key,
    window,
    label: formatRateLimitWindowChipLabel(window),
    countdown: window.resetsAt != null
  }
}

const STATUS_BAR_BUCKET_NAMES = new Set(['Flash', 'Pro', '1.5 Pro'])

export function getStatusBarUsageSections(
  p: ProviderRateLimits | null,
  mode: StatusBarUsageMode
): StatusBarUsageSection[] {
  if (!p || p.status === 'idle' || p.status === 'unavailable') {
    return []
  }
  if (mode === 'compact') {
    const headline = getUsageHeadlineSection(p)
    return headline ? [{ key: 'headline', ...headline }] : []
  }
  if (p.buckets?.length) {
    // Antigravity pool names vary by account tier; Gemini's experimental pools stay hidden.
    const buckets = p.buckets.filter(
      (bucket) =>
        p.provider === 'antigravity' ||
        STATUS_BAR_BUCKET_NAMES.has(bucket.name) ||
        isCursorUsageBucket(bucket.name)
    )
    if (buckets.length > 0) {
      return buckets.map((bucket) => ({
        key: bucket.name,
        window: bucket,
        label: bucket.name,
        labelFirst: true
      }))
    }
    const fallback = p.session ?? p.monthly ?? p.weekly
    return fallback ? [windowSection('fallback', fallback)] : []
  }
  return [
    p.session ? windowSection('session', p.session) : null,
    p.weekly ? windowSection('weekly', p.weekly) : null,
    p.fableWeekly
      ? {
          key: 'fableWeekly',
          window: p.fableWeekly,
          label: translate('auto.components.status.bar.StatusBar.a79c64f87e', 'Fable')
        }
      : null,
    // Monthly-only providers keep their limit inline; other plans show it in the details.
    p.monthly && !p.session && !p.weekly ? windowSection('monthly', p.monthly) : null
  ].filter((section) => section !== null)
}
