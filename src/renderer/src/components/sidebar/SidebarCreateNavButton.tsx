import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'

/** Opens the Create dialog: a new workspace, or a project first when there is none. */
export function SidebarCreateNavButton(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const hasProjects = useAppStore((s) => s.repos.length > 0)
  const shortcutCombos = useShortcutKeyComboDetails('workspace.create')

  return (
    <button
      type="button"
      onClick={() =>
        hasProjects
          ? openModal('new-workspace-composer', { telemetrySource: 'sidebar' })
          : openModal('add-repo')
      }
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight text-worktree-sidebar-foreground/60 transition-colors hover:bg-worktree-sidebar-foreground/8"
    >
      <Plus className="size-4 shrink-0 text-worktree-sidebar-foreground/30" strokeWidth={1.75} />
      <span className="flex-1">
        {translate('auto.components.sidebar.SidebarNav.create', 'Create')}
      </span>
      <span className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {shortcutCombos.map((combo) => (
          <ShortcutKeyCombo
            key={combo.keys.join('-')}
            keys={combo.keys}
            doubleTap={combo.doubleTap}
            className="inline-flex gap-0.5"
            keyCapClassName="min-w-4 border-worktree-sidebar-border/80 bg-worktree-sidebar-foreground/8 px-1 py-px text-[9px] text-worktree-sidebar-foreground/55 shadow-none"
            separatorClassName="text-[9px] text-worktree-sidebar-foreground/45"
          />
        ))}
      </span>
    </button>
  )
}
