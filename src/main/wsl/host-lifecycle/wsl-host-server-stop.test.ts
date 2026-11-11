import { describe, expect, it, vi } from 'vitest'
import type { MarkovdDecommissionResult } from '../../../shared/markovd-decommission'
import type { MarkovdTerminalCensus } from '../../../shared/markovd-terminal-census'
import { stopWslHostServer, type WslHostServerStopSteps } from './wsl-host-server-stop'
import type { WslHostPeerDesktops } from './wsl-host-peer-desktops'

function census(liveSessions: number | null): MarkovdTerminalCensus {
  return { liveSessions, startedSinceActivation: liveSessions, daemonProtocolVersion: 1 }
}

const RETIRED: MarkovdDecommissionResult = {
  outcome: 'decommissioned',
  version: '1.0.0',
  retirement: 'retired'
}

function steps(overrides: Partial<WslHostServerStopSteps> = {}) {
  const order: string[] = []
  const all: WslHostServerStopSteps = {
    peerDesktops: vi.fn(async (): Promise<WslHostPeerDesktops> => ({ kind: 'none' })),
    endTerminals: vi.fn(async () => {
      order.push('endTerminals')
      return []
    }),
    census: vi.fn(async () => {
      order.push('census')
      return census(0)
    }),
    servingRuntimeId: vi.fn(async () => {
      order.push('servingRuntimeId')
      return 'runtime-a'
    }),
    closeBridge: vi.fn(async () => {
      order.push('closeBridge')
    }),
    decommission: vi.fn(async () => {
      order.push('decommission')
      return RETIRED
    }),
    sleep: vi.fn(async () => {}),
    ...overrides
  }
  return { all, order }
}

describe('stopWslHostServer', () => {
  it('keeps a server another Markov shares: only this desktop lets go, nothing ends', async () => {
    const { all, order } = steps({
      peerDesktops: vi.fn(async (): Promise<WslHostPeerDesktops> => ({
        kind: 'shared',
        names: ['Markov Dev']
      }))
    })
    await expect(stopWslHostServer(all)).resolves.toEqual({
      stopped: true,
      keptForOtherDesktops: ['Markov Dev']
    })
    expect(order).toEqual(['closeBridge'])
  })

  it('refuses the teardown when the server cannot say who else uses it', async () => {
    const { all, order } = steps({
      peerDesktops: vi.fn(async () => {
        throw new Error('runtime_device_required')
      })
    })
    await expect(stopWslHostServer(all)).resolves.toMatchObject({
      stopped: false,
      verdict: 'unverifiable',
      reason: expect.stringContaining('another Markov on this computer')
    })
    expect(order).toEqual(['closeBridge'])
  })
})
