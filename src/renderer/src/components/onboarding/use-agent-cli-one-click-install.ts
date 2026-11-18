import { useCallback, useEffect, useState } from 'react'
import type {
  AgentCliInstallAgent,
  AgentCliInstallProgress
} from '../../../../shared/agent-cli-install-types'

export type OneClickInstallState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: AgentCliInstallProgress['stage']; percent: number | null }
  // Installed; waiting for agent detection to see it.
  | { kind: 'finishing' }
  | { kind: 'failed'; error: string }

/** Installs an agent from the main process without a terminal; `supported` is null until known. */
export function useAgentCliOneClickInstall(agent: AgentCliInstallAgent, onInstalled: () => void) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [state, setState] = useState<OneClickInstallState>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    window.api.agentCliInstall.isSupported().then(
      (value) => {
        if (!cancelled) {
          setSupported(value === true)
        }
      },
      // A client without the bridge (the web client) installs in a terminal instead.
      () => {
        if (!cancelled) {
          setSupported(false)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  const install = useCallback(async () => {
    setState({
      kind: 'running',
      stage: agent === 'codex' ? 'downloading' : 'installing',
      percent: null
    })
    const unsubscribe = window.api.agentCliInstall.onProgress((progress) => {
      if (progress.agent === agent) {
        setState({ kind: 'running', stage: progress.stage, percent: progress.percent })
      }
    })
    try {
      const result = await window.api.agentCliInstall.install(agent)
      if (result.ok) {
        setState({ kind: 'finishing' })
        onInstalled()
      } else {
        setState({ kind: 'failed', error: result.error })
      }
    } catch (error) {
      setState({ kind: 'failed', error: error instanceof Error ? error.message : String(error) })
    } finally {
      unsubscribe()
    }
  }, [agent, onInstalled])

  return { supported, state, install }
}
