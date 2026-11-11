import { MessageSquare, SquareTerminal } from 'lucide-react'
import { translate } from '@/i18n/i18n'

type TabViewModeToggleButtonProps = {
  isActive: boolean
  isChatView: boolean
  onToggle: () => void
  onActivate: () => void
}

/** Flips an agent tab between its terminal and Chat UI views; the context menu and shortcut do the same. */
export function TabViewModeToggleButton({
  isActive,
  isChatView,
  onToggle,
  onActivate
}: TabViewModeToggleButtonProps): React.JSX.Element {
  const label = isChatView
    ? translate(
        'components.tab.bar.SortableTabContextMenu.switchToTerminalView',
        'Continue with Terminal Agent'
      )
    : translate('components.tab.bar.SortableTabContextMenu.switchToChatView', 'Continue in Chat UI')
  const Icon = isChatView ? SquareTerminal : MessageSquare
  return (
    <button
      type="button"
      data-tab-view-toggle={isChatView ? 'chat' : 'terminal'}
      className={`relative z-10 mr-0.5 flex items-center justify-center w-4 h-4 rounded-sm shrink-0 ${
        isActive
          ? 'text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:text-foreground focus-visible:bg-muted'
          : 'text-transparent group-hover:text-muted-foreground hover:!text-foreground hover:!bg-muted focus-visible:!text-foreground focus-visible:!bg-muted'
      }`}
      title={label}
      aria-label={label}
      // Why: stop the tab's drag and deferred activation from claiming this press.
      onPointerDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation()
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation()
        }
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
        if (!isActive) {
          onActivate()
        }
      }}
    >
      <Icon className="w-3 h-3" />
    </button>
  )
}
