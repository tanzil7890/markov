import { PanelsTopLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FloatingTerminalIconContextMenu } from '@/components/floating-terminal/FloatingTerminalIconContextMenu'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { selectFloatingWorkspaceHasUnread } from '@/store/selectors'
import { useShortcutLabel } from '../hooks/useShortcutLabel'
import { useAppStore } from '../store'

/** True when the floating workspace's toggle belongs in the window's top bar. */
export function useFloatingWorkspaceTopBarToggle(): boolean {
  return useAppStore(
    (s) =>
      s.settings?.floatingTerminalEnabled === true &&
      (s.settings.floatingTerminalTriggerLocation ?? 'top-bar') === 'top-bar'
  )
}

export function FloatingWorkspaceTopBarToggle(): React.JSX.Element | null {
  const shown = useFloatingWorkspaceTopBarToggle()
  const open = useAppStore((s) => s.floatingWorkspacePanelOpen)
  const hasUnread = useAppStore(selectFloatingWorkspaceHasUnread)
  const shortcutLabel = useShortcutLabel('floatingTerminal.toggle')
  if (!shown) {
    return null
  }
  const showAttentionDot = !open && hasUnread
  const label = open
    ? translate(
        'auto.components.floating.terminal.FloatingTerminalToggleButton.5785dd9148',
        'Minimize floating workspace'
      )
    : showAttentionDot
      ? translate(
          'auto.components.floating.terminal.FloatingTerminalToggleButton.4cb418b991',
          'Show floating workspace, new activity'
        )
      : translate(
          'auto.components.floating.terminal.FloatingTerminalToggleButton.3b04b065b5',
          'Show floating workspace'
        )
  return (
    <FloatingTerminalIconContextMenu currentLocation="top-bar" className="relative flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="sidebar-toggle relative"
            aria-label={label}
            aria-pressed={open}
            onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))}
          >
            <PanelsTopLeft size={16} />
            {showAttentionDot ? (
              <span
                aria-hidden
                data-floating-terminal-attention
                className="pointer-events-none absolute right-1 top-0.5 size-1.5 rounded-full bg-status-warning"
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label} ({shortcutLabel})
        </TooltipContent>
      </Tooltip>
    </FloatingTerminalIconContextMenu>
  )
}
