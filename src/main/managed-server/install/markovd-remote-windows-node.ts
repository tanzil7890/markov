// SSH DefaultShell may be cmd.exe or PowerShell; commands must parse identically in both.
import { currentMarkovdFence } from '../activation/markovd-activation-fence-scope'
import { MARKOVD_WINDOWS_FENCE_ARG } from '../host-state/markovd-windows-host-fence-ops'
import {
  MARKOVD_NODE_RUNTIME_DIR_PREFIX,
  MARKOVD_NODE_RUNTIME_WINDOWS_EXECUTABLE,
  MARKOVD_RUNTIMES_DIRNAME
} from '../../../shared/markovd-artifacts'
import { pinnedNodeRuntimeAsset, type NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { randomUUID } from 'node:crypto'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { RELAY_REMOTE_DIR } from '../../ssh/remote-exec/remote-frame-protocol'
import {
  joinRemotePath,
  remoteDirname,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import { quotePowerShellLiteral as powerShellLiteral } from '../../../shared/powershell-native-argument'
import { MARKOVD_WINDOWS_COMMAND_LINE_UNSAFE_CODE } from '../../markovd/markovd-host-unavailable'
import {
  MARKOVD_WINDOWS_HOST_SCRIPT,
  MARKOVD_WINDOWS_HOST_SCRIPT_FILENAME,
  MARKOVD_WINDOWS_HOST_SCRIPT_PRESENT,
  type MarkovdWindowsHostOp
} from '../host-state/markovd-windows-host-script'

const BARE_EXECUTABLE = /^[A-Za-z]:\\[A-Za-z0-9._+~\\-]*$/u
// Leading digits are quoted: PowerShell would read `1e5` as a number and pass `100000`.
const BARE_ARGUMENT = /^[A-Za-z-][A-Za-z0-9._:+=/\\-]*$/u
// cmd.exe expands %; PowerShell expands $, backticks and typographic quotes inside double quotes.
const UNQUOTABLE = /["%$`\r\n\u201C\u201D\u201E\u2018\u2019\u201A\u201B]/u

export class MarkovdWindowsCommandLineError extends Error {
  readonly code = MARKOVD_WINDOWS_COMMAND_LINE_UNSAFE_CODE
  constructor(value: string) {
    super(
      `Markov cannot pass ${JSON.stringify(value)} to node.exe on this Windows host: it contains ` +
        'a character cmd.exe or PowerShell would expand.'
    )
    this.name = 'MarkovdWindowsCommandLineError'
  }
}

function windowsPath(value: string): string {
  return value.replace(/\//gu, '\\')
}

function quotedArgument(value: string): string {
  if (BARE_ARGUMENT.test(value)) {
    return value
  }
  // A trailing backslash would escape the closing quote for CommandLineToArgvW.
  if (value === '' || UNQUOTABLE.test(value) || value.endsWith('\\')) {
    throw new MarkovdWindowsCommandLineError(value)
  }
  return `"${value}"`
}

export function markovdWindowsNodeCommandLine(executable: string, args: readonly string[]): string {
  const program = windowsPath(executable)
  const argv = args.map(quotedArgument)
  if (BARE_EXECUTABLE.test(program)) {
    return [program, ...argv].join(' ')
  }
  // The inner line is single-quoted PowerShell inside one double-quoted argument both shells keep.
  for (const value of [program, ...args]) {
    if (UNQUOTABLE.test(value)) {
      throw new MarkovdWindowsCommandLineError(value)
    }
  }
  const inner = ['&', ...[program, ...args].map(powerShellLiteral)].join(' ')
  return `powershell.exe -NoProfile -NonInteractive -Command "${inner}"`
}

export function markovdRemoteBaseDir(host: RemoteHostPlatform, remoteHome: string): string {
  return joinRemotePath(host, remoteHome, RELAY_REMOTE_DIR)
}

export function markovdWindowsBaseDir(host: RemoteHostPlatform, slotDir: string): string {
  return remoteDirname(slotDir.replace(/\/+$/u, ''), host)
}

export function markovdWindowsPinnedNodePath(host: RemoteHostPlatform, baseDir: string): string {
  const target: NodeRuntimeTarget = host.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'
  return joinRemotePath(
    host,
    baseDir,
    MARKOVD_RUNTIMES_DIRNAME,
    `${MARKOVD_NODE_RUNTIME_DIR_PREFIX}${pinnedNodeRuntimeAsset(target).executableSha256}`,
    MARKOVD_NODE_RUNTIME_WINDOWS_EXECUTABLE
  )
}

function markovdWindowsHostScriptPath(host: RemoteHostPlatform, baseDir: string): string {
  return joinRemotePath(host, baseDir, MARKOVD_WINDOWS_HOST_SCRIPT_FILENAME)
}

export function markovdWindowsHostOpCommand(
  host: RemoteHostPlatform,
  baseDir: string,
  op: MarkovdWindowsHostOp,
  args: readonly string[]
): string {
  const fence = currentMarkovdFence()
  return markovdWindowsNodeCommandLine(markovdWindowsPinnedNodePath(host, baseDir), [
    markovdWindowsHostScriptPath(host, baseDir),
    ...(fence ? [MARKOVD_WINDOWS_FENCE_ARG, fence.lockDir, fence.token] : []),
    op,
    ...args
  ])
}

export function markovdWindowsSlotOpCommand(
  host: RemoteHostPlatform,
  slotDir: string,
  op: MarkovdWindowsHostOp,
  args: readonly string[]
): string {
  return markovdWindowsHostOpCommand(host, markovdWindowsBaseDir(host, slotDir), op, args)
}

export function markovdWindowsHomeOpCommand(
  host: RemoteHostPlatform,
  remoteHome: string,
  op: MarkovdWindowsHostOp,
  args: readonly string[]
): string {
  return markovdWindowsHostOpCommand(host, markovdRemoteBaseDir(host, remoteHome), op, args)
}

const stagedHostScripts = new WeakMap<MarkovdHostTransport, Set<string>>()

/** Content-addressed scripts publish atomically so concurrent readers never see truncated code. */
export async function installMarkovdWindowsHostScript(
  target: { conn: MarkovdHostTransport; host: RemoteHostPlatform; signal?: AbortSignal },
  baseDir: string
): Promise<void> {
  const scriptPath = markovdWindowsHostScriptPath(target.host, baseDir)
  const staged = stagedHostScripts.get(target.conn) ?? new Set<string>()
  stagedHostScripts.set(target.conn, staged)
  if (staged.has(scriptPath)) {
    return
  }
  // Run staged host-script ops rather than inline code.
  const runOp = async (
    script: string,
    op: MarkovdWindowsHostOp,
    args: string[]
  ): Promise<boolean> => {
    const command = markovdWindowsNodeCommandLine(
      markovdWindowsPinnedNodePath(target.host, baseDir),
      [script, op, ...args]
    )
    const answer = await execCommand(target.conn, command, {
      wrapCommand: false,
      signal: target.signal
    }).catch((error: unknown) => {
      if (isUnconfirmedSshCommandTermination(error)) {
        throw error
      }
      return ''
    })
    return answer.trim().split(/\r?\n/u).at(-1) === MARKOVD_WINDOWS_HOST_SCRIPT_PRESENT
  }
  if (!(await runOp(scriptPath, 'script-present', []))) {
    const partial = `${scriptPath}.${randomUUID()}.partial`
    await target.conn.writeFile(partial, MARKOVD_WINDOWS_HOST_SCRIPT, {
      hostPlatform: target.host,
      signal: target.signal
    })
    if (!(await runOp(partial, 'script-install', [scriptPath]))) {
      throw new Error(`Could not stage the markovd host script at ${scriptPath}.`)
    }
  }
  staged.add(scriptPath)
}

export function readMarkovdWindowsEncodedAnswer(output: string, marker: string): string | null {
  const line = output
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .findLast((candidate) => candidate === marker || candidate.startsWith(`${marker} `))
  if (line === undefined) {
    return null
  }
  const encoded = line.slice(marker.length).trim()
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
    return null
  }
  return Buffer.from(encoded, 'base64').toString('utf8')
}
