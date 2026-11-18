import React, { useCallback, useMemo, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { revealCompactAgentCard } from '../../worktree-list/navigation/worktree-sidebar-reveal'
import {
  selectSummaryGroupIconAgents,
  summarizeAgentIdentities,
  summarizeAgents
} from './worktree-card-agent-summary'
import { useWorktreeAgentExpansionState } from './worktree-card-agents-expansion-state'
import { suppressWorktreeListScrollAdjustment } from './WorktreeCardAgents'

const MAX_AGENT_ICONS = 3

function stopPropagation(e: React.SyntheticEvent): void {
  e.stopPropagation()
}

function stopActivationKeyPropagation(e: React.KeyboardEvent): void {
  // Keep Enter/Space on the toggle instead of activating the surrounding workspace row.
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation()
  }
}

/** The workspace's chats, folded into its title row: one icon per agent, a count, and a disclosure for the list. */
export function WorktreeCardChatsToggle({
  worktreeId,
  agents
}: {
  worktreeId: string
  agents: DashboardAgentRowData[]
}): React.JSX.Element | null {
  const { compactRootListExpanded: open, toggleCompactRootList } =
    useWorktreeAgentExpansionState(worktreeId)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // Subagents fold under their parent chat, so only top-level chats are counted.
  const chats = useMemo(() => buildAgentRowLineageTree(agents).rootRows, [agents])
  const iconAgents = useMemo(() => selectSummaryGroupIconAgents(chats, MAX_AGENT_ICONS), [chats])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      suppressWorktreeListScrollAdjustment()
      const opening = !open
      toggleCompactRootList()
      if (opening) {
        // Wait for the list to lay out so the reveal accounts for its height.
        requestAnimationFrame(() => revealCompactAgentCard(buttonRef.current))
      }
    },
    [open, toggleCompactRootList]
  )

  if (chats.length === 0) {
    return null
  }
  const subjectLabel = translate('sidebar.agentSummary.agentCount', '{{count}} agents', {
    count: chats.length,
    defaultValue_one: '{{count}} agent'
  })
  const summary = summarizeAgents(chats, subjectLabel)
  const label = open
    ? translate(
        'auto.components.sidebar.worktree.card.compact.agents.0c1debfe84',
        'Collapse {{value0}}',
        {
          value0: subjectLabel
        }
      )
    : translate(
        'auto.components.sidebar.worktree.card.compact.agents.289a1d2ca7',
        'Expand {{value0}}. {{value1}}',
        { value0: summary, value1: summarizeAgentIdentities(chats) }
      )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          draggable={false}
          data-worktree-chats-toggle=""
          aria-expanded={open}
          aria-label={label}
          className={cn(
            'ml-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-sm pl-1 pr-0.5 text-2xs leading-none tabular-nums text-muted-foreground',
            'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
            // The sidebar accent reverses brightness across themes; use the matching hover token mix.
            'hover:bg-worktree-sidebar-accent/55 hover:text-foreground dark:hover:bg-worktree-sidebar-foreground/[0.06]',
            open && 'text-foreground'
          )}
          onClick={handleClick}
          onKeyDown={stopActivationKeyPropagation}
          onMouseDown={stopPropagation}
          onPointerDown={stopPropagation}
          onDoubleClick={stopPropagation}
          onDragStart={stopPropagation}
        >
          <span className="inline-flex items-center gap-0.5" aria-hidden>
            {iconAgents.map((agent) => (
              <AgentTypeIcon key={agent.paneKey} agentType={agent.agentType} size={12} />
            ))}
          </span>
          <span aria-hidden>{chats.length}</span>
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none',
              open && 'rotate-90'
            )}
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {summary}
      </TooltipContent>
    </Tooltip>
  )
}
