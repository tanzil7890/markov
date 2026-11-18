// One installation per agent on this host, shared by the install methods and by the upkeep that
// installs Markov's Codex on its own.

import { isAbsolute } from 'node:path'
import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import { acpLaunchSpecFor } from '../../../acp/acp-launch-specs'
import { resolveAcpLaunchCommand } from '../../../acp/acp-structured-launch-resolution'
import { CODEX_MANAGED_RUNTIME } from '../../../codex-cli/codex-managed-runtime'
import { resolveCodexChatCommand } from '../../../codex/structured/launch/codex-chat-command'
import { getProfileUserDataPath } from '../../../markov-profiles/profile-storage-paths'
import '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter'
import { isAgentSessionPreSpawnError } from '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'
import {
  ManagedRuntimeInstallation,
  type ManagedRuntimeInstallationDeps
} from '../../../node-runtime/managed-runtime-installation'
import type { ManagedRuntime } from '../../../node-runtime/managed-runtime-release'
import type { MarkovRuntimeService } from '../../markov-runtime'
import { resolveHostStructuredAgentLaunchEnvironment } from '../launch/structured-agent-launch-support'
import { stopStructuredAgentChats } from '../lifecycle/structured-agent-chat-stop'

type InstallRuntime = Pick<MarkovRuntimeService, 'requireStore'>
type RuntimeHost = Pick<ManagedRuntimeInstallationDeps, 'findExternal' | 'fence'> & {
  managedRuntime: ManagedRuntime
}

const installations = new Map<string, ManagedRuntimeInstallation>()

/** An unrunnable Command setting refuses start; it is not an external runtime copy. */
async function foundOutside(resolve: () => Promise<boolean>): Promise<boolean> {
  try {
    return await resolve()
  } catch (error) {
    if (isAgentSessionPreSpawnError(error)) {
      return false
    }
    throw error
  }
}

function codexRuntimeHost(runtime: InstallRuntime, dataDirectory: string): RuntimeHost {
  const releases = CODEX_MANAGED_RUNTIME.root(dataDirectory)
  return {
    managedRuntime: CODEX_MANAGED_RUNTIME,
    // Use the launch's own lookup: a copy counts as outside when a chat start would run it.
    findExternal: () =>
      foundOutside(async () => {
        const settings = runtime.requireStore().getSettings()
        const env = await resolveHostStructuredAgentLaunchEnvironment('codex', settings)
        const homePath = env.HOME ?? env.USERPROFILE
        const { command } = resolveCodexChatCommand(settings, {
          pathEnv: env.PATH ?? env.Path ?? null,
          ...(homePath ? { homePath } : {})
        })
        return isAbsolute(command) && !isPathInsideOrEqual(releases, command)
      }),
    // No launch gate: chats are stopped first, and a start during removal fails as a missing program.
    fence: async (work) => {
      await stopStructuredAgentChats('codex', CODEX_MANAGED_RUNTIME.label)
      await work()
    }
  }
}

function acpRuntimeHost(
  agent: string,
  runtime: InstallRuntime,
  dataDirectory: string
): RuntimeHost {
  const spec = acpLaunchSpecFor(agent)
  if (!spec?.managedRuntime) {
    throw new Error(`Markov installs no runtime for ${agent}.`)
  }
  const { launchGate, managedRuntime } = spec
  const releases = managedRuntime.root(dataDirectory)
  return {
    managedRuntime,
    // Use the launch's own lookup to find external runtimes.
    findExternal: () =>
      foundOutside(async () => {
        const settings = runtime.requireStore().getSettings()
        const env = {
          ...(await resolveHostStructuredAgentLaunchEnvironment(agent, settings)),
          ...spec.env
        }
        const { command } = resolveAcpLaunchCommand(spec, env, {
          commandSettings: settings,
          dataDirectory
        })
        return command !== spec.command && !isPathInsideOrEqual(releases, command)
      }),
    // Chats, starts, copies, sign-ins and children not proven gone all hold the gate's fence.
    fence: (work) =>
      launchGate
        ? launchGate.run(() => stopStructuredAgentChats(agent, managedRuntime.label), work)
        : Promise.reject(new Error(`${managedRuntime.label} cannot be removed on this host.`))
  }
}

export function managedRuntimeInstallationFor(
  agent: string,
  runtime: InstallRuntime
): ManagedRuntimeInstallation {
  const existing = installations.get(agent)
  if (existing) {
    return existing
  }
  // The chat host's own state root, where its launches look.
  const dataDirectory = getProfileUserDataPath()
  const { managedRuntime, ...deps } =
    agent === 'codex'
      ? codexRuntimeHost(runtime, dataDirectory)
      : acpRuntimeHost(agent, runtime, dataDirectory)
  const installation = new ManagedRuntimeInstallation(agent, managedRuntime, {
    dataDirectory,
    ...deps
  })
  installations.set(agent, installation)
  return installation
}
