import { useCallback, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { Pin, PinOff, Settings, X } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { requestSettingsClose } from '@/lib/settings-close-request'
import { SETTINGS_TAB_ID } from '@/lib/settings-tab-placement'
import { useAppStore } from '../../store'
import type { TabDragItemData } from '../tab-group/useTabDragSplit'
import {
  getDropIndicatorClasses,
  getTabRootStateClasses,
  getTabStripBorderClasses,
  type DropIndicator
} from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { useTabContextMenuOpening } from './tab-context-menu-opening'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'
import { useSortableTabContextMenu } from './use-sortable-tab-context-menu'
import { useTabStripSlotProps } from './use-tab-strip-slot-props'

/** Settings is a tab of this window only, so it draws itself; it still drags, pins and closes like the layout tabs beside it. */
export default function SettingsStripTab({
  worktreeId,
  groupId,
  isActive,
  isPinned,
  hasOtherTabs,
  dropIndicator,
  includeTopTabBorder,
  onCloseOthers
}: {
  worktreeId: string
  groupId: string
  isActive: boolean
  isPinned: boolean
  hasOtherTabs: boolean
  dropIndicator: DropIndicator
  includeTopTabBorder: boolean
  onCloseOthers: () => void
}): React.JSX.Element {
  const label = translate('auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998', 'Settings')
  const dragData: TabDragItemData = {
    kind: 'tab',
    worktreeId,
    groupId,
    unifiedTabId: SETTINGS_TAB_ID,
    visibleTabId: SETTINGS_TAB_ID,
    tabType: 'settings',
    label
  }
  // Why: no transform or transition, so tabs stay anchored during a drag and only the insertion bar moves.
  const { attributes, listeners, setNodeRef } = useSortable({ id: SETTINGS_TAB_ID, data: dragData })
  const showSettingsTab = useAppStore((state) => state.showSettingsTab)
  const setSettingsTabPinned = useAppStore((state) => state.setSettingsTabPinned)
  const closeShortcut = useOptionalShortcutLabel('tab.close')
  const { open: menuOpen, onOpenChange: setMenuOpen } = useSortableTabContextMenu()
  const handleActivate = useCallback(
    () => showSettingsTab(worktreeId),
    [showSettingsTab, worktreeId]
  )
  // Why: activation waits for pointer-up so a drag does not switch tabs mid-gesture.
  const { onPointerDown, retirePendingActivation } = useTabStripPointerActivation({
    onActivate: handleActivate
  })
  const handleMenuOpenChange = useTabContextMenuOpening(setMenuOpen, retirePendingActivation)
  const slotProps = useTabStripSlotProps(SETTINGS_TAB_ID, isActive)

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [setMenuOpen])

  return (
    <ContextMenu open={menuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
      <ContextMenuTrigger asChild>
        <div
          {...slotProps}
          onContextMenu={() => {
            window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
            handleMenuOpenChange(true)
          }}
        >
          <div
            ref={setNodeRef}
            data-settings-strip-tab=""
            data-pinned={isPinned ? 'true' : 'false'}
            data-active={isActive ? 'true' : 'false'}
            {...attributes}
            {...listeners}
            className={`w-full group relative flex h-full cursor-pointer select-none items-center px-1.5 text-xs outline-none focus:outline-none focus-visible:outline-none ${getTabStripBorderClasses(false, { includeTopBorder: includeTopTabBorder })} ${getDropIndicatorClasses(dropIndicator)} ${getTabRootStateClasses(isActive)}`}
            onPointerDown={(event) =>
              onPointerDown(event, (dragEvent) => listeners?.onPointerDown?.(dragEvent))
            }
            // Why: block middle-click auto-scroll; closing waits for auxclick, as on the tabs beside it.
            onMouseDown={preventMiddleButtonDefault}
            onMouseUp={preventMiddleButtonDefault}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault()
                event.stopPropagation()
                if (!isPinned) {
                  requestSettingsClose()
                }
              }
            }}
          >
            <Settings className="mr-1 size-3 shrink-0" aria-hidden />
            {isPinned ? (
              <Pin className="mr-1 size-3 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            <span className={`${TAB_LABEL_WIDTH_CLASSES} mr-1`}>{label}</span>
            {isPinned ? null : (
              <button
                type="button"
                aria-label={translate(
                  'auto.components.tab.bar.SortableTab.95db5f2f7d',
                  'Close tab'
                )}
                className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${
                  isActive
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    : 'text-transparent group-hover:text-muted-foreground hover:!bg-muted hover:!text-foreground'
                }`}
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    event.stopPropagation()
                  }
                }}
                onMouseDown={(event) => {
                  if (event.button === 0) {
                    event.stopPropagation()
                  }
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  requestSettingsClose()
                }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        animation="none"
        className="min-w-[13rem] max-w-[calc(100vw-1rem)] whitespace-nowrap"
      >
        <ContextMenuItem onSelect={() => setSettingsTabPinned(worktreeId, !isPinned)}>
          {isPinned ? (
            <PinOff className="size-3.5 shrink-0" />
          ) : (
            <Pin className="size-3.5 shrink-0" />
          )}
          {isPinned
            ? translate('auto.components.tab.bar.SortableTabContextMenu.417722e9c2', 'Unpin Tab')
            : translate('auto.components.tab.bar.SortableTabContextMenu.60f958ec75', 'Pin Tab')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => !isPinned && requestSettingsClose()} disabled={isPinned}>
          <X className="size-3.5" />
          {translate('auto.components.tab.bar.SortableTabContextMenu.89359a36f7', 'Close')}
          {closeShortcut ? <ContextMenuShortcut>{closeShortcut}</ContextMenuShortcut> : null}
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={onCloseOthers} disabled={!hasOtherTabs}>
          {translate('auto.components.tab.bar.SortableTabContextMenu.8d16f9cd30', 'Close Others')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
