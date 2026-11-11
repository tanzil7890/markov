import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ServeMarkovdLaunch from './serve-markovd-launch'

const { spawnMock, resolveLocalServeRuntimeMock, serveWithMarkovdMock, refuseIfProfileServedMock } =
  vi.hoisted(() => ({
    spawnMock: vi.fn(),
    resolveLocalServeRuntimeMock: vi.fn(),
    serveWithMarkovdMock: vi.fn(),
    refuseIfProfileServedMock: vi.fn()
  }))

vi.mock('child_process', () => ({ spawn: spawnMock, spawnSync: vi.fn() }))
// Isolate host selection from the preflight that reads this machine’s profile.
vi.mock('./serve-electron-preflight', () => ({
  preflightElectronServe: () => null,
  recordElectronServeStartupAbort: vi.fn(),
  refuseIfProfileServed: refuseIfProfileServedMock
}))
vi.mock('./serve-markovd-launch', async (importOriginal) => ({
  ...(await importOriginal<typeof ServeMarkovdLaunch>()),
  resolveLocalServeRuntime: resolveLocalServeRuntimeMock,
  serveWithMarkovd: serveWithMarkovdMock
}))

import { serveMarkovApp } from './launch'
import { speechRecognizerPackageName } from '../../shared/speech-recognizer-package'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  kill = vi.fn()
  unref = vi.fn()
  pid = 4101
}

function electronChild(): void {
  spawnMock.mockImplementation(() => {
    const child = new FakeChildProcess()
    setTimeout(() => child.emit('exit', 0, null), 0)
    return child
  })
}

describe('markov serve host selection', () => {
  let stderr: string[]

  beforeEach(() => {
    spawnMock.mockReset()
    resolveLocalServeRuntimeMock.mockReset()
    serveWithMarkovdMock.mockReset()
    process.env.MARKOV_APP_EXECUTABLE = '/opt/markov/markov-ide'
    stderr = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.MARKOV_APP_EXECUTABLE
    delete process.env.MARKOV_SERVE_RUNTIME
    delete process.env.MARKOV_USER_DATA_PATH
    delete process.env.MARKOV_DEV_USER_DATA_PATH
    delete process.env.MARKOV_APP_EXECUTABLE_NEEDS_APP_ROOT
  })

  it('checks for a live peer before markovd only when supervised, so the brake never counts it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markov-serve-markovd-supervise-'))
    try {
      process.env.MARKOV_APP_EXECUTABLE = join(root, 'markov')
      await writeFile(process.env.MARKOV_APP_EXECUTABLE, '')
      process.env.MARKOV_USER_DATA_PATH = join(root, 'profile')
      const selection = {
        kind: 'markovd',
        runtime: '/node',
        entry: '/slot/markovd.js',
        version: '1'
      }
      resolveLocalServeRuntimeMock.mockResolvedValue(selection)
      serveWithMarkovdMock.mockResolvedValue(0)

      refuseIfProfileServedMock.mockReturnValue(null)
      await expect(serveMarkovApp({})).resolves.toBe(0)
      expect(refuseIfProfileServedMock).not.toHaveBeenCalled()

      refuseIfProfileServedMock.mockImplementation(async () => {
        setTimeout(() => process.emit('SIGTERM', 'SIGTERM'), 20)
        return 3
      })
      serveWithMarkovdMock.mockClear()
      await expect(serveMarkovApp({ supervise: true })).resolves.toBe(0)
      expect(serveWithMarkovdMock).not.toHaveBeenCalled()
      expect(stderr.join('')).toContain('Another Markov serves this profile')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("serves on markovd by default, handing it the app's browser client", async () => {
    const appRoot = await mkdtemp(join(tmpdir(), 'markov-serve-markovd-web-'))
    try {
      await mkdir(join(appRoot, 'out', 'web'), { recursive: true })
      await writeFile(join(appRoot, 'out', 'web', 'web-index.html'), '<html></html>')
      const recognizer = speechRecognizerPackageName(process.platform, process.arch)
      await mkdir(join(appRoot, 'node_modules', recognizer), { recursive: true })
      await writeFile(join(appRoot, 'node_modules', recognizer, 'sherpa-onnx.node'), '')
      process.env.MARKOV_SERVE_SUPERVISOR_APP_ROOT = appRoot
      const selection = {
        kind: 'markovd',
        runtime: '/node',
        entry: '/slot/markovd.js',
        version: '1'
      }
      resolveLocalServeRuntimeMock.mockResolvedValue(selection)
      serveWithMarkovdMock.mockResolvedValue(0)

      await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
      expect(serveWithMarkovdMock).toHaveBeenCalledWith(
        selection,
        { json: true },
        expect.any(String),
        expect.not.objectContaining({ ELECTRON_RUN_AS_NODE: expect.anything() }),
        join(appRoot, 'out', 'web'),
        process.platform === 'win32' ? undefined : join(appRoot, 'node_modules', recognizer)
      )
      expect(spawnMock).not.toHaveBeenCalled()
      expect(stderr.join('')).toContain('[serve] running on markovd 1')
    } finally {
      delete process.env.MARKOV_SERVE_SUPERVISOR_APP_ROOT
      await rm(appRoot, { recursive: true, force: true })
    }
  })

  it('falls back to Electron and prints why when markovd cannot serve', async () => {
    resolveLocalServeRuntimeMock.mockResolvedValue({ kind: 'electron', reason: 'no template' })
    electronChild()

    await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
    expect(spawnMock).toHaveBeenCalledWith(
      '/opt/markov/markov-ide',
      expect.arrayContaining(['--serve', '--serve-json']),
      expect.any(Object)
    )
    expect(stderr.join('')).toContain('[serve] using Electron serve: no template')
  })

  it('keeps Electron without asking markovd when MARKOV_SERVE_RUNTIME=electron', async () => {
    process.env.MARKOV_SERVE_RUNTIME = 'electron'
    electronChild()

    await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
    expect(resolveLocalServeRuntimeMock).not.toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalledOnce()
    expect(stderr.join('')).not.toContain('[serve]')
  })

  describe('serves the profile it selected on', () => {
    function electronSpawn(): { args: string[]; env: NodeJS.ProcessEnv } {
      const [, args, options] = spawnMock.mock.calls[0]
      return { args, env: options.env }
    }

    it('starts the Electron fallback on MARKOV_USER_DATA_PATH, not the default profile', async () => {
      const profile = resolve('/isolated/profile-r')
      process.env.MARKOV_USER_DATA_PATH = profile
      resolveLocalServeRuntimeMock.mockResolvedValue({ kind: 'electron', reason: 'ssh targets' })
      electronChild()

      await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
      expect(resolveLocalServeRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({ userDataPath: profile })
      )
      const child = electronSpawn()
      expect(child.args).toContain(`--user-data-dir=${profile}`)
      expect(child.env).toMatchObject({
        MARKOV_USER_DATA_PATH: profile,
        MARKOV_SERVE_USER_DATA_PATH: profile
      })
    })

    it('pins the opt-out Electron serve to the same profile', async () => {
      const profile = resolve('/isolated/profile-e')
      process.env.MARKOV_USER_DATA_PATH = profile
      process.env.MARKOV_SERVE_RUNTIME = 'electron'
      electronChild()

      await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
      expect(electronSpawn().args).toContain(`--user-data-dir=${profile}`)
    })

    it('hands markovd the absolute profile the selector read', async () => {
      process.env.MARKOV_USER_DATA_PATH = join('relative', 'profile')
      const selection = {
        kind: 'markovd',
        runtime: '/node',
        entry: '/slot/markovd.js',
        version: '1'
      }
      resolveLocalServeRuntimeMock.mockResolvedValue(selection)
      serveWithMarkovdMock.mockResolvedValue(0)

      await expect(serveMarkovApp({})).resolves.toBe(0)
      const profile = resolve('relative', 'profile')
      expect(resolveLocalServeRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({ userDataPath: profile })
      )
      expect(serveWithMarkovdMock.mock.calls[0]?.slice(0, 4)).toEqual([
        selection,
        {},
        profile,
        expect.any(Object)
      ])
    })

    it('uses MARKOV_DEV_USER_DATA_PATH for both the selector and a dev Electron child', async () => {
      const profile = resolve('/isolated/dev-profile')
      delete process.env.MARKOV_USER_DATA_PATH
      process.env.MARKOV_DEV_USER_DATA_PATH = profile
      process.env.MARKOV_APP_EXECUTABLE_NEEDS_APP_ROOT = '1'
      resolveLocalServeRuntimeMock.mockResolvedValue({ kind: 'electron', reason: 'dev' })
      electronChild()

      await expect(serveMarkovApp({ json: true })).resolves.toBe(0)
      expect(resolveLocalServeRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({ userDataPath: profile })
      )
      // Dev builds read the profile from the environment rather than --user-data-dir.
      expect(electronSpawn().env).toMatchObject({
        MARKOV_DEV_USER_DATA_PATH: profile,
        MARKOV_SERVE_USER_DATA_PATH: profile
      })
    })
  })
})
