import React from 'react'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { useAgentBucketCounts } from '@/components/dashboard/useAgentBucketCounts'

const SidebarNeedsYouSection = lazyWithRetry(() => import('./SidebarNeedsYouSection'))

// Why: the thread projection only runs while an agent is waiting on the user.
export function SidebarNeedsYouGate(): React.JSX.Element | null {
  const counts = useAgentBucketCounts()
  if (counts.attention === 0) {
    return null
  }
  return (
    <React.Suspense fallback={null}>
      <SidebarNeedsYouSection />
    </React.Suspense>
  )
}
