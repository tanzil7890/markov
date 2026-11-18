import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Play, Plus, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useWorkspaceQuickCommands } from '@/hooks/use-workspace-quick-commands'
import { closeTerminalTab } from '@/components/terminal/terminal-tab-actions'
import {
  computeTabStripOverflowState,
  getTabStripScrollMaskClassName,
  sameTabStripOverflowState,
  type TabStripOverflowState
} from '@/components/tab-bar/tab-strip-scroll-metrics'
import { preventMiddleButtonDefault } from '@/components/tab-bar/middle-button-default-guard'
import type { Tab } from '../../../../../shared/tab-types'
import { activateSidebarTerminal, createSidebarTerminal } from './sidebar-terminal-tabs'
import { sidebarTerminalTabLabel, useSidebarTerminalTabs } from './use-sidebar-terminal-tabs'
import { useRightSidebarBottomPanel } from './right-sidebar-bottom-panel-state'

const TAB_CLASS = 'flex h-6 shrink-0 items-center rounded-md text-xs transition-colors'
const SELECTED_CLASS = 'bg-accent text-foreground'
const IDLE_CLASS = 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
const ICON_BUTTON_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const NO_OVERFLOW: TabStripOverflowState = {
  hasOverflow: false,
  canScrollStart: false,
  canScrollEnd: false
}

function CommandCount({ worktreeId }: { worktreeId: string }): React.JSX.Element | null {
  const { repoCommands, globalCommands } = useWorkspaceQuickCommands(worktreeId)
  const count = repoCommands.length + globalCommands.length
  return count > 0 ? (
    <span className="font-mono text-3xs text-muted-foreground tabular-nums">{count}</span>
  ) : null
}

/** Which ends of the terminal row have tabs scrolled out of view; the wheel scrolls it sideways. */
function useScrollOverflow(
  ref: React.RefObject<HTMLDivElement | null>,
  tabs: readonly Tab[]
): TabStripOverflowState {
  const [overflow, setOverflow] = useState(NO_OVERFLOW)
  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const update = (): void => {
      const next = computeTabStripOverflowState(el)
      setOverflow((previous) => (sameTabStripOverflowState(previous, next) ? previous : next))
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      resizeObserver.disconnect()
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])
  // A full row keeps its width as tabs come and go, so the observer alone misses them.
  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      const next = computeTabStripOverflowState(el)
      setOverflow((previous) => (sameTabStripOverflowState(previous, next) ? previous : next))
    }
  }, [ref, tabs])
  return overflow
}

function SidebarTerminalTab({
  worktreeId,
  tab,
  selected
}: {
  worktreeId: string
  tab: Tab
  selected: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null)
  const label = sidebarTerminalTabLabel(tab)
  const close = (): void =>
    closeTerminalTab(tab.entityId, { reason: 'user', preserveWorktreeSelection: true })

  // Terminals past the sidebar's width scroll; bring the one on screen into view.
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [selected])

  return (
    <span
      ref={ref}
      className={cn(TAB_CLASS, 'max-w-[140px] scroll-mx-6', selected ? SELECTED_CLASS : IDLE_CLASS)}
      // Middle click closes, as in the main tab bar.
      onMouseDown={preventMiddleButtonDefault}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          close()
        }
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => {
          useRightSidebarBottomPanel.getState().setView('terminal')
          activateSidebarTerminal(worktreeId, tab.id)
        }}
        title={label}
        className="min-w-0 truncate py-0.5 pl-2 pr-0.5 focus-visible:outline-none"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={close}
        aria-label={translate('auto.components.right.sidebar.terminal.close', 'Close {{value0}}', {
          value0: label
        })}
        className="mr-0.5 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-border hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

/** The lower half's one header row: Commands always first, the workspace's terminals, +, and the fold arrow. */
export function SidebarBottomTabStrip({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const view = useRightSidebarBottomPanel((s) => s.view)
  const folded = useRightSidebarBottomPanel((s) => s.folded)
  const setView = useRightSidebarBottomPanel((s) => s.setView)
  const setFolded = useRightSidebarBottomPanel((s) => s.setFolded)
  const { tabs, activeTab } = useSidebarTerminalTabs(worktreeId)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const overflow = useScrollOverflow(scrollRef, tabs)
  const commandsShown = !folded && view === 'commands'
  const terminalShown = !folded && view === 'terminal'
  const newTerminalLabel = translate('auto.components.right.sidebar.terminal.new', 'New terminal')
  const foldLabel = folded
    ? translate('auto.components.right.sidebar.bottomPanel.open', 'Open the bottom half')
    : translate('auto.components.right.sidebar.bottomPanel.fold', 'Fold the bottom half')

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      <div
        role="tablist"
        aria-label={translate(
          'auto.components.right.sidebar.bottomPanel.tabs',
          'Commands and terminals'
        )}
        className="flex min-w-0 items-center"
      >
        <button
          type="button"
          role="tab"
          aria-selected={commandsShown}
          onClick={() => setView('commands')}
          className={cn(
            TAB_CLASS,
            'gap-1 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            commandsShown ? SELECTED_CLASS : IDLE_CLASS
          )}
        >
          <Play className="size-3" />
          {translate('auto.components.right.sidebar.bottomPanel.commands', 'Commands')}
          <CommandCount worktreeId={worktreeId} />
        </button>
        {tabs.length > 0 ? (
          <span aria-hidden className="mx-1 h-3.5 w-px shrink-0 bg-border" />
        ) : null}
        <div
          ref={scrollRef}
          className={cn(
            'scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto',
            getTabStripScrollMaskClassName(overflow)
          )}
        >
          {tabs.map((tab) => (
            <SidebarTerminalTab
              key={tab.id}
              worktreeId={worktreeId}
              tab={tab}
              selected={terminalShown && tab.id === activeTab?.id}
            />
          ))}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              setView('terminal')
              createSidebarTerminal(worktreeId)
            }}
            aria-label={newTerminalLabel}
            className={ICON_BUTTON_CLASS}
          >
            <Plus className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {newTerminalLabel}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setFolded(!folded)}
            aria-label={foldLabel}
            aria-expanded={!folded}
            className={cn(ICON_BUTTON_CLASS, 'ml-auto')}
          >
            {folded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {foldLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
