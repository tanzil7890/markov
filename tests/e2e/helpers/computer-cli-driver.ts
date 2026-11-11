import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createElectronHomeIsolation } from './electron-home-isolation'

const execFileAsync = promisify(execFile)
const RUNTIME_METADATA_FILE = 'markov-runtime.json'
let markovDevUserDataPath: string | null = null
let markovServeProcess: ChildProcess | null = null
let markovServeStdout = ''
let markovServeStderr = ''

export type CliResult = {
  stdout: string
  stderr: string
}

type RunMarkovCliOptions = {
  retryMissingRuntimeMetadata?: boolean
}

export async function runMarkovCli(
  args: string[],
  options: RunMarkovCliOptions = {}
): Promise<CliResult> {
  try {
    return await runMarkovCliOnce(args)
  } catch (error) {
    if (
      options.retryMissingRuntimeMetadata !== false &&
      isMissingRuntimeMetadataError(args, error)
    ) {
      // Windows can lose the dev runtime while launching the fixture app; reopen once before the desktop action.
      await ensureMarkovRuntimeLaunched()
      return await runMarkovCliOnce(args)
    }
    throw error
  }
}

async function runMarkovCliOnce(args: string[]): Promise<CliResult> {
  const devCli = join(process.cwd(), 'config/scripts/development/launch/markov-dev.mjs')
  const command = process.env.MARKOV_COMPUTER_CLI ?? process.execPath
  const cliArgs = process.env.MARKOV_COMPUTER_CLI ? args : [devCli, ...args]
  const env = process.env.MARKOV_COMPUTER_CLI
    ? { ...process.env }
    : await createComputerE2ERuntimeEnv()
  try {
    const result = await execFileAsync(command, cliArgs, {
      env,
      maxBuffer: 20 * 1024 * 1024
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const output = error as { message: string; stdout: string; stderr: string }
      throw new Error(`${output.message}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`)
    }
    throw error
  }
}

export async function ensureMarkovRuntimeLaunched(): Promise<void> {
  if (!process.env.MARKOV_COMPUTER_CLI && process.platform === 'win32') {
    await ensureMarkovRuntimeServed()
    return
  }
  await runMarkovCli(['open', '--json'], { retryMissingRuntimeMetadata: false })
  await waitForMarkovRuntimeReady()
}

export async function stopMarkovRuntime(): Promise<void> {
  const processToStop = markovServeProcess
  if (!processToStop?.pid) {
    return
  }
  markovServeProcess = null
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(processToStop.pid), '/T', '/F'])
    } catch {
      // The foreground test runtime may already have exited.
    }
    return
  }
  processToStop.kill()
}

export function parseJsonOutput<T>(stdout: string): T {
  return JSON.parse(stdout) as T
}

async function getComputerE2eMarkovDevUserDataPath(): Promise<string> {
  if (!markovDevUserDataPath) {
    // Use a fresh profile so a retained dev runtime cannot execute stale provider code.
    markovDevUserDataPath = await mkdtemp(join(tmpdir(), 'markov-computer-runtime-'))
  }
  return markovDevUserDataPath
}

async function waitForMarkovRuntimeReady(): Promise<void> {
  const userDataPath = await getComputerE2eMarkovDevUserDataPath()
  const metadataPath = join(userDataPath, RUNTIME_METADATA_FILE)
  const deadline = Date.now() + 15000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      await access(metadataPath)
      const status = parseJsonOutput<{
        result: { runtime: { reachable: boolean } }
      }>((await runMarkovCli(['status', '--json'], { retryMissingRuntimeMetadata: false })).stdout)
      if (status.result.runtime.reachable) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  const detail = [
    lastError instanceof Error ? `Last error: ${lastError.message}` : null,
    markovServeStdout.trim() ? `serve stdout: ${markovServeStdout.trim()}` : null,
    markovServeStderr.trim() ? `serve stderr: ${markovServeStderr.trim()}` : null
  ]
    .filter(Boolean)
    .join(' ')
  throw new Error(`Markov runtime metadata was not ready at ${metadataPath}.${detail}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureMarkovRuntimeServed(): Promise<void> {
  if (!markovServeProcess || markovServeProcess.exitCode !== null) {
    const devCli = join(process.cwd(), 'config/scripts/development/launch/markov-dev.mjs')
    const env = await createComputerE2ERuntimeEnv()
    markovServeStdout = ''
    markovServeStderr = ''
    markovServeProcess = spawn(process.execPath, [devCli, 'serve', '--no-pairing', '--json'], {
      env,
      windowsHide: true
    })
    markovServeProcess.stdout?.on('data', (chunk) => {
      markovServeStdout += String(chunk)
    })
    markovServeProcess.stderr?.on('data', (chunk) => {
      markovServeStderr += String(chunk)
    })
    markovServeProcess.once('exit', () => {
      markovServeProcess = null
    })
    process.once('exit', () => {
      markovServeProcess?.kill()
    })
  }
  await waitForMarkovRuntimeReady()
}

async function createComputerE2ERuntimeEnv(): Promise<NodeJS.ProcessEnv> {
  const userDataDir =
    process.env.MARKOV_DEV_USER_DATA_PATH ?? (await getComputerE2eMarkovDevUserDataPath())
  // Strip ELECTRON_RUN_AS_NODE or the Electron child runs as plain Node.
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...inheritedEnv } = process.env
  void _electronRunAsNode
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: {},
    userDataDir
  })
  return {
    ...isolation.env,
    // Keep CLI and Electron on the same runtime metadata while fixture HOME/Codex isolation remains in force.
    MARKOV_DEV_USER_DATA_PATH: userDataDir
  }
}

function isMissingRuntimeMetadataError(args: string[], error: unknown): boolean {
  if (args[0] !== 'computer') {
    return false
  }
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false
  }
  const message = String((error as { message?: unknown }).message)
  return (
    message.includes('"code": "runtime_unavailable"') &&
    message.includes('Could not read Markov runtime metadata')
  )
}
