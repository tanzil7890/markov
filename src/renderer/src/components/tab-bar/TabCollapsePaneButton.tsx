import { Minimize2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function TabCollapsePaneButton({
  isActive,
  onCollapse
}: {
  isActive: boolean
  onCollapse: () => void
}): React.JSX.Element {
  const label = translate('auto.components.tab.bar.SortableTab.fdb2691425', 'Collapse pane')
  return (
    <button
      className={`mr-1 flex items-center justify-center w-4 h-4 rounded-sm shrink-0 ${
        isActive
          ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
          : 'text-transparent group-hover:text-muted-foreground hover:!text-foreground hover:!bg-muted'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onCollapse()
      }}
      title={label}
      aria-label={label}
    >
      <Minimize2 className="w-3 h-3" />
    </button>
  )
}
