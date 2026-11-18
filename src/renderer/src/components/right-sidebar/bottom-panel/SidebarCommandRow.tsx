import { Play } from 'lucide-react'
import { isTerminalAgentQuickCommand } from '../../../../../shared/terminal/quick-commands/terminal-quick-commands'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import type { HostedTerminalQuickCommand } from '@/hooks/use-terminal-quick-command-hosts'
import { QuickCommandRowActions } from '@/components/terminal-quick-commands/QuickCommandRowActions'

export function SidebarCommandRow({
  entry,
  showHostLabel,
  onRun,
  onEdit,
  onDelete
}: {
  entry: HostedTerminalQuickCommand
  showHostLabel: boolean
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { command } = entry
  const isAgent = isTerminalAgentQuickCommand(command)
  return (
    <div className="group/sc mx-1 flex items-center gap-1 rounded-md hover:bg-accent focus-within:bg-accent">
      <button
        type="button"
        onClick={onRun}
        aria-label={translate('auto.components.right.sidebar.commands.run', 'Run {{value0}}', {
          value0: command.label
        })}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1.5 pl-2 text-left focus-visible:outline-none"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground group-hover/sc:text-foreground">
          {isAgent ? (
            <AgentIcon agent={command.agent} size={11} />
          ) : (
            <Play className="size-2.5" fill="currentColor" strokeWidth={0} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">
              {command.label}
            </span>
            {showHostLabel ? (
              <span className="shrink-0 text-2xs text-muted-foreground">{entry.hostLabel}</span>
            ) : null}
          </span>
          <span className="block truncate font-mono text-2xs leading-4 text-muted-foreground">
            {isAgent ? `${getAgentLabel(command.agent)}: ${command.prompt}` : command.command}
          </span>
        </span>
      </button>
      <QuickCommandRowActions
        command={command}
        revealClassName="pr-1 can-hover:opacity-0 group-hover/sc:opacity-100 group-focus-within/sc:opacity-100"
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}
