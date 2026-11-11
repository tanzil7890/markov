import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExecCommandModule from '../../ssh/remote-exec/remote-exec-command'

vi.mock('../../ssh/remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn()
}))
vi.mock('./markovd-remote-node-runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureRemoteMarkovdNodeRuntime: vi.fn(async () => ({ executable: '/n', transfer: 'cached' }))
}))
vi.mock('./remote-versioned-install', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isRemoteInstallComplete: vi.fn(async () => true)
}))

import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { ensureRemoteMarkovdNodeRuntime } from './markovd-remote-node-runtime'
import { isRemoteInstallComplete } from './remote-versioned-install'
import { installMarkovdBundle } from './markovd-remote-install'
import { cachedMarkovdSlotInstalled } from './markovd-remote-install-cached-probe'

const mockExec = vi.mocked(execCommand)
const END = '\n__MARKOV_CACHED_SLOT_PROBE_END__\n'
const SLOT = '/home/u/.markov-remote/markovd-0.1.0+aa'
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: execCommand is mocked, so the transport is never used.
const conn = {} as MarkovdHostTransport
const linux = getRemoteHostPlatform('linux-x64')
const options = { conn, host: linux, target: 'linux-x64-glibc' as const }

function bundle(recordedNodeRuntimeProbe?: boolean) {
  return installMarkovdBundle(
    {
      ...options,
      localMarkovdDir: '/local/markovd',
      nodeRuntimeArchive: async () => '/cache/node.tar.gz',
      ...(recordedNodeRuntimeProbe ? { recordedNodeRuntimeProbe } : {})
    },
    '0.1.0+aa',
    SLOT
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cachedMarkovdSlotInstalled', () => {
  it('skips the install only when the runtime is cached and the slot complete', async () => {
    mockExec.mockResolvedValueOnce(`MARKOV_NODE_RUNTIME_READY${END}OK\n`)
    await expect(cachedMarkovdSlotInstalled(options, SLOT)).resolves.toBe(true)
    expect(mockExec).toHaveBeenCalledOnce()
    for (const answer of [
      `MARKOV_NODE_RUNTIME_MISSING${END}OK\n`,
      `MARKOV_NODE_RUNTIME_READY${END}MISSING\n`,
      'MARKOV_NODE_RUNTIME_READY\n'
    ]) {
      mockExec.mockResolvedValueOnce(answer)
      await expect(cachedMarkovdSlotInstalled(options, SLOT)).resolves.toBe(false)
    }
    mockExec.mockRejectedValueOnce(new Error('exit 1'))
    await expect(cachedMarkovdSlotInstalled(options, SLOT)).resolves.toBe(false)
  })

  it('leaves Windows hosts to the separate probes', async () => {
    const windows = { ...options, host: getRemoteHostPlatform('win32-x64') }
    await expect(cachedMarkovdSlotInstalled(windows, SLOT)).resolves.toBe(false)
    expect(mockExec).not.toHaveBeenCalled()
  })
})

describe('installMarkovdBundle with the WSL cached-slot probe', () => {
  it('returns after one exec when both answers are cached', async () => {
    mockExec.mockResolvedValueOnce(`MARKOV_NODE_RUNTIME_READY${END}OK\n`)
    await bundle(true)
    expect(ensureRemoteMarkovdNodeRuntime).not.toHaveBeenCalled()
    expect(isRemoteInstallComplete).not.toHaveBeenCalled()
  })

  it('runs the separate probes when the combined one does not say both', async () => {
    mockExec.mockResolvedValueOnce(`MARKOV_NODE_RUNTIME_MISSING${END}OK\n`)
    await bundle(true)
    expect(ensureRemoteMarkovdNodeRuntime).toHaveBeenCalledOnce()
    expect(isRemoteInstallComplete).toHaveBeenCalledOnce()
  })

  it('never sends the combined probe without the option (SSH)', async () => {
    await bundle()
    expect(mockExec).not.toHaveBeenCalled()
    expect(ensureRemoteMarkovdNodeRuntime).toHaveBeenCalledOnce()
    expect(isRemoteInstallComplete).toHaveBeenCalledOnce()
  })
})
