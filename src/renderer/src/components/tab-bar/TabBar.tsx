import React, { useCallback, useMemo } from 'react'
import { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import type { TabBarProps } from './tab-bar-props'
import type { TabBarItem } from './tab-bar-item-model'
import { useTabBarRuntimeModel } from './use-tab-bar-runtime-model'
import { useTabBarCreateMenuController } from './use-tab-bar-create-menu-controller'
import { usePluginNewFileMenuOptions } from './use-plugin-new-file-menu-options'
import { useTabBarItemProjection } from './use-tab-bar-item-projection'
import { renderTabBarSurface } from './tab-bar-surface'
import { useTabBarItemActions } from './use-tab-bar-item-actions'
import { useActiveClientHostedBrowserRowId } from '@/lib/pane-manager/client-hosted-browser-row-state'
import { useEditorGroupFileDropOwner } from '../editor/use-editor-group-file-drop-owner'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import {
  SETTINGS_TAB_ID,
  selectSettingsTabStrip,
  settingsTabInsertIndex
} from '@/lib/settings-tab-placement'
import { resolveTabIndicatorEdges } from '../tab-group/tab-insertion'
import type { DropIndicator } from './drop-indicator'

function TabBarInner(props: TabBarProps): React.JSX.Element {
  const {
    worktreeId,
    groupId,
    terminalOnly = false,
    onNewTerminalTab,
    onNewTerminalWithShell,
    onNewBrowserTab,
    onNewSimulatorTab,
    onNewFileTab,
    onOpenFileTab,
    onPinFile
  } = props
  const runtime = useTabBarRuntimeModel({ worktreeId, groupId })
  const baseCreateMenu = useTabBarCreateMenuController({
    worktreeId,
    resolvedGroupId: runtime.resolvedGroupId,
    showAgentLaunchItems: props.showAgentLaunchItems,
    terminalOnly,
    mobileEmulatorEnabled: runtime.mobileEmulatorEnabled,
    managedBrowserCreationEnabled: runtime.managedBrowserCreationEnabled,
    mobileEmulatorCreationEnabled: runtime.mobileEmulatorCreationEnabled,
    workspaceHasSimulatorTab: runtime.workspaceHasSimulatorTab,
    showWindowsShellMenu: runtime.showWindowsShellMenu,
    projectRuntimeShellMenuMode: runtime.projectRuntimeShellMenuMode,
    defaultWindowsShell: runtime.defaultWindowsShell,
    defaultWindowsPowerShellImplementation: runtime.defaultWindowsPowerShellImplementation,
    agentDetectionTarget: runtime.agentDetectionTarget,
    windowsTerminalCapabilities: runtime.windowsTerminalCapabilities,
    onNewTerminalTab,
    onNewTerminalWithShell,
    onNewBrowserTab,
    onNewSimulatorTab,
    onNewFileTab,
    onOpenFileTab
  })
  const pluginCreateMenu = usePluginNewFileMenuOptions(
    baseCreateMenu.createMenuOptions,
    baseCreateMenu.handleSelectCreateMenuOption,
    runtime.resolvedGroupId
  )
  const createMenu = {
    ...baseCreateMenu,
    createMenuOptions: pluginCreateMenu.menuOptions,
    handleSelectCreateMenuOption: pluginCreateMenu.onSelectMenuOption
  }
  const baseItemProjection = useTabBarItemProjection({
    props,
    resolvedGroupId: runtime.resolvedGroupId,
    unifiedTabs: runtime.unifiedTabs,
    unifiedTabByVisibleId: runtime.unifiedTabByVisibleId,
    generatedTabTitlesEnabled: runtime.generatedTabTitlesEnabled,
    statusByRelativePath: runtime.statusByRelativePath
  })
  const togglePinned = (item: TabBarItem): void => {
    // pinTab/unpinTab mirror the change to the host for remote-server tabs.
    if (item.isPinned) {
      runtime.unpinTab(item.unifiedTabId)
      return
    }
    if (item.type === 'editor' && onPinFile) {
      onPinFile(item.data.id, item.unifiedTabId)
      return
    }
    runtime.pinTab(item.unifiedTabId)
  }
  const itemActions = useTabBarItemActions({
    props,
    togglePinned,
    toggleTabViewMode: runtime.toggleTabViewMode
  })
  // Read here, not just where the rows render: the real tabs have to know when a row took over.
  const activeClientHostedBrowserRowId = useActiveClientHostedBrowserRowId({
    worktreeId,
    groupId: runtime.resolvedGroupId,
    groupActiveTabId: props.groupActiveTabId ?? null
  })
  // Settings is not a layout tab, so the strip slots it in among them here.
  const settingsTab = useAppStore(
    useShallow((state) => selectSettingsTabStrip(state, worktreeId, runtime.resolvedGroupId))
  )
  const realItems = baseItemProjection.orderedItems
  const settingsTabIndex = useMemo(
    () =>
      settingsTab
        ? settingsTabInsertIndex(
            realItems.map((item) => item.unifiedTabId),
            settingsTab.leftTabIds
          )
        : -1,
    [realItems, settingsTab]
  )
  const hoveredTabInsertion =
    props.hoveredTabInsertion?.groupId === runtime.resolvedGroupId
      ? props.hoveredTabInsertion
      : null
  // Why memoized apart: dnd-kit re-renders every tab when the sortable ids change identity.
  const sortableIds = useMemo(() => {
    if (settingsTabIndex < 0) {
      return baseItemProjection.sortableIds
    }
    const ids = [...baseItemProjection.sortableIds]
    ids.splice(settingsTabIndex, 0, SETTINGS_TAB_ID)
    return ids
  }, [baseItemProjection.sortableIds, settingsTabIndex])
  const dropIndicatorByVisibleId = useMemo(() => {
    if (settingsTabIndex < 0) {
      return baseItemProjection.dropIndicatorByVisibleId
    }
    const indicators = new Map<string, DropIndicator>()
    for (const edge of resolveTabIndicatorEdges(sortableIds, hoveredTabInsertion)) {
      indicators.set(edge.visibleTabId, edge.side)
    }
    return indicators
  }, [
    baseItemProjection.dropIndicatorByVisibleId,
    hoveredTabInsertion,
    settingsTabIndex,
    sortableIds
  ])
  const itemProjection = { ...baseItemProjection, sortableIds, dropIndicatorByVisibleId }
  const tabStripNavigation = useTabStripOverflowNavigation({
    activeVisibleTabId: itemProjection.activeVisibleTabId,
    activeDockSlotId: settingsTab?.shown
      ? SETTINGS_TAB_ID
      : (activeClientHostedBrowserRowId ?? itemProjection.activeVisibleTabId),
    layoutKey: [
      itemProjection.tabStripLayoutKey,
      ...(props.clientHostedBrowserRows ?? []).map((row) => row.browserPageId),
      ...(settingsTab ? [`${SETTINGS_TAB_ID}:${settingsTabIndex}:${settingsTab.isPinned}`] : [])
    ].join('|'),
    worktreeId
  })
  const attachFileDropOwner = useEditorGroupFileDropOwner({ worktreeId, groupId })
  const { clearPendingNewTabMenuFocusOnUnmount } = createMenu
  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      clearPendingNewTabMenuFocusOnUnmount(node)
      attachFileDropOwner(node)
    },
    [attachFileDropOwner, clearPendingNewTabMenuFocusOnUnmount]
  )
  const tabStripDragScroll = useTabStripDragScrollHandlers(tabStripNavigation.scrollTabStrip, {
    start: tabStripNavigation.tabStripOverflowState.canScrollStart,
    end: tabStripNavigation.tabStripOverflowState.canScrollEnd
  })

  return renderTabBarSurface({
    props,
    runtime,
    createMenu,
    itemProjection,
    tabStripNavigation,
    tabStripDragScroll,
    activeClientHostedBrowserRowId,
    settingsTab,
    settingsTabIndex,
    itemActions,
    surfaceRef
  })
}

export default React.memo(TabBarInner)
