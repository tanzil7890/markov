import type { ProcessSpec } from '@markov/process-host/process-spec'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RunProcessModule from '@markov/process-host'

const { runProcessMock, spawnProcessMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  spawnProcessMock: vi.fn()
}))

vi.mock('@markov/process-host', async (importOriginal) => ({
  ...(await importOriginal<typeof RunProcessModule>()),
  runProcess: runProcessMock,
  spawnProcess: spawnProcessMock
}))

// Real macOS installs would register a park in the developer’s home.
vi.mock('./markovd-browser-install-park', () => ({ openMarkovdBrowserInstallPark: () => null }))

import {
  resolveMarkovdBrowserProvider,
  type MarkovdBrowserProvider
} from './markovd-browser-provider'
import { agentBrowserCommandOf } from '../browser/agent-browser/agent-browser-bridge-test-harness'

const FAKE_SIDECAR = join(import.meta.dirname, '__fixtures__', 'fake-markovd-electron-sidecar.cjs')
const INSTALLED_EXECUTABLE = join('/Applications', 'Markov.app', 'Contents', 'MacOS', 'Markov')

let harnessRoot: string
let controlPath: string
let chromiumExecutable: string
let sidecarMode: string | undefined
let provider: MarkovdBrowserProvider | null

function agentBrowserSuccess(data: unknown) {
  return Promise.resolve({
    code: 0,
    signal: null,
    stdout: JSON.stringify({ success: true, data, error: null }),
    stderr: '',
    timedOut: false
  })
}

beforeEach(async () => {
  harnessRoot = await mkdtemp(join(tmpdir(), 'markovd-provider-selection-'))
  controlPath = join(harnessRoot, 'control.json')
  chromiumExecutable = join(harnessRoot, process.platform === 'win32' ? 'chromium.exe' : 'chromium')
  sidecarMode = undefined
  provider = null
  await writeFile(controlPath, '{}')
  await writeFile(chromiumExecutable, '')
  if (process.platform !== 'win32') {
    await chmod(chromiumExecutable, 0o755)
  }

  const actual = await vi.importActual<typeof RunProcessModule>('@markov/process-host')
  spawnProcessMock.mockReset()
  spawnProcessMock.mockImplementation((spec: ProcessSpec) =>
    actual.spawnProcess({
      ...spec,
      program: process.execPath,
      args: [FAKE_SIDECAR, ...(spec.args ?? [])],
      env: {
        ...spec.env,
        MARKOV_FAKE_SIDECAR_CONTROL: controlPath,
        ...(sidecarMode ? { MARKOV_FAKE_SIDECAR_MODE: sidecarMode } : {})
      }
    })
  )
  runProcessMock.mockReset()
  runProcessMock.mockImplementation(async (spec: ProcessSpec) => {
    const command = agentBrowserCommandOf(spec.args ?? [], spec.input)
    if (command[0] === 'open') {
      return agentBrowserSuccess({ url: 'about:blank', title: '' })
    }
    if (command[0] === 'tab') {
      return agentBrowserSuccess({
        tabs: [{ active: true, tabId: 't1', title: '', url: 'about:blank' }]
      })
    }
    if (command[0] === 'close') {
      return agentBrowserSuccess({ closed: true })
    }
    throw new Error(`Unexpected agent-browser command: ${command.join(' ')}`)
  })
})

afterEach(async () => {
  await provider?.stop()
  vi.restoreAllMocks()
  await rm(harnessRoot, { recursive: true, force: true })
})

describe('resolveMarkovdBrowserProvider Electron preference', () => {
  it('falls back to the operator Chromium when the installed Electron app cannot start', async () => {
    sidecarMode = 'exit-before-ready'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    provider = await resolveMarkovdBrowserProvider({
      userDataPath: join(harnessRoot, 'state'),
      environment: { MARKOV_BROWSER_EXECUTABLE: chromiumExecutable },
      resolveInstalledElectronExecutable: async () => INSTALLED_EXECUTABLE,
      resolveAgentBrowserBinary: () => '/agent-browser'
    })

    expect(spawnProcessMock).toHaveBeenCalled()
    expect(provider?.kind).toBe('chromium')
    expect(warn).toHaveBeenCalledWith(
      '[markovd] Installed Electron browser provider unavailable:',
      expect.anything()
    )
  })
})
