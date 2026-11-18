import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Plus, Search } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { getTerminalQuickCommandHostPromptMaxLength } from '@/lib/terminal-quick-command-host-prompt-limit'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '@/components/terminal-quick-commands/TerminalQuickCommandDialog'
import { searchHostedTerminalQuickCommands } from '@/components/terminal-quick-commands/hosted-terminal-quick-command-search'
import { useWorkspaceQuickCommands } from '@/hooks/use-workspace-quick-commands'
import {
  shouldShowTerminalQuickCommandHostOwnership,
  type HostedTerminalQuickCommand
} from '@/hooks/use-terminal-quick-command-hosts'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../../shared/execution-host'
import type { TerminalQuickCommand } from '../../../../../shared/terminal/quick-commands/terminal-quick-command-types'
import { SidebarCommandRow } from './SidebarCommandRow'
import { runQuickCommandFromSidebar } from './sidebar-terminal-tabs'
import { useRightSidebarBottomPanel } from './right-sidebar-bottom-panel-state'

const SEARCH_THRESHOLD = 6

type Editor = { mode: 'add' | 'edit'; command: TerminalQuickCommand; hostId: ExecutionHostId }

export function SidebarCommandsView({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const {
    hosts,
    repoId,
    repos,
    repoCommands,
    globalCommands,
    defaultHostId,
    refreshRemoteHost,
    remoteHostLoadFailed,
    remoteHostPending
  } = useWorkspaceQuickCommands(worktreeId)
  const confirm = useConfirmationDialog()
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const focusRequest = useRightSidebarBottomPanel((s) => s.commandsFocusRequest)
  const total = repoCommands.length + globalCommands.length
  const showSearch = total > SEARCH_THRESHOLD
  const showHostLabel = shouldShowTerminalQuickCommandHostOwnership(hosts)

  useEffect(() => {
    refreshRemoteHost()
  }, [refreshRemoteHost, worktreeId])

  useEffect(() => {
    if (focusRequest === 0) {
      return
    }
    const target = searchRef.current ?? listRef.current?.querySelector<HTMLElement>('button')
    target?.focus()
  }, [focusRequest])

  const filteredRepo = useMemo(
    () => searchHostedTerminalQuickCommands(repoCommands, query),
    [repoCommands, query]
  )
  const filteredGlobal = useMemo(
    () => searchHostedTerminalQuickCommands(globalCommands, query),
    [globalCommands, query]
  )
  const editorPromptMaxLength = useAppStore((state) =>
    editor ? getTerminalQuickCommandHostPromptMaxLength(state, editor.hostId) : undefined
  )
  const editorRepos = editor?.hostId.startsWith('runtime:')
    ? repos.filter((repo) => getRepoExecutionHostId(repo) === editor.hostId)
    : repos

  const startCreate = (hostId: ExecutionHostId = defaultHostId): void => {
    setEditor({
      mode: 'add',
      hostId,
      // Folder workspaces have no project to scope to, so a new command applies everywhere.
      command: createTerminalQuickCommandDraft(
        repoId ? { type: 'repo', repoId } : { type: 'global' }
      )
    })
  }

  const deleteCommand = async (entry: HostedTerminalQuickCommand): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.e8e1a52edb',
        'Delete "{{value0}}"?',
        { value0: entry.command.label }
      ),
      description: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.3220e2da27',
        'This quick command will be removed from your saved list.'
      ),
      confirmLabel: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.be8f0ff166',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (confirmed) {
      void useAppStore.getState().deleteTerminalQuickCommand(entry.hostId, entry.command.id)
    }
  }

  const renderRows = (entries: readonly HostedTerminalQuickCommand[]): React.JSX.Element[] =>
    entries.map((entry) => (
      <SidebarCommandRow
        key={entry.key}
        entry={entry}
        showHostLabel={showHostLabel}
        onRun={() => runQuickCommandFromSidebar({ command: entry.command, worktreeId })}
        onEdit={() => setEditor({ mode: 'edit', command: entry.command, hostId: entry.hostId })}
        onDelete={() => void deleteCommand(entry)}
      />
    ))

  const dialog = (
    <TerminalQuickCommandDialog
      open={editor !== null}
      mode={editor?.mode ?? 'add'}
      command={editor?.command ?? createTerminalQuickCommandDraft()}
      repos={editorRepos}
      agentPromptMaxLength={editorPromptMaxLength}
      onOpenChange={(open) => !open && setEditor(null)}
      onSave={async (next) =>
        editor
          ? await useAppStore.getState().upsertTerminalQuickCommand(editor.hostId, next)
          : false
      }
    />
  )

  if (total === 0 && !remoteHostPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 pb-6 text-center">
        <Play className="size-4 text-muted-foreground" />
        <div className="text-[13px] font-medium text-foreground">
          {translate('auto.components.right.sidebar.commands.emptyTitle', 'No commands yet')}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.commands.emptyBody',
            'Save a command you run often, like starting the dev server.'
          )}
        </p>
        <Button size="sm" className="mt-1" onClick={() => startCreate()}>
          {translate('auto.components.right.sidebar.commands.create', 'Create a command')}
        </Button>
        {dialog}
      </div>
    )
  }

  const sectionLabel = 'text-2xs font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showSearch ? (
        <div className="relative shrink-0 px-2 pb-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.f3a8c2d1e7',
              'Search quick commands...'
            )}
            aria-label={translate(
              'auto.components.right.sidebar.commands.search',
              'Search commands'
            )}
            className="h-7 pl-7 text-xs"
          />
        </div>
      ) : null}
      <div ref={listRef} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {repoCommands.length > 0 ? (
          <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
            <span className={sectionLabel}>
              {translate('auto.components.right.sidebar.commands.thisProject', 'This project')}
            </span>
          </div>
        ) : null}
        {renderRows(filteredRepo)}
        {globalCommands.length > 0 ? (
          <div className="px-2 pt-2 pb-0.5">
            <span className={sectionLabel}>
              {translate('auto.components.right.sidebar.commands.everywhere', 'Everywhere')}
            </span>
          </div>
        ) : null}
        {renderRows(filteredGlobal)}
        {query.trim() && filteredRepo.length + filteredGlobal.length === 0 ? (
          <div className="py-4 text-center text-2xs text-muted-foreground">
            {translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.b4e7f9a2c1',
              'No commands match'
            )}
          </div>
        ) : null}
        {remoteHostPending ? (
          <div className="px-2 py-2 text-2xs text-muted-foreground">
            {remoteHostLoadFailed
              ? translate(
                  'auto.components.tab.bar.TabBarQuickCommandHostLoadStatus.82e294f3ca',
                  'Host unavailable'
                )
              : translate(
                  'auto.components.tab.bar.TabBarQuickCommandHostLoadStatus.7c129b08ff',
                  'Loading host…'
                )}
          </div>
        ) : null}
        <div className="mt-1 flex flex-col">
          {hosts.map((host) => (
            <button
              key={host.hostId}
              type="button"
              onClick={() => startCreate(host.hostId)}
              className="mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Plus className="size-3.5" />
              {hosts.length === 1
                ? translate('auto.components.right.sidebar.commands.new', 'New command')
                : translate(
                    'auto.components.tab.bar.TabBarQuickCommandAddActions.b856c833ae',
                    'Command on {{value0}}',
                    { value0: host.label }
                  )}
            </button>
          ))}
        </div>
      </div>
      {dialog}
    </div>
  )
}
