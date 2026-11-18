import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  McpConnectionActionResult,
  McpConnectionSummary
} from '../../../../../shared/mcp-connections'
import type { ConnectionToolsView } from './ConnectionToolList'

/** The saved MCP connections and what the page has opened, kept while Settings stays open. */
export function useMcpConnections(enabled: boolean) {
  const [connections, setConnections] = useState<McpConnectionSummary[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [signingInId, setSigningInId] = useState<string | null>(null)
  const [openToolIds, setOpenToolIds] = useState<readonly string[]>([])
  const [toolViews, setToolViews] = useState<Record<string, ConnectionToolsView>>({})

  // Why: checks, sign-ins and agents using a connection change its status outside this page.
  useEffect(
    () =>
      enabled
        ? window.api.mcpConnections.onChanged(() => setRevision((value) => value + 1))
        : undefined,
    [enabled]
  )

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    void window.api.mcpConnections.list().then((list) => {
      if (!cancelled) {
        setConnections(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [enabled, revision])

  // Why on every reload: a re-check may have found a different list than the open one shows.
  useEffect(() => {
    let cancelled = false
    for (const { id, status } of connections ?? []) {
      if (status.state !== 'connected' || !openToolIds.includes(id)) {
        continue
      }
      void window.api.mcpConnections.tools(id).then((result) => {
        if (cancelled) {
          return
        }
        const view: ConnectionToolsView = result.ok
          ? { state: 'ready', tools: result.tools }
          : { state: 'failed', message: result.error }
        setToolViews((views) => ({ ...views, [id]: view }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [connections, openToolIds])

  const run = async (action: () => Promise<McpConnectionActionResult>): Promise<void> => {
    setBusy(true)
    try {
      const outcome = await action()
      if (!outcome.ok) {
        toast.error(outcome.error)
      }
    } finally {
      setBusy(false)
      setRevision((value) => value + 1)
    }
  }

  const signIn = async (connectionId: string): Promise<void> => {
    setSigningInId(connectionId)
    try {
      const outcome = await window.api.mcpConnections.signIn(connectionId)
      if (!outcome.ok) {
        toast.error(outcome.error)
      }
    } finally {
      setSigningInId(null)
      setRevision((value) => value + 1)
    }
  }

  const setToolsOpen = (connectionId: string, open: boolean): void =>
    setOpenToolIds((ids) => [
      ...ids.filter((id) => id !== connectionId),
      ...(open ? [connectionId] : [])
    ])

  return { connections, busy, signingInId, openToolIds, toolViews, run, signIn, setToolsOpen }
}

export type McpConnectionsModel = ReturnType<typeof useMcpConnections>
