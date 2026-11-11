import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientChannel } from 'ssh2'
import {
  MARKOVD_STATE_MUTATION_CLIENT_TIMEOUT_MS,
  execMarkovdStateMutation,
  execMarkovdStateMutationOr
} from './markovd-state-mutation-exec'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'

class SlowChannel extends EventEmitter {
  readonly stderr = new EventEmitter()
  readonly stdin = this
  closed = false
  // Model sshd acknowledging channel close without proving the command stopped.
  close(): void {
    this.closed = true
    queueMicrotask(() => this.emit('close', 0))
  }
  resume(): void {}
  finish(output: string): void {
    this.emit('data', Buffer.from(output))
    this.emit('close', 0)
  }
}

let channel: SlowChannel
const conn = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: execCommand reads only the channel events, close() and resume() SlowChannel implements.
  exec: async () => channel as unknown as ClientChannel,
  usesSystemSshTransport: () => false
}
const target = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only exec and usesSystemSshTransport are read.
  conn: conn as unknown as MarkovdHostTransport,
  host: getRemoteHostPlatform('linux-x64')
}

beforeEach(() => {
  vi.useFakeTimers()
  channel = new SlowChannel()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a snapshot restore that runs past the 30s exec timeout', () => {
  it('keeps waiting past 30s and returns the restore’s own answer', async () => {
    const restore = execMarkovdStateMutation(target, 'restore')
    await vi.advanceTimersByTimeAsync(45_000)
    expect(channel.closed).toBe(false)
    channel.finish('RESTORED\n')
    await expect(restore).resolves.toBe('RESTORED\n')
  })

  it('treats giving up as unconfirmed, even when sshd confirms the channel close', async () => {
    const restore = execMarkovdStateMutationOr(target, 'restore', 'FALLBACK')
    const settled = restore.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(MARKOVD_STATE_MUTATION_CLIENT_TIMEOUT_MS + 1_000)
    const error = await settled
    expect(channel.closed).toBe(true)
    expect(isUnconfirmedSshCommandTermination(error)).toBe(true)
  })
})
