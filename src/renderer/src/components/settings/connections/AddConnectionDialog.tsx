import { useState } from 'react'
import { Lock, Plus, X } from 'lucide-react'
import { resolveStartupShell } from '../../../../../shared/agent-launch/startup/tui-agent-startup-shell'
import { suggestMcpConnectionName } from '../../../../../shared/mcp-connections'
import { translate } from '@/i18n/i18n'
import { LoadingSpinner } from '../../LoadingSpinner'
import { Button } from '../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group'
import {
  EMPTY_MCP_CONNECTION_FORM,
  buildMcpConnectionDraft,
  type McpConnectionForm,
  type McpConnectionFormProblem
} from './mcp-connection-form'

type AddConnectionDialogProps = {
  open: boolean
  /** Names already taken, so a second "Linear" is refused before it is sent. */
  existingNames: readonly string[]
  onOpenChange: (open: boolean) => void
}

function problemMessage(problem: McpConnectionFormProblem): string {
  switch (problem) {
    case 'title':
      return translate(
        'settings.connections.form.problem.title',
        'Give the connection a name that starts with a letter or a number.'
      )
    case 'name-taken':
      return translate(
        'settings.connections.form.problem.nameTaken',
        'Another connection already uses this name.'
      )
    case 'url':
      return translate(
        'settings.connections.form.problem.url',
        'Enter the full address of the server, starting with https://.'
      )
    case 'command':
      return translate(
        'settings.connections.form.problem.command',
        'Enter the command that starts the server.'
      )
    case 'secret-name':
      return translate(
        'settings.connections.form.problem.secretName',
        'Every value needs a name without spaces.'
      )
  }
}

export function AddConnectionDialog({
  open,
  existingNames,
  onOpenChange
}: AddConnectionDialogProps): React.JSX.Element {
  const [form, setForm] = useState<McpConnectionForm>(EMPTY_MCP_CONNECTION_FORM)
  const [nextSecretKey, setNextSecretKey] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isHttp = form.kind === 'http'
  const edit = (change: (current: McpConnectionForm) => McpConnectionForm): void => {
    setForm(change)
    setError(null)
  }
  const toolPrefix = suggestMcpConnectionName(form.title)

  const close = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setForm(EMPTY_MCP_CONNECTION_FORM)
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  const submit = async (): Promise<void> => {
    const built = buildMcpConnectionDraft(
      form,
      existingNames,
      resolveStartupShell(navigator.userAgent.includes('Windows') ? 'win32' : 'linux')
    )
    if ('problem' in built) {
      setError(problemMessage(built.problem))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.mcpConnections.add(built.draft)
      if (result.ok) {
        close(false)
      } else {
        setError(result.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent surface="security" scrollable>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {translate('settings.connections.form.title', 'Add connection')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'settings.connections.form.description',
                'Agents can run every tool this server offers. Add only servers you trust.'
              )}
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            type="single"
            size="sm"
            variant="segmented-card"
            value={form.kind}
            disabled={saving}
            onValueChange={(kind) => {
              if (kind === 'http' || kind === 'stdio') {
                edit((current) => ({ ...current, kind, target: '', secrets: [] }))
              }
            }}
          >
            <ToggleGroupItem value="http">
              {translate('settings.connections.form.kindHttp', 'Web address')}
            </ToggleGroupItem>
            <ToggleGroupItem value="stdio">
              {translate('settings.connections.form.kindStdio', 'Command')}
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="space-y-2">
            <Label htmlFor="mcp-connection-title">
              {translate('settings.connections.form.nameLabel', 'Name')}
            </Label>
            <Input
              id="mcp-connection-title"
              value={form.title}
              disabled={saving}
              autoFocus
              placeholder={translate('settings.connections.form.namePlaceholder', 'Linear')}
              onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))}
            />
            {toolPrefix ? (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'settings.connections.form.toolPrefix',
                  'Agents see its tools as {{prefix}}__…',
                  { prefix: toolPrefix }
                )}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-connection-target">
              {isHttp
                ? translate('settings.connections.form.urlLabel', 'Server address')
                : translate('settings.connections.form.commandLabel', 'Command')}
            </Label>
            <Input
              id="mcp-connection-target"
              value={form.target}
              disabled={saving}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              placeholder={
                isHttp
                  ? translate(
                      'settings.connections.form.urlPlaceholder',
                      'https://mcp.example.com/mcp'
                    )
                  : translate(
                      'settings.connections.form.commandPlaceholder',
                      'npx -y @modelcontextprotocol/server-everything'
                    )
              }
              onChange={(event) => edit((current) => ({ ...current, target: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {isHttp
                ? translate(
                    'settings.connections.form.urlHelp',
                    'If the server asks for a sign-in, Markov offers it after the connection is added.'
                  )
                : translate(
                    'settings.connections.form.commandHelp',
                    'Markov runs this command on this computer whenever an agent needs its tools.'
                  )}
            </p>
          </div>
          <div className="space-y-2">
            <Label>
              {isHttp
                ? translate('settings.connections.form.headersLabel', 'Request headers')
                : translate('settings.connections.form.environmentLabel', 'Environment variables')}
            </Label>
            {form.secrets.map((secret) => (
              <div key={secret.key} className="flex items-center gap-2">
                <Input
                  value={secret.name}
                  disabled={saving}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  aria-label={translate('settings.connections.form.secretName', 'Name')}
                  placeholder={
                    isHttp
                      ? translate(
                          'settings.connections.form.headerNamePlaceholder',
                          'Authorization'
                        )
                      : translate('settings.connections.form.environmentNamePlaceholder', 'API_KEY')
                  }
                  onChange={(event) =>
                    edit((current) => ({
                      ...current,
                      secrets: current.secrets.map((entry) =>
                        entry.key === secret.key ? { ...entry, name: event.target.value } : entry
                      )
                    }))
                  }
                />
                <Input
                  type="password"
                  value={secret.value}
                  disabled={saving}
                  autoComplete="off"
                  aria-label={translate('settings.connections.form.secretValue', 'Value')}
                  placeholder={translate('settings.connections.form.secretValue', 'Value')}
                  onChange={(event) =>
                    edit((current) => ({
                      ...current,
                      secrets: current.secrets.map((entry) =>
                        entry.key === secret.key ? { ...entry, value: event.target.value } : entry
                      )
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={saving}
                  aria-label={translate('settings.connections.form.removeSecret', 'Remove value')}
                  onClick={() =>
                    edit((current) => ({
                      ...current,
                      secrets: current.secrets.filter((entry) => entry.key !== secret.key)
                    }))
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={saving}
              onClick={() => {
                edit((current) => ({
                  ...current,
                  secrets: [...current.secrets, { key: nextSecretKey, name: '', value: '' }]
                }))
                setNextSecretKey((key) => key + 1)
              }}
            >
              <Plus className="size-3" />
              {isHttp
                ? translate('settings.connections.form.addHeader', 'Add header')
                : translate('settings.connections.form.addVariable', 'Add variable')}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3 shrink-0" />
              {translate(
                'settings.connections.form.secretNote',
                'Values are encrypted with this computer’s keychain and are not shown again.'
              )}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-xs break-words text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => close(false)}>
              {translate('settings.connections.form.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim() || !form.target.trim()}>
              {saving ? <LoadingSpinner className="size-4" /> : null}
              {translate('settings.connections.form.submit', 'Add connection')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
