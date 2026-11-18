// Keeps a whole Codex ready without anyone asking: when this host's own Codex is missing or lacks
// its command helper, Markov's pinned release is installed (or brought up to date) in the background.

import { isOfferedTuiAgent } from '../../../../shared/agent-launch/catalog/offered-tui-agents'
import { isTuiAgentEnabled } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import { hasExplicitTuiLaunchCommand } from '../../../../shared/agent-launch/startup/tui-agent-launch-command-override'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { repairOwnCodexHelper } from '../../../codex-cli/codex-helper-repair'
import { installedPinnedCodexRelease } from '../../../codex-cli/codex-managed-runtime'
import { codexCommandProblem } from '../../../codex-cli/whole-codex-command'
import { getProfileUserDataPath } from '../../../markov-profiles/profile-storage-paths'
import { guestNativePathEnv } from '../../../ipc/wsl-guest-windows-drive-path'
import '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter'
import { isAgentSessionPreSpawnError } from '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'
import { resolveStructuredAgentCommand } from '../../../native-chat/structured-agent-command-resolution'
import { onAgentsRefreshedOnHost } from '../../../preflight/workspace-agent-detection'
import type { RuntimeStore } from '../../runtime-store-contract'
import { resolveHostStructuredAgentLaunchEnvironment } from '../launch/structured-agent-launch-support'
import { managedRuntimeInstallationFor } from './managed-runtime-installations'

const RETRY_AFTER_FAILURE_MS = 30 * 60_000
/** How long a chat start waits for a running install before going on with what is there. */
const LAUNCH_WAIT_MS = 4 * 60_000
/** Every setting the decision reads. */
const UPKEEP_SETTINGS = [
  'agentCmdOverrides',
  'agentDefaultEnv',
  'disabledTuiAgents'
] as const satisfies readonly (keyof GlobalSettings)[]

type UpkeepRuntime = Parameters<typeof managedRuntimeInstallationFor>[1]

let installing: Promise<void> | null = null
let failedAt: number | null = null

export type CodexRuntimeUpkeepFacts = {
  /** Codex is offered and switched on in Agent settings. */
  enabled: boolean
  /** The user named their own Codex command; Markov runs exactly that. */
  explicitCommand: boolean
  /** A release is pinned for this platform. */
  pinned: boolean
  /** The host's own Codex, as a chat start would find it. */
  ownCodex: 'whole' | 'lacksHelper' | 'missing'
  /** Markov's pinned release is installed and whole. */
  managedCurrent: boolean
  /** An earlier attempt failed too recently to try again. */
  recentlyFailed: boolean
}

/** Markov's Codex is installed exactly when chats would otherwise start without a whole Codex. */
export function codexRuntimeUpkeepNeeded(facts: CodexRuntimeUpkeepFacts): boolean {
  return (
    facts.enabled &&
    !facts.explicitCommand &&
    facts.pinned &&
    facts.ownCodex !== 'whole' &&
    !facts.managedCurrent &&
    !facts.recentlyFailed
  )
}

/** Automated runs must not download a release behind a test's back. */
function upkeepSwitchedOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'test' ||
    Boolean(env.MARKOV_E2E_USER_DATA_DIR) ||
    env.MARKOV_DISABLE_CODEX_RUNTIME_UPKEEP === '1'
  )
}

async function ownCodex(
  settings: Parameters<typeof resolveStructuredAgentCommand>[1] &
    Parameters<typeof resolveHostStructuredAgentLaunchEnvironment>[1]
): Promise<{ state: CodexRuntimeUpkeepFacts['ownCodex']; command: string | null }> {
  const env = await resolveHostStructuredAgentLaunchEnvironment('codex', settings)
  const homePath = env.HOME ?? env.USERPROFILE
  try {
    const { command } = resolveStructuredAgentCommand('codex', settings, {
      pathEnv: guestNativePathEnv(env.PATH ?? env.Path ?? null),
      ...(homePath ? { homePath } : {})
    })
    return { state: codexCommandProblem(command) ?? 'whole', command }
  } catch (error) {
    if (isAgentSessionPreSpawnError(error)) {
      return { state: 'missing', command: null }
    }
    throw error
  }
}

/** Once Markov's release is installed, the host's own copy of that same build gets its helper too. */
async function repairOwnCodex(own: Awaited<ReturnType<typeof ownCodex>>): Promise<void> {
  const managed = installedPinnedCodexRelease(getProfileUserDataPath())
  if (own.state !== 'lacksHelper' || !own.command || !managed) {
    return
  }
  const repaired = await repairOwnCodexHelper({ ownCommand: own.command, managed }).catch(
    (error: unknown) => {
      console.warn(`[codex-runtime] helper not placed beside ${own.command}:`, error)
      return false
    }
  )
  if (repaired) {
    console.info(`[codex-runtime] placed the command helper beside ${own.command}`)
  }
}

async function keepCodexRuntimeReady(runtime: UpkeepRuntime): Promise<void> {
  if (installing) {
    return
  }
  const settings = runtime.requireStore().getSettings()
  const enabled =
    isOfferedTuiAgent('codex') && isTuiAgentEnabled('codex', settings.disabledTuiAgents)
  const explicitCommand = hasExplicitTuiLaunchCommand(settings, 'codex')
  if (!enabled || explicitCommand) {
    return
  }
  const installation = managedRuntimeInstallationFor('codex', runtime)
  const status = await installation.status()
  const own = await ownCodex(settings)
  const needed = codexRuntimeUpkeepNeeded({
    enabled,
    explicitCommand,
    pinned: status.available,
    ownCodex: own.state,
    managedCurrent: status.installedCurrent,
    recentlyFailed: failedAt !== null && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS
  })
  // A second caller may have started while the facts were read.
  if (installing) {
    return
  }
  if (!needed) {
    await repairOwnCodex(own)
    return
  }
  console.info('[codex-runtime] this host has no whole Codex; installing Markov’s own')
  installation.install()
  installing = installation
    .whenIdle()
    .then(() => installation.status(false))
    .then(({ operation }) => {
      failedAt = operation?.phase === 'succeeded' ? null : Date.now()
      console.info(`[codex-runtime] install ${operation?.phase ?? 'ended'}`, operation?.error ?? '')
      return operation?.phase === 'succeeded' ? repairOwnCodex(own) : undefined
    })
    .catch((error: unknown) => {
      failedAt = Date.now()
      console.warn('[codex-runtime] install state not read:', error)
    })
    .finally(() => {
      installing = null
    })
}

/** Checks at start, and again when the Codex found on this host or the settings that pick it change. */
export function installCodexRuntimeUpkeep(
  store: Pick<RuntimeStore, 'onSettingsChanged'> | null,
  runtime: UpkeepRuntime
): void {
  if (upkeepSwitchedOff()) {
    return
  }
  const check = (): void => {
    void keepCodexRuntimeReady(runtime).catch((error: unknown) => {
      console.warn('[codex-runtime] upkeep check failed:', error)
    })
  }
  store?.onSettingsChanged?.((updates) => {
    if (UPKEEP_SETTINGS.some((key) => key in updates)) {
      check()
    }
  })
  onAgentsRefreshedOnHost(check)
  check()
}

/** A chat started while Markov's Codex is still installing waits for it, up to a limit. */
export async function codexRuntimeInstallSettled(): Promise<void> {
  const running = installing
  if (!running) {
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    running,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LAUNCH_WAIT_MS)
      timer.unref?.()
    })
  ])
  clearTimeout(timer)
}
