import type { MouseEvent, PointerEvent } from 'react'
import { Check, Copy, Pencil, Trash2 } from 'lucide-react'
import { getTerminalQuickCommandBody } from '../../../../shared/terminal/quick-commands/terminal-quick-commands'
import type { TerminalQuickCommand } from '../../../../shared/terminal/quick-commands/terminal-quick-command-types'
import { translate } from '@/i18n/i18n'
import { useClipboardTextCopyFeedback } from '@/hooks/use-clipboard-text-copy-feedback'
import { cn } from '@/lib/utils'

function stopRowSelect(event: MouseEvent | PointerEvent): void {
  // Why: nested actions must preserve search focus without running the command.
  event.preventDefault()
  event.stopPropagation()
}

/** Copy, edit and remove for one saved command; shown on row hover or selection. */
export function QuickCommandRowActions({
  command,
  revealClassName,
  onEdit,
  onDelete
}: {
  command: TerminalQuickCommand
  /** Classes that reveal the group, keyed to the row's own group name. */
  revealClassName: string
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { canCopy, copyText, status } = useClipboardTextCopyFeedback(
    getTerminalQuickCommandBody(command)
  )
  const copyLabel =
    status === 'copied'
      ? translate('auto.components.tab.bar.TabBarQuickCommandsButton.8d525e5f15', 'Copied')
      : status === 'failed'
        ? translate('auto.components.tab.bar.TabBarQuickCommandsButton.53b17a4b1b', "Couldn't copy")
        : canCopy
          ? translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.a9a564b7e7',
              'Copy {{value0}}',
              { value0: command.label }
            )
          : translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.69a1441a21',
              'Nothing to copy'
            )

  return (
    <span
      role="group"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
        }
      }}
      aria-label={translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.192a4616a5',
        'Quick command actions'
      )}
      className={cn('flex shrink-0 items-center gap-0.5 transition-opacity', revealClassName)}
    >
      <button
        type="button"
        disabled={!canCopy}
        onPointerDown={stopRowSelect}
        onClick={(event) => {
          stopRowSelect(event)
          void copyText()
        }}
        className={cn(
          'cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          status === 'copied' && 'text-status-success',
          status === 'failed' && 'text-destructive'
        )}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {status === 'copied' ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      <button
        type="button"
        onPointerDown={stopRowSelect}
        onClick={(event) => {
          stopRowSelect(event)
          onEdit()
        }}
        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.15529ede69',
          'Edit {{value0}}',
          { value0: command.label }
        )}
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        onPointerDown={stopRowSelect}
        onClick={(event) => {
          stopRowSelect(event)
          onDelete()
        }}
        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
        aria-label={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.196593b6a9',
          'Remove {{value0}}',
          { value0: command.label }
        )}
      >
        <Trash2 className="size-3" />
      </button>
    </span>
  )
}
