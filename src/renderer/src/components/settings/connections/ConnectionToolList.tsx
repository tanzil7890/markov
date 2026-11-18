import { useState } from 'react'
import type { McpConnectionTool } from '../../../../../shared/mcp-connections'
import { translate } from '@/i18n/i18n'
import { LoadingSpinner } from '../../LoadingSpinner'
import { Input } from '../../ui/input'

/** What an opened connection shows while its tools load, once they arrive, or when they cannot. */
export type ConnectionToolsView =
  | { state: 'loading' }
  | { state: 'ready'; tools: McpConnectionTool[] }
  | { state: 'failed'; message: string }

// Why: a short list is read at a glance; filtering only earns its row on a long one.
const FILTER_FROM_TOOL_COUNT = 9

function matchesFilter(tool: McpConnectionTool, filter: string): boolean {
  return (
    tool.name.toLowerCase().includes(filter) ||
    (tool.description?.toLowerCase().includes(filter) ?? false)
  )
}

function ToolRows({ tools }: { tools: McpConnectionTool[] }): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const shown = query ? tools.filter((tool) => matchesFilter(tool, query)) : tools
  if (tools.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {translate('settings.connections.tools.none', 'This server offers no tools.')}
      </p>
    )
  }
  return (
    <>
      {tools.length >= FILTER_FROM_TOOL_COUNT ? (
        <div className="px-4 pt-3">
          <Input
            density="compact"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={translate('settings.connections.tools.filter', 'Filter tools')}
            aria-label={translate('settings.connections.tools.filter', 'Filter tools')}
            spellCheck={false}
          />
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {translate('settings.connections.tools.noMatch', 'No tools match “{{filter}}”.', {
            filter: filter.trim()
          })}
        </p>
      ) : (
        <ul className="scrollbar-sleek max-h-80 list-none divide-y divide-border/50 overflow-y-auto px-4 py-1">
          {shown.map((tool) => (
            <li key={tool.name} className="py-2">
              <p className="font-mono text-xs break-all text-foreground">{tool.name}</p>
              {tool.description ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {tool.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function ConnectionToolList({ view }: { view: ConnectionToolsView }): React.JSX.Element {
  return (
    <div className="border-t border-border/60">
      {view.state === 'loading' ? (
        <p className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
          <LoadingSpinner className="size-3" />
          {translate('settings.connections.tools.loading', 'Loading tools…')}
        </p>
      ) : view.state === 'failed' ? (
        <p className="px-4 py-3 text-xs break-words text-destructive">{view.message}</p>
      ) : (
        <ToolRows tools={view.tools} />
      )}
    </div>
  )
}
