import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { useAgentPaneThreads } from '@/components/activity/use-agent-pane-threads'
import { useActivityThreadActionBindings } from '@/components/activity/use-activity-thread-action-bindings'
import {
  activityThreadRowCopy,
  activityThreadStatusId
} from '@/components/activity/activity-thread-presentation'
import { SidebarNeedsYouList, type SidebarNeedsYouItem } from './SidebarNeedsYouList'

const MAX_ROWS = 3

const ignoreSelection = (): void => {}

export default function SidebarNeedsYouSection(): React.JSX.Element | null {
  useTranslation()
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const { storeData, visibleThreads, markAllReadThreads } = useAgentPaneThreads({
    query: '',
    readFilter: 'all',
    groupBy: 'none',
    selectedPaneKey: null,
    showChildAgents: true
  })
  const { selectThread } = useActivityThreadActionBindings({
    visibleThreads,
    markAllReadThreads,
    acknowledgeAgents: storeData.acknowledgeAgents,
    unacknowledgeAgents: storeData.unacknowledgeAgents,
    setSelectedPaneKey: ignoreSelection
  })
  const waiting = useMemo(
    () =>
      visibleThreads
        .map((thread) => ({ thread, copy: activityThreadRowCopy(thread) }))
        .filter(({ copy }) => copy.needsAttention),
    [visibleThreads]
  )
  const now = useNow(60_000, waiting.length > 0)
  const items = useMemo<SidebarNeedsYouItem[]>(
    () =>
      waiting.slice(0, MAX_ROWS).map(({ thread, copy }) => ({
        key: thread.paneKey,
        state: activityThreadStatusId(thread),
        title: copy.taskTitle,
        detail: [copy.workspaceLabel === copy.taskTitle ? '' : copy.workspaceLabel, copy.statusLine]
          .filter(Boolean)
          .join(' · '),
        age: formatShortTimeAgo(thread.latestTimestamp, now)
      })),
    [waiting, now]
  )
  const handleSelect = useCallback(
    (paneKey: string) => {
      const match = waiting.find(({ thread }) => thread.paneKey === paneKey)
      if (match) {
        selectThread(match.thread)
      }
    },
    [waiting, selectThread]
  )
  const handleViewAll = useCallback(() => setSidebarBody?.('agents'), [setSidebarBody])

  if (items.length === 0) {
    return null
  }
  return (
    <SidebarNeedsYouList
      items={items}
      hiddenCount={waiting.length - items.length}
      onSelect={handleSelect}
      onViewAll={handleViewAll}
    />
  )
}
