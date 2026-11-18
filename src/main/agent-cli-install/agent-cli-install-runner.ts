import type {
  AgentCliInstallAgent,
  AgentCliInstallProgress,
  AgentCliInstallResult
} from '../../shared/agent-cli-install-types'
import { installClaudeWithOfficialScript } from './claude-official-install'
import { codexReleaseTarget, installCodexFromRelease } from './codex-release-install'

const INSTALL_TIMEOUT_MS = 20 * 60_000

/** macOS and Linux only: Windows keeps the terminal flow rather than piping a script into PowerShell. */
export function isOneClickAgentInstallSupported(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): boolean {
  return codexReleaseTarget(platform, arch) !== null
}

const inFlight = new Map<AgentCliInstallAgent, Promise<AgentCliInstallResult>>()

async function install(
  agent: AgentCliInstallAgent,
  onProgress: (progress: AgentCliInstallProgress) => void
): Promise<AgentCliInstallResult> {
  const target = codexReleaseTarget(process.platform, process.arch)
  if (!target) {
    return { ok: false, error: 'One-click install is not available on this computer.' }
  }
  const signal = AbortSignal.timeout(INSTALL_TIMEOUT_MS)
  try {
    if (agent === 'codex') {
      const version = await installCodexFromRelease(
        target,
        (stage, percent) => onProgress({ agent, stage, percent }),
        signal
      )
      return { ok: true, version }
    }
    onProgress({ agent, stage: 'installing', percent: null })
    return { ok: true, version: await installClaudeWithOfficialScript(signal) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** A second request for an agent already installing joins the running attempt. */
export function runAgentCliInstall(
  agent: AgentCliInstallAgent,
  onProgress: (progress: AgentCliInstallProgress) => void
): Promise<AgentCliInstallResult> {
  const running = inFlight.get(agent)
  if (running) {
    return running
  }
  const attempt = install(agent, onProgress).finally(() => inFlight.delete(agent))
  inFlight.set(agent, attempt)
  return attempt
}
