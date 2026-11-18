import React from 'react'
import { SortableContext } from '@dnd-kit/sortable'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProjectedAgentMenuItems } from './QuickLaunchButton'
import { TabBarAgentPickerEntry } from './TabBarAgentPickerEntry'
import { TabStripScrollIndicator } from './TabStripScrollIndicator'
import { TabStripTooltipProvider } from './TabStripTooltipProvider'
import { getTabStripScrollMaskClassName } from './tab-strip-scroll-metrics'
import type { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import type { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import type { TabBarProps } from './tab-bar-props'
import type { TabBarRuntimeModel } from './use-tab-bar-runtime-model'
import type { TabBarCreateMenuController } from './use-tab-bar-create-menu-controller'
import type { TabBarItemProjection } from './use-tab-bar-item-projection'
import type { TabBarItemActions } from './use-tab-bar-item-actions'
import { renderTabBarItems } from './tab-bar-item-surface'
import { TabBarStaticCreateMenu } from './tab-bar-static-create-menu'
import ClientHostedBrowserTabRows from './ClientHostedBrowserTabRows'
import SettingsStripTab from './SettingsStripTab'
import { SETTINGS_TAB_ID, type SettingsTabStrip } from '@/lib/settings-tab-placement'
import type { ClientHostedBrowserRow } from '../../../../shared/client-hosted-browser-rows'
import { advanceAgentSessionsTourPastNewTab } from '@/components/contextual-tours/agent-sessions-tour-new-tab'
import { openNewChatFromTabBar } from './tab-bar-new-chat'

const EMPTY_CLIENT_HOSTED_ROWS: readonly ClientHostedBrowserRow[] = []
const CREATE_BUTTON_CLASS =
  'flex h-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent/50 hover:text-foreground'

export function renderTabBarSurface({
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
}: {
  props: TabBarProps
  runtime: TabBarRuntimeModel
  createMenu: TabBarCreateMenuController
  itemProjection: TabBarItemProjection
  tabStripNavigation: ReturnType<typeof useTabStripOverflowNavigation>
  tabStripDragScroll: ReturnType<typeof useTabStripDragScrollHandlers>
  activeClientHostedBrowserRowId: string | null
  settingsTab: SettingsTabStrip | null
  settingsTabIndex: number
  itemActions: TabBarItemActions
  surfaceRef: (node: HTMLDivElement | null) => void
}): React.JSX.Element {
  const {
    worktreeId,
    terminalOnly = false,
    showAgentLaunchItems = true,
    onNewTerminalTab,
    onOpenEntry,
    tabStripChrome = 'default'
  } = props
  const {
    resolvedGroupId,
    mobileEmulatorEnabled,
    managedBrowserCreationEnabled,
    mobileEmulatorCreationEnabled,
    workspaceHasSimulatorTab,
    showMobileEmulatorIntroCallout,
    windowsTerminalCapabilities,
    defaultWindowsPowerShellImplementation,
    newTerminalShortcut,
    newBrowserShortcut,
    newSimulatorShortcut,
    newFileShortcut,
    openMarkdownShortcut
  } = runtime
  const {
    agentMenu,
    agentPickerInventory,
    selectPickerAgent,
    launchAgentRow,
    newTabMenuOpen,
    setNewTabMenuOpen,
    setCreateMenuQuery,
    createMenuOptions,
    windowsShellEntries,
    handleSelectCreateMenuOption,
    launchAgentFromNewTabEntry,
    runPendingNewTabMenuFocusAfterClose,
    queueNewActiveTerminalFocusAfterNewTabMenuClose,
    queueFocusAfterNewTabMenuClose,
    showStaticCreateMenuItems
  } = createMenu
  const { orderedItems, sortableIds, dropIndicatorByVisibleId } = itemProjection
  const clientHostedBrowserRows = props.clientHostedBrowserRows ?? EMPTY_CLIENT_HOSTED_ROWS
  const {
    tabStripRef,
    tabStripOverflowState,
    activeTabDockSide,
    scrollTabStrip,
    subscribeToStripResize
  } = tabStripNavigation
  const singleTab =
    orderedItems.length + clientHostedBrowserRows.length + (settingsTab ? 1 : 0) === 1
  const includeTopTabBorder = tabStripChrome !== 'floating-panel'
  // Why: "+" opens a chat at once where chats can start; the arrow keeps every other kind of tab.
  const plusOpensChat = !terminalOnly && showAgentLaunchItems
  const newTabLabel = plusOpensChat
    ? translate('components.tab-bar.moreTabKinds', 'New terminal, browser or other tab')
    : translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')
  const newChatLabel = translate('components.tab-bar.newChat', 'New chat')
  const renderedItems = renderTabBarItems({
    items: orderedItems,
    props,
    runtime,
    actions: itemActions,
    dropIndicatorByVisibleId,
    includeTopTabBorder,
    activeClientHostedBrowserRowId,
    settingsTabShown: settingsTab?.shown === true
  })
  if (settingsTab) {
    renderedItems.splice(
      settingsTabIndex,
      0,
      <SettingsStripTab
        key={SETTINGS_TAB_ID}
        worktreeId={worktreeId}
        groupId={resolvedGroupId}
        isActive={settingsTab.shown}
        isPinned={settingsTab.isPinned}
        hasOtherTabs={orderedItems.length > 0}
        dropIndicator={dropIndicatorByVisibleId.get(SETTINGS_TAB_ID) ?? null}
        includeTopTabBorder={includeTopTabBorder}
        onCloseOthers={() => props.onCloseOthers(SETTINGS_TAB_ID)}
      />
    )
  }

  return (
    <div ref={surfaceRef} className="flex items-stretch h-full overflow-hidden flex-1 min-w-0">
      {tabStripOverflowState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="mx-0.5 my-auto h-6 w-5 @max-[260px]/tab-strip:hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              aria-label={translate(
                'auto.components.tab.bar.TabBar.7a9b4af2af',
                'Scroll tabs left'
              )}
              aria-disabled={!tabStripOverflowState.canScrollStart}
              disabled={
                !tabStripDragScroll.isTabDragActive && !tabStripOverflowState.canScrollStart
              }
              onClick={() => scrollTabStrip('start')}
              onPointerEnter={tabStripDragScroll.onDragScrollStartEnter}
              onPointerLeave={tabStripDragScroll.onDragScrollLeave}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.tab.bar.TabBar.7a9b4af2af', 'Scroll tabs left')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {/* Keep drag siblings anchored; only the insertion bar moves. */}
      <SortableContext items={sortableIds}>
        {/* Why: no-drag lets tab interactions work inside the titlebar's drag region (outer container stays window-draggable). */}
        <div
          data-single-tab={singleTab ? '' : undefined}
          className="group/tab-strip relative flex min-h-0 w-max min-w-0 max-w-full shrink"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div
            ref={tabStripRef}
            data-active-tab-docked={activeTabDockSide ?? undefined}
            className={[
              'terminal-tab-strip flex h-full min-w-0 max-w-full flex-1 items-stretch overflow-x-auto overflow-y-hidden',
              getTabStripScrollMaskClassName(tabStripOverflowState, activeTabDockSide)
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <TabStripTooltipProvider>
              {renderedItems}
              {clientHostedBrowserRows.length > 0 ? (
                <ClientHostedBrowserTabRows
                  rows={clientHostedBrowserRows}
                  worktreeId={worktreeId}
                  groupId={resolvedGroupId}
                  groupActiveTabId={props.groupActiveTabId ?? null}
                  includeTopTabBorder={includeTopTabBorder}
                />
              ) : null}
            </TabStripTooltipProvider>
          </div>
          <TabStripScrollIndicator
            hasOverflow={tabStripOverflowState.hasOverflow}
            scrollContainerRef={tabStripRef}
            subscribeToStripResize={subscribeToStripResize}
            disabled={tabStripDragScroll.isTabDragActive}
          />
        </div>
      </SortableContext>
      {tabStripOverflowState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="mx-0.5 my-auto h-6 w-5 @max-[260px]/tab-strip:hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              aria-label={translate(
                'auto.components.tab.bar.TabBar.232e075b07',
                'Scroll tabs right'
              )}
              aria-disabled={!tabStripOverflowState.canScrollEnd}
              disabled={!tabStripDragScroll.isTabDragActive && !tabStripOverflowState.canScrollEnd}
              onClick={() => scrollTabStrip('end')}
              onPointerEnter={tabStripDragScroll.onDragScrollEndEnter}
              onPointerLeave={tabStripDragScroll.onDragScrollLeave}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.tab.bar.TabBar.232e075b07', 'Scroll tabs right')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <div
        className="my-auto ml-2 flex shrink-0 items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        data-contextual-tour-target="tab-create-menu"
        data-state={newTabMenuOpen ? 'open' : 'closed'}
      >
        {plusOpensChat ? (
          <button
            className={`${CREATE_BUTTON_CLASS} w-7 rounded-l-md`}
            title={newChatLabel}
            aria-label={newChatLabel}
            onClick={() => {
              advanceAgentSessionsTourPastNewTab()
              openNewChatFromTabBar({
                worktreeId,
                groupId: resolvedGroupId,
                onUnavailable: () => setNewTabMenuOpen(true)
              })
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <DropdownMenu
          open={newTabMenuOpen}
          onOpenChange={setNewTabMenuOpen}
          // Why: modal would disable body pointer events, making the Mobile Emulator "Hide" re-enable toast unclickable.
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <button
              className={`${CREATE_BUTTON_CLASS} ${plusOpensChat ? 'w-4 rounded-r-md' : 'w-7 rounded-md'}`}
              title={newTabLabel}
              aria-label={newTabLabel}
            >
              {plusOpensChat ? (
                <ChevronDown className="size-3" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-72 max-w-[calc(100vw-1rem)] rounded-[11px] border-border/80 p-1 shadow-[0_16px_36px_rgba(0,0,0,0.24)]"
            onCloseAutoFocus={(event) => {
              // Why: Radix restores focus to the "+" trigger on close, stealing it from the freshly-mounted terminal.
              event.preventDefault()
              runPendingNewTabMenuFocusAfterClose()
              advanceAgentSessionsTourPastNewTab()
            }}
          >
            {!terminalOnly && onOpenEntry ? (
              <>
                <TabBarAgentPickerEntry
                  inventory={agentPickerInventory}
                  worktreeId={worktreeId}
                  groupId={resolvedGroupId}
                  menuOpen={newTabMenuOpen}
                  menuOptions={createMenuOptions}
                  onLaunchAgentOption={launchAgentFromNewTabEntry}
                  onOpenDefaultTerminal={() => {
                    queueNewActiveTerminalFocusAfterNewTabMenuClose()
                    onNewTerminalTab()
                  }}
                  onOpenEntry={onOpenEntry}
                  onQueryChange={setCreateMenuQuery}
                  onQueueSwitchFocus={queueFocusAfterNewTabMenuClose}
                  onSelectMenuOption={handleSelectCreateMenuOption}
                  onDidOpenEntry={() => setNewTabMenuOpen(false)}
                />
                {showStaticCreateMenuItems ? <DropdownMenuSeparator /> : null}
              </>
            ) : null}
            {showStaticCreateMenuItems ? (
              <TabBarStaticCreateMenu
                props={props}
                groupId={resolvedGroupId}
                terminalOnly={terminalOnly}
                mobileEmulatorEnabled={mobileEmulatorEnabled}
                managedBrowserCreationEnabled={managedBrowserCreationEnabled}
                mobileEmulatorCreationEnabled={mobileEmulatorCreationEnabled}
                workspaceHasSimulatorTab={workspaceHasSimulatorTab}
                showMobileEmulatorIntroCallout={showMobileEmulatorIntroCallout}
                windowsShellEntries={windowsShellEntries}
                defaultWindowsPowerShellImplementation={defaultWindowsPowerShellImplementation}
                pwshAvailable={windowsTerminalCapabilities.pwshAvailable}
                newTerminalShortcut={newTerminalShortcut}
                newBrowserShortcut={newBrowserShortcut}
                newSimulatorShortcut={newSimulatorShortcut}
                newFileShortcut={newFileShortcut}
                openMarkdownShortcut={openMarkdownShortcut}
                queueNewActiveTerminalFocusAfterNewTabMenuClose={
                  queueNewActiveTerminalFocusAfterNewTabMenuClose
                }
              />
            ) : null}
            {showStaticCreateMenuItems && showAgentLaunchItems ? (
              <>
                <DropdownMenuSeparator />
                <ProjectedAgentMenuItems
                  model={agentMenu}
                  pickerInventory={agentPickerInventory}
                  onSelectPickerAgent={selectPickerAgent}
                  hidePickerSearch={!terminalOnly && Boolean(onOpenEntry)}
                  runLaunch={launchAgentRow}
                />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
