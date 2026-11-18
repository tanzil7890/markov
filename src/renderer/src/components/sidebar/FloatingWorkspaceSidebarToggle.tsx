import { PanelsTopLeft } from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FloatingTerminalIconContextMenu } from '@/components/floating-terminal/FloatingTerminalIconContextMenu'
import {
  floatingWorkspaceToggleLabel,
  useFloatingWorkspaceToggleAt
} from '@/app-shell/FloatingWorkspaceTopBarToggle'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { useAppStore } from '@/store'
import { selectFloatingWorkspaceHasUnread } from '@/store/selectors'

export function FloatingWorkspaceSidebarToggle(): React.JSX.Element | null {
  const shown = useFloatingWorkspaceToggleAt('sidebar')
  const open = useAppStore((s) => s.floatingWorkspacePanelOpen)
  const hasUnread = useAppStore(selectFloatingWorkspaceHasUnread)
  const shortcutLabel = useShortcutLabel('floatingTerminal.toggle')
  if (!shown) {
    return null
  }
  const showAttentionDot = !open && hasUnread
  const label = floatingWorkspaceToggleLabel(open, showAttentionDot)
  return (
    // Ghost buttons inherit text color; mute it here to match the neighboring footer actions.
    <FloatingTerminalIconContextMenu
      currentLocation="sidebar"
      className="relative flex text-muted-foreground"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={label}
            aria-pressed={open}
            onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))}
            className="relative"
          >
            <PanelsTopLeft className="size-3.5" />
            {showAttentionDot ? (
              <span
                aria-hidden
                data-floating-terminal-attention
                className="pointer-events-none absolute right-0.5 top-0.5 size-1.5 rounded-full bg-status-warning"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label} ({shortcutLabel})
        </TooltipContent>
      </Tooltip>
    </FloatingTerminalIconContextMenu>
  )
}
