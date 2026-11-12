import React from 'react'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'

export type SidebarNeedsYouItem = {
  key: string
  state: AgentDotState
  title: string
  detail: string
  age: string
}

export function SidebarNeedsYouList({
  items,
  hiddenCount,
  onSelect,
  onViewAll
}: {
  items: readonly SidebarNeedsYouItem[]
  hiddenCount: number
  onSelect: (key: string) => void
  onViewAll: () => void
}): React.JSX.Element {
  const label = translate('dashboardPopout.bucket.attention', 'Needs You')
  return (
    <section aria-label={label} className="shrink-0 px-2 pt-2" data-sidebar-needs-you="">
      <div className="flex h-6 items-center gap-1.5 px-2">
        <span className="select-none text-2xs font-semibold uppercase tracking-wider text-agent-question-text">
          {label}
        </span>
        <span className="text-2xs tabular-nums text-agent-question-text">
          {items.length + hiddenCount}
        </span>
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-worktree-sidebar-foreground/8"
        >
          <span className="flex h-5 shrink-0 items-center">
            <AgentStateDot state={item.state} size="sm" title={null} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-worktree-sidebar-foreground">
                {item.title}
              </span>
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {item.age}
              </span>
            </span>
            {item.detail ? (
              <span className="block truncate text-2xs text-muted-foreground">{item.detail}</span>
            ) : null}
          </span>
        </button>
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onViewAll}
          className="w-full rounded-md px-2 py-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground"
        >
          {translate('auto.components.sidebar.SidebarNeedsYou.more', '{{count}} more', {
            count: hiddenCount
          })}
        </button>
      ) : null}
    </section>
  )
}
