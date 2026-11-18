import {
  ChevronRight,
  Globe,
  LogOut,
  MoreHorizontal,
  RotateCw,
  SquareTerminal,
  Trash2
} from 'lucide-react'
import type { McpConnectionSummary } from '../../../../../shared/mcp-connections'
import { translate } from '@/i18n/i18n'
import { LoadingSpinner } from '../../LoadingSpinner'
import { Button } from '../../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../ui/dropdown-menu'
import { SettingsSwitch } from '../form-controls/SettingsFormControls'
import { ConnectionToolList, type ConnectionToolsView } from './ConnectionToolList'

export type ConnectionRowProps = {
  connection: McpConnectionSummary
  busy: boolean
  /** The browser sign-in for this connection is open and not finished yet. */
  signingIn: boolean
  toolsOpen: boolean
  tools: ConnectionToolsView
  onToolsOpenChange: (open: boolean) => void
  onToggle: () => void
  onCheck: () => void
  onSignIn: () => void
  onCancelSignIn: () => void
  onSignOut: () => void
  onRemove: () => void
}

function toolCountLabel(count: number): string {
  return translate('settings.connections.status.toolCount', '{{count}} tools', {
    count,
    defaultValue_one: '{{count}} tool'
  })
}

function ConnectionStatus({
  connection,
  signingIn
}: Pick<ConnectionRowProps, 'connection' | 'signingIn'>): React.JSX.Element {
  const { status } = connection
  if (signingIn) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoadingSpinner className="size-3" />
        {translate(
          'settings.connections.status.signingIn',
          'Waiting for the sign-in in your browser…'
        )}
      </p>
    )
  }
  if (status.state === 'failed') {
    return <p className="text-xs break-words text-destructive">{status.message}</p>
  }
  if (status.state === 'connected') {
    return (
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="xs" className="group -ml-1.5">
          <ChevronRight className="transition-transform group-data-[state=open]:rotate-90" />
          {toolCountLabel(status.toolCount ?? 0)}
        </Button>
      </CollapsibleTrigger>
    )
  }
  const text =
    status.state === 'needs-sign-in'
      ? (status.message ?? '')
      : status.state === 'checking'
        ? translate('settings.connections.status.checking', 'Checking…')
        : status.state === 'disabled'
          ? translate('settings.connections.status.off', 'Off')
          : translate('settings.connections.status.unchecked', 'Not checked yet')
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function ConnectionMenu({
  connection,
  busy,
  onCheck,
  onSignOut,
  onRemove
}: Pick<
  ConnectionRowProps,
  'connection' | 'busy' | 'onCheck' | 'onSignOut' | 'onRemove'
>): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={translate('settings.connections.moreActions', 'More actions for {{name}}', {
            name: connection.title
          })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem disabled={!connection.enabled} onSelect={onCheck}>
          <RotateCw />
          {translate('settings.connections.check', 'Check again')}
        </DropdownMenuItem>
        {connection.signedIn ? (
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut />
            {translate('settings.connections.signOut', 'Sign out')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 />
          {translate('settings.connections.remove', 'Remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ConnectionRow({
  connection,
  busy,
  signingIn,
  toolsOpen,
  tools,
  onToolsOpenChange,
  onToggle,
  onCheck,
  onSignIn,
  onCancelSignIn,
  onSignOut,
  onRemove
}: ConnectionRowProps): React.JSX.Element {
  const { transport, status } = connection
  const Icon = transport.kind === 'http' ? Globe : SquareTerminal
  const target =
    transport.kind === 'http' ? transport.url : [transport.command, ...transport.args].join(' ')
  const canSignIn = transport.kind === 'http' && status.state === 'needs-sign-in'
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 shadow-xs">
      <Collapsible
        // Why: only a connected server has a list to show; a row that stops being one closes.
        open={toolsOpen && status.state === 'connected' && !signingIn}
        onOpenChange={onToolsOpenChange}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-medium">{connection.title}</span>
              <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                {connection.name}
              </span>
            </div>
            <p className="truncate font-mono text-2xs text-muted-foreground">{target}</p>
            <ConnectionStatus connection={connection} signingIn={signingIn} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {signingIn ? (
              <Button variant="ghost" size="sm" onClick={onCancelSignIn}>
                {translate('settings.connections.cancelSignIn', 'Cancel')}
              </Button>
            ) : null}
            {canSignIn && !signingIn ? (
              <Button variant="outline" size="sm" onClick={onSignIn} disabled={busy}>
                {translate('settings.connections.signIn', 'Sign in')}
              </Button>
            ) : null}
            <SettingsSwitch
              checked={connection.enabled}
              disabled={busy || signingIn}
              ariaLabel={translate('settings.connections.toggleLabel', 'Turn {{name}} on or off', {
                name: connection.title
              })}
              onChange={onToggle}
            />
            <ConnectionMenu
              connection={connection}
              busy={busy || signingIn}
              onCheck={onCheck}
              onSignOut={onSignOut}
              onRemove={onRemove}
            />
          </div>
        </div>
        <CollapsibleContent animation="height">
          <ConnectionToolList view={tools} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
