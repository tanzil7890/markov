import { ShortcutKeyCombo } from '../ShortcutKeyCombo'
import { WorktreeJumpPaletteTaskSearchStatus } from './worktree-jump-palette-task-search-status'
import type React from 'react'
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DialogOverlaySurface } from '@/components/ui/dialog'
import PaletteFilterChips from '@/components/cmd-j/PaletteFilterChips'
import { PaletteLiveStatusProvider } from '@/components/cmd-j/palette-live-status'
import { getPaletteFilterSelectionCount } from '@/components/cmd-j/palette-filter'
import { translate } from '@/i18n/i18n'
import { WorkspaceEmojiSuggestionPopover } from '@/components/workspace-emoji/WorkspaceEmojiSuggestionPopover'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import { WorktreeJumpPaletteEntry } from './worktree-jump-palette-entry'
import { PaletteState } from './worktree-jump-palette-primitives'
import { WorktreeJumpPaletteScopeBar } from './worktree-jump-palette-scope-bar'
import { WorktreeJumpPaletteStartActions } from './worktree-jump-palette-start-actions'
import { getPaletteScopeLabel, stepPaletteScope } from './worktree-jump-palette-scope'
import {
  getWorktreeJumpPaletteEmptyState,
  getWorktreeJumpPaletteResultCount
} from './worktree-jump-palette-empty-state'

export function WorktreeJumpPaletteSurface({
  controller
}: {
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const selectedTask = controller.taskItems.find(
    (item) => item.id === controller.commandSelectedItemId
  )
  const modKey = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'
  const emptyState = getWorktreeJumpPaletteEmptyState(controller)
  const resultCount = getWorktreeJumpPaletteResultCount(controller)
  const showDigitHint =
    !controller.hasQuery &&
    controller.recentTabShortcutIndexByItem.size > 0 &&
    controller.digitShortcutModifiers.length > 0
  const paletteDialog = (
    <CommandDialog
      open={controller.visible}
      onOpenChange={controller.handleOpenChange}
      shouldFilter={false}
      onOpenAutoFocus={controller.handleOpenAutoFocus}
      onCloseAutoFocus={controller.handleCloseAutoFocus}
      title={translate('auto.components.WorktreeJumpPalette.4ee378034d', 'Jump to...')}
      description={translate(
        'auto.components.WorktreeJumpPalette.2770f02910',
        'Search chats, terminals, workspaces, tasks, settings, and actions'
      )}
      surface="palette"
      contentClassName="top-[min(12%,5rem)] w-[640px] max-w-[96vw] max-h-[min(90vh,calc(100vh-1.5rem))] overflow-hidden"
      commandProps={{
        loop: true,
        value: controller.commandSelectedItemId,
        onValueChange: controller.handleCommandSelectionChange,
        // Why: the dialog's default item padding outranks row classes; one line per result needs less.
        className: 'jump-palette-command bg-transparent [&_[cmdk-item]]:py-1.5',
        onKeyDownCapture: (event: React.KeyboardEvent) => {
          if (
            selectedTask &&
            event.key === 'Enter' &&
            (navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey)
          ) {
            event.preventDefault()
            event.stopPropagation()
            controller.handleSelectTask(selectedTask.result, true)
            return
          }
          if (
            controller.selectionMovedByUserRef &&
            ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)
          ) {
            controller.selectionMovedByUserRef.current = true
          }
        }
      }}
    >
      <CommandInput
        ref={controller.inputRef}
        placeholder={translate('worktreeJumpPalette.placeholder', 'Search or jump to…')}
        value={controller.query}
        onValueChange={controller.emojiInput.handleValueChange}
        onClick={(event) => controller.emojiInput.syncCursor(event.currentTarget)}
        onSelect={(event) => controller.emojiInput.syncCursor(event.currentTarget)}
        onKeyDown={(event) => {
          // Why: Tab steps through scopes, then leaves the box so the filter stays reachable.
          const nextScope =
            event.key === 'Tab' && !controller.emojiInput.open && !event.altKey
              ? stepPaletteScope(controller.scope, event.shiftKey ? -1 : 1)
              : null
          if (nextScope) {
            event.preventDefault()
            controller.selectScope(nextScope)
            return
          }
          controller.emojiInput.handleKeyDown(event)
        }}
        iconClassName="mr-2.5 h-4 w-4 text-muted-foreground/60"
        className="h-12 min-w-0 flex-1"
      />
      <WorkspaceEmojiSuggestionPopover
        anchorRef={controller.inputRef}
        open={controller.emojiInput.open}
        commandValue={controller.emojiInput.commandValue}
        heading={translate('auto.components.new.workspace.SmartWorkspaceNameField.emoji', 'Emoji')}
        suggestions={controller.emojiInput.suggestions}
        onCommandValueChange={controller.emojiInput.onCommandValueChange}
        onSelect={controller.emojiInput.selectSuggestion}
        onOpenChange={(open) => !open && controller.emojiInput.close()}
        portalContainer={controller.dialogElement}
        side="bottom"
        contentClassName="w-80"
      />
      <WorktreeJumpPaletteScopeBar controller={controller} />
      <PaletteFilterChips
        model={controller.filterModel}
        filter={controller.filter}
        onFilterChange={controller.setFilter}
      />
      {!controller.hasQuery && controller.scope === 'all' ? (
        <WorktreeJumpPaletteStartActions controller={controller} />
      ) : null}
      <CommandList
        ref={controller.listRef}
        onPointerDownCapture={() => {
          controller.selectionMovedByUserRef.current = true
        }}
        className="max-h-[min(600px,calc(100vh-14rem))] px-2.5 pb-2.5 pt-2"
      >
        {controller.isLoading &&
        controller.selectableItems.length === 0 &&
        !controller.showCreateAction ? (
          <PaletteState
            title={translate(
              'auto.components.WorktreeJumpPalette.ff908adfe9',
              'Loading jump targets'
            )}
            subtitle={translate(
              'auto.components.WorktreeJumpPalette.684e8d7bc2',
              'Gathering your recent worktrees and open tabs.'
            )}
          />
        ) : controller.selectableItems.length === 0 && !controller.showCreateAction ? (
          <CommandEmpty className="py-0">
            <PaletteState title={emptyState.title} subtitle={emptyState.subtitle} />
          </CommandEmpty>
        ) : (
          <>
            {controller.listEntries.map((entry, index) => (
              <WorktreeJumpPaletteEntry
                key={controller.listEntryRenderKeys[index] ?? entry.id}
                entry={entry}
                renderKey={controller.listEntryRenderKeys[index] ?? entry.id}
                controller={controller}
              />
            ))}
          </>
        )}
        {controller.scope === 'all' || controller.scope === 'tasks' ? (
          <WorktreeJumpPaletteTaskSearchStatus
            loading={controller.taskSearchLoading}
            failures={controller.taskSearchFailures}
            onRetry={controller.retryTaskSearch}
          />
        ) : null}
      </CommandList>
      <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        {showDigitHint ? (
          <span className="flex items-center gap-1.5">
            <ShortcutKeyCombo keys={[...controller.digitShortcutModifiers, '1–9']} />
            {translate('worktreeJumpPalette.footer.openRecent', 'Open recent')}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <ShortcutKeyCombo keys={['Tab']} />
          {translate('worktreeJumpPalette.footer.switchScope', 'Switch scope')}
        </span>
        {selectedTask ? (
          <span className="ml-auto flex items-center gap-1.5">
            <ShortcutKeyCombo keys={[modKey, 'Enter']} />
            {translate('worktreeJumpPalette.taskCreate', 'Create workspace')}
          </span>
        ) : null}
      </div>
      <div aria-live="polite" className="sr-only">
        {controller.scope === 'all'
          ? ''
          : `${translate('worktreeJumpPalette.scope.announce', 'Showing {{value0}}.', {
              value0: getPaletteScopeLabel(controller.scope)
            })} `}
        {controller.filterActive
          ? `${translate(
              'worktreeJumpPalette.filter.ariaActiveCount',
              'Filter: {{count}} active.',
              {
                count: getPaletteFilterSelectionCount(controller.filter),
                defaultValue_one: 'Filter: {{count}} active.'
              }
            )} `
          : ''}
        {controller.deferredQuery.trim()
          ? translate(
              'auto.components.WorktreeJumpPalette.resultsFound',
              '{{count}} results found.',
              { count: resultCount, defaultValue_one: '{{count}} result found.' }
            )
          : translate(
              'auto.components.WorktreeJumpPalette.itemsAvailable',
              '{{count}} items available.',
              { count: resultCount, defaultValue_one: '{{count}} item available.' }
            )}
        {controller.showCreateAction
          ? ` ${translate('auto.components.WorktreeJumpPalette.createActionAvailable', 'Create worktree action available.')}`
          : ''}
      </div>
    </CommandDialog>
  )

  return (
    <TooltipProvider delayDuration={400}>
      <PaletteLiveStatusProvider active={controller.paletteStatusInputsActive}>
        <DialogOverlaySurface value="palette">{paletteDialog}</DialogOverlaySurface>
      </PaletteLiveStatusProvider>
    </TooltipProvider>
  )
}
