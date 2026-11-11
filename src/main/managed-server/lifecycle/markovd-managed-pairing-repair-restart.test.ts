import type * as WorktreeScanCacheModule from '../../git/worktrees/catalog/worktree-scan-cache'
import type * as WorktreeListingModule from '../../git/worktrees/catalog/worktree-listing'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  createEnvironmentFromPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/ssh-types'
import { DeviceRegistry } from '../../runtime/rpc/server/pairing/device-registry'
import { MarkovRuntimeService } from '../../runtime/markov-runtime'
import { MarkovRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'
import { verifyRuntimePairingIdentity } from '../../runtime/runtime-environment-identity-verification'
import { buildServePairingReadiness } from '../../server/serve-pairing-readiness'
import type { ServeReadiness } from '../../server/serve-readiness'
import { ManagedMarkovdPairingRepairs } from './markovd-managed-pairing-repair'
import {
  MarkovdManagedIdentityError,
  verifyManagedMarkovdTunnelIdentity
} from './markovd-managed-tunnel-identity'
import { unusedMarkovdHostTransport } from '../../ssh/unused-host-transport.test-fixture'

vi.mock('../../git/worktrees/catalog/worktree-scan-cache', async (importOriginal) => {
  const facade = getWorktreeListingMocks()
  return {
    ...(await importOriginal<typeof WorktreeScanCacheModule>()),
    listWorktrees: facade.listWorktrees
  }
})

vi.mock('../../git/worktrees/catalog/worktree-listing', async (importOriginal) => {
  const facade = getWorktreeListingMocks()
  return {
    ...(await importOriginal<typeof WorktreeListingModule>()),
    listWorktreesStrict: facade.listWorktreesStrict
  }
})

const { getWorktreeListingMocks } = vi.hoisted(() => {
  const createWorktreeListingMocks = () => ({
    listWorktrees: vi.fn().mockResolvedValue([]),
    listWorktreesStrict: vi.fn().mockResolvedValue([])
  })
  let listings: ReturnType<typeof createWorktreeListingMocks> | undefined
  return { getWorktreeListingMocks: () => (listings ??= createWorktreeListingMocks()) }
})

const servers: MarkovRuntimeRpcServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
})

async function startMarkovd(hostProfile: string): Promise<MarkovRuntimeRpcServer> {
  const server = new MarkovRuntimeRpcServer({
    runtime: new MarkovRuntimeService(),
    userDataPath: hostProfile,
    enableWebSocket: true,
    wsPort: 0
  })
  await server.start()
  servers.push(server)
  return server
}

async function publishedReadiness(server: MarkovRuntimeRpcServer): Promise<ServeReadiness> {
  return {
    runtimeId: 'runtime-now',
    managedWslCliReconciliation: 'settled',
    ...(await buildServePairingReadiness({ pairingAddress: '127.0.0.1' }, server))
  }
}

function offerIn(readiness: ServeReadiness): PairingOffer {
  if (!readiness.pairing.available) {
    throw new Error('pairing unavailable')
  }
  return parsePairingCode(readiness.pairing.url)!
}

function savedEnvironment(offer: PairingOffer, at = 1): KnownRuntimeEnvironment {
  return {
    ...createEnvironmentFromPairingOffer({
      id: 'env-1',
      name: 'Box server',
      now: at,
      offer,
      connectionDependency: 'ssh-tunnel'
    }),
    markovdDeployment: {
      sshTargetId: 'box',
      sshTargetGeneration: 1,
      localPort: Number(new URL(offer.endpoint).port),
      remotePort: 6_768
    }
  }
}

function repairsAgainst(saved: KnownRuntimeEnvironment, readiness: ServeReadiness) {
  let current = saved
  const refresh = vi.fn((_id: string, code: string) => {
    current = savedEnvironment(parsePairingCode(code)!, 2)
    return current
  })
  const repairs = new ManagedMarkovdPairingRepairs({
    resolve: () => current,
    connect: async () => ({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only passed to readReadiness, which ignores it here.
      target: {} as SshTarget,
      connection: unusedMarkovdHostTransport()
    }),
    readReadiness: async () => readiness,
    refresh,
    repaired: vi.fn(),
    now: () => 0
  })
  return { repairs, refresh }
}

describe('a managed markovd that dropped this desktop and restarted', () => {
  it('reads as our server refusing our token, and pairing again over SSH restores access', async () => {
    const hostProfile = mkdtempSync(join(tmpdir(), 'markovd-host-'))
    const first = await startMarkovd(hostProfile)
    const paired = offerIn(await publishedReadiness(first))
    await verifyRuntimePairingIdentity(pairedRuntimeConnectionFromOffer(paired), {
      runtimeId: null
    })
    await first.stop()
    new DeviceRegistry(hostProfile).removeDevice(paired.pairedDeviceId!)
    const restarted = await startMarkovd(hostProfile)
    const readiness = await publishedReadiness(restarted)
    const reached = { ...paired, endpoint: offerIn(readiness).endpoint }

    const refused = await verifyManagedMarkovdTunnelIdentity(savedEnvironment(reached))
    // The pinned key sealed this refusal, proving the expected server answered.
    expect(refused.verdict).toBe('unpaired')

    const { repairs, refresh } = repairsAgainst(savedEnvironment(reached), readiness)
    const repaired = await repairs.repair('env-1', 1)
    expect(refresh).toHaveBeenCalledOnce()
    await expect(verifyManagedMarkovdTunnelIdentity(repaired)).resolves.toEqual({
      verdict: 'verified'
    })
  })

  it('never pairs with a server whose key differs from the pinned one', async () => {
    const paired = offerIn(
      await publishedReadiness(await startMarkovd(mkdtempSync(join(tmpdir(), 'markovd-host-'))))
    )
    const other = await publishedReadiness(
      await startMarkovd(mkdtempSync(join(tmpdir(), 'markovd-other-')))
    )
    const reached = { ...paired, endpoint: offerIn(other).endpoint }
    await expect(
      verifyManagedMarkovdTunnelIdentity(savedEnvironment(reached))
    ).resolves.toMatchObject({ verdict: 'foreign' })

    const { repairs, refresh } = repairsAgainst(savedEnvironment(reached), other)
    await expect(repairs.repair('env-1', 1)).rejects.toBeInstanceOf(MarkovdManagedIdentityError)
    expect(refresh).not.toHaveBeenCalled()
  })
})
