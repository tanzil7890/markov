// Run app-side to keep materializers out of the CLI bundle. Prefer a userData markovd slot;
// unsupported packaging/runtime/native conditions fall back to Electron with a diagnostic.
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runProcess } from '@markov/process-host'
import { NODE_RUNTIME_ASSETS, type ServerTarget } from '../../shared/node-runtime-pin'
import {
  MARKOVD_SERVER_ENTRY_FILENAME,
  MARKOVD_VERSION_FILENAME,
  markovdNodeRuntimeRelativePath
} from '../../shared/markovd-artifacts'
import {
  MARKOVD_NATIVE_PREFLIGHT_FLAG,
  parseMarkovdNativePreflightReport
} from '../../shared/markovd-native-preflight-report'
import {
  SERVE_RUNTIME_ELECTRON,
  SERVE_RUNTIME_ENV,
  type ServeRuntimeSelection
} from '../../shared/markovd-local-serve-selection'
import { resolveBundledMarkovdRuntime } from './markovd-bundled-runtime'
import { detectNativeHostAbi, nativeSlotName } from './native-host-abi'
import { materializeMarkovdArtifact } from './markovd-artifact-materializer'
import { materializeCachedNodeRuntime } from '../node-runtime/pinned-runtime-materializer'
import {
  copyVerifiedAppImageNodeRuntime,
  type AppImageNodeRuntime
} from '../node-runtime/appimage-bundled-node-runtime'
import { serveProfileHasSshTargets } from './serve-profile-ssh-targets'
import { errorMessage } from '../../shared/error-message'

const NATIVE_PREFLIGHT_TIMEOUT_MS = 30_000

export type ServeRuntimeSelectionInput = {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  userDataPath: string
  templateDirs: readonly string[]
  hostTarget?: () => string
  materializeSlot?: typeof materializeMarkovdArtifact
  materializeRuntime?: typeof materializeCachedNodeRuntime
  /** Try the AppImage’s pinned Node before downloading. */
  bundledNodeRuntime?: AppImageNodeRuntime | null
  nativePreflight?: (runtime: string, entry: string) => Promise<string>
  profileHasSshTargets?: (userDataPath: string) => boolean
}

function isServerTarget(value: string): value is ServerTarget {
  return Object.keys(NODE_RUNTIME_ASSETS).includes(value)
}

function electron(reason: string): ServeRuntimeSelection {
  return { kind: 'electron', reason }
}

export async function selectServeRuntime(
  input: ServeRuntimeSelectionInput
): Promise<ServeRuntimeSelection> {
  const requested = input.env[SERVE_RUNTIME_ENV]
  if (requested === SERVE_RUNTIME_ELECTRON) {
    return { kind: 'electron', reason: null }
  }
  if (requested && requested !== 'markovd') {
    return electron(`${SERVE_RUNTIME_ENV}=${requested} is neither markovd nor electron`)
  }
  // Default to Electron for SSH targets until markovd supports them; explicit markovd selection overrides.
  const sshReason = requested ? null : profileSshReason(input)
  if (sshReason) {
    return electron(sshReason)
  }
  const target = (input.hostTarget ?? (() => nativeSlotName(detectNativeHostAbi())))()
  if (!isServerTarget(target)) {
    return electron(`no markovd build exists for this host (${target})`)
  }
  const templateDir = input.templateDirs.find((candidate) => existsSync(candidate))
  if (!templateDir) {
    return electron('this Markov install carries no markovd template')
  }
  const cacheRoot = join(input.userDataPath, 'markovd-artifacts')
  let slotDir: string
  try {
    slotDir = await (input.materializeSlot ?? materializeMarkovdArtifact)(target, {
      templateDir,
      cacheRoot
    })
    await placeSlotRuntime(slotDir, target, cacheRoot, input)
  } catch (error) {
    return electron(`the markovd slot for ${target} could not be prepared: ${errorMessage(error)}`)
  }
  let runtime: string | null
  try {
    runtime = resolveBundledMarkovdRuntime(slotDir)
  } catch (error) {
    return electron(`the markovd slot is incomplete: ${errorMessage(error)}`)
  }
  if (!runtime) {
    return electron('the markovd slot names no pinned runtime')
  }
  const entry = join(slotDir, MARKOVD_SERVER_ENTRY_FILENAME)
  const report = parseMarkovdNativePreflightReport(
    await (input.nativePreflight ?? runNativePreflight)(runtime, entry).catch(() => '')
  )
  if (!report) {
    return electron('markovd did not answer its native preflight')
  }
  if (report.status === 'blocked' || report.status === 'degraded') {
    return electron(
      `markovd cannot run terminals here (${report.status}: ${report.reason ?? 'unknown'})`
    )
  }
  return {
    kind: 'markovd',
    runtime,
    entry,
    version: readFileSync(join(slotDir, MARKOVD_VERSION_FILENAME), 'utf8').trim()
  }
}

function profileSshReason(input: ServeRuntimeSelectionInput): string | null {
  try {
    return (input.profileHasSshTargets ?? serveProfileHasSshTargets)(input.userDataPath)
      ? 'this profile has SSH targets, which markovd cannot serve yet'
      : null
  } catch (error) {
    // Unknown/old-schema profiles may contain saved SSH targets; preserve Electron reachability.
    return `could not tell whether this profile has SSH targets, which markovd cannot serve yet (${errorMessage(error)})`
  }
}

async function placeSlotRuntime(
  slotDir: string,
  target: ServerTarget,
  cacheRoot: string,
  {
    materializeRuntime = materializeCachedNodeRuntime,
    bundledNodeRuntime
  }: Pick<ServeRuntimeSelectionInput, 'materializeRuntime' | 'bundledNodeRuntime'>
): Promise<void> {
  const destination = join(
    slotDir,
    ...markovdNodeRuntimeRelativePath(target, NODE_RUNTIME_ASSETS[target].executableSha256)
  )
  if (existsSync(destination)) {
    return
  }
  if (bundledNodeRuntime?.target === target) {
    try {
      await copyVerifiedAppImageNodeRuntime(bundledNodeRuntime, destination)
      return
    } catch (error) {
      console.error(`markov serve: not using the bundled Node (${errorMessage(error)})`)
    }
  }
  const cached = await materializeRuntime(target, cacheRoot, { fetcher: fetch })
  mkdirSync(dirname(destination), { recursive: true })
  try {
    linkSync(cached, destination)
  } catch {
    copyFileSync(cached, destination)
    chmodSync(destination, 0o755)
  }
}

async function runNativePreflight(runtime: string, entry: string): Promise<string> {
  const result = await runProcess({
    program: runtime,
    args: [entry, MARKOVD_NATIVE_PREFLIGHT_FLAG],
    timeoutMs: NATIVE_PREFLIGHT_TIMEOUT_MS
  })
  return result.stdout
}
