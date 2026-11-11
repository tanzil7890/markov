import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
// The real desktop modules: this test fails if they and the self-hosted servers drift apart.
import type { MarkovCloudAuthConfig } from '../../src/main/markov-profiles/profile-cloud-auth-config'
import { beginMarkovCloudPkceFlow } from '../../src/main/markov-profiles/profile-cloud-pkce'
import {
  exchangeMarkovCloudAuthCode,
  MarkovCloudRequestError,
  refreshMarkovCloudCapabilities,
  refreshMarkovCloudSession,
  revokeMarkovCloudSession,
  selectMarkovCloudOrg
} from '../../src/main/markov-profiles/profile-cloud-client'
import { RelaySessionBroker } from '../../src/main/runtime/mobile-cloud-relay/relay-session-broker'
import {
  exchangeRelayAuthorization,
  RelayHttpError
} from '../../src/main/runtime/mobile-cloud-relay/relay-http-client'
import { SimulatedMobileE2EEV2Peer } from '../../src/main/runtime/mobile-cloud-relay/simulated-mobile-e2ee-v2-peer'
import { DeviceRegistry } from '../../src/main/runtime/rpc/server/pairing/device-registry'
import { MobileSocketWiring } from '../../src/main/runtime/rpc/mobile-socket-wiring'
import {
  completeBrowserSignIn,
  E2E_EMAIL,
  startTestStack,
  type Stack
} from './self-hosted-cloud-fixture'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  // The test plays the browser itself, through onAuthorizeUrl.
  shell: { openExternal: vi.fn(async () => undefined) }
}))

const LOCAL_PROFILE_ID = 'e2e-local-profile'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('self-hosted cloud stack, driven by the real desktop client', () => {
  let stack: Stack
  let config: MarkovCloudAuthConfig
  const temporaryDirectories: string[] = []

  let started: Awaited<ReturnType<typeof startTestStack>>

  beforeAll(async () => {
    started = await startTestStack({ relay: true })
    stack = started.stack
    config = started.config
  })

  afterAll(async () => {
    await started?.stop()
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('signs in, pairs a phone through the relay, and signs out', async () => {
    // 1. Browser sign-in exactly as the desktop runs it (PKCE + loopback callback).
    const authorization = await beginMarkovCloudPkceFlow(config, LOCAL_PROFILE_ID, {
      onAuthorizeUrl: (url) => void completeBrowserSignIn(url)
    })
    const session = await exchangeMarkovCloudAuthCode(config, {
      ...authorization,
      localProfileId: LOCAL_PROFILE_ID
    })
    expect(session.cloud.email).toBe(E2E_EMAIL)
    expect(session.cloud.displayName).toBe('E2E User')
    expect(session.organizations?.map((organization) => organization.name)).toEqual([
      'Fake Team',
      'Personal'
    ])
    expect(session.capabilities.flags['relay.use']).toBe(true)

    // 2. Organization switch and token refresh; the old access token stops working.
    const selected = await selectMarkovCloudOrg(config, session, 'fake-team')
    expect(selected.cloud.activeOrgId).toBe('fake-team')
    expect(selected.cloud.activeOrgName).toBe('Fake Team')
    const refreshed = await refreshMarkovCloudSession(config, session)
    expect(refreshed.accessToken).not.toBe(session.accessToken)
    expect(refreshed.cloud.cloudProfileId).toBe(session.cloud.cloudProfileId)
    await expect(refreshMarkovCloudCapabilities(config, session)).rejects.toMatchObject({
      statusCode: 401
    })

    // 3. The desktop registers with the relay using a token from the accounts server.
    const userDataPath = mkdtempSync(join(tmpdir(), 'self-hosted-desktop-'))
    temporaryDirectories.push(userDataPath)
    const registry = new DeviceRegistry(userDataPath)
    const device = registry.addDevice('E2E Phone', 'mobile')
    const desktopKeys = nacl.box.keyPair()
    const keypair = {
      publicKey: desktopKeys.publicKey,
      secretKey: desktopKeys.secretKey,
      publicKeyB64: Buffer.from(desktopKeys.publicKey).toString('base64')
    }
    const desktopReceived = deferred<string>()
    const wiring = new MobileSocketWiring({
      deviceRegistry: registry,
      e2eeKeypair: keypair,
      onText: (_socket, plaintext, reply) => {
        desktopReceived.resolve(plaintext)
        reply(JSON.stringify({ id: 'rpc-1', ok: true, result: { via: 'self-hosted-relay' } }))
      },
      onBinary: () => undefined,
      onClose: () => undefined
    })
    const broker = await RelaySessionBroker.connect({
      authConfig: config,
      accessToken: refreshed.accessToken,
      identity: {
        userId: refreshed.cloud.userId,
        profileId: refreshed.cloud.cloudProfileId,
        organizationId: 'fake-team'
      },
      keypair,
      appVersion: '0.0.0-self-hosted-e2e',
      mobileSocketWiring: wiring,
      isCurrent: () => true,
      refreshAccessToken: async () => ({ accessToken: refreshed.accessToken }),
      onStatus: () => undefined
    })
    let phone: WebSocket | null = null
    try {
      expect(broker.isLive()).toBe(true)
      const pairing = await broker.createPairingRelay(device.deviceId)
      expect(pairing.cellUrl).toBe(stack.relayUrl)

      // 4. A simulated phone joins with the invite and completes end-to-end encryption.
      phone = new WebSocket(
        `${pairing.cellUrl.replace(/^http/, 'ws')}/v1/connect/${pairing.relayHostId}`,
        { perMessageDeflate: false }
      )
      const openedPhone = phone
      await new Promise<void>((resolveOpen, reject) => {
        openedPhone.once('open', () => resolveOpen())
        openedPhone.once('error', reject)
      })
      const peer = new SimulatedMobileE2EEV2Peer(
        nacl.box.keyPair(),
        desktopKeys.publicKey,
        pairing.relayHostId
      )
      const phoneReceived = deferred<string>()
      let phase: 'relay-hello' | 'ready' | 'authenticated' | 'open' = 'relay-hello'
      openedPhone.on('message', (raw, isBinary) => {
        try {
          if (phase === 'relay-hello') {
            expect(JSON.parse(raw.toString())).toMatchObject({
              type: 'relay-hello',
              ok: true,
              credentialKind: 'invite'
            })
            phase = 'ready'
            openedPhone.send(JSON.stringify(peer.hello))
            return
          }
          if (phase === 'ready') {
            expect(peer.acceptReady(JSON.parse(raw.toString()))).toBe(true)
            phase = 'authenticated'
            openedPhone.send(
              peer.sealText(
                JSON.stringify({
                  type: 'e2ee_auth',
                  v: 2,
                  transcriptHashB64: peer.transcriptHashB64,
                  deviceToken: device.token
                })
              )
            )
            return
          }
          const plaintext = isBinary ? null : peer.openText(raw.toString())
          if (phase === 'authenticated') {
            expect(JSON.parse(plaintext ?? 'null')).toMatchObject({ type: 'e2ee_authenticated' })
            phase = 'open'
            openedPhone.send(peer.sealText(JSON.stringify({ id: 'rpc-1', method: 'status.get' })))
            return
          }
          if (plaintext) {
            phoneReceived.resolve(plaintext)
          }
        } catch (error) {
          phoneReceived.reject(error)
        }
      })
      openedPhone.send(
        JSON.stringify({
          type: 'relay-auth',
          v: 1,
          mode: 'connect',
          credential: pairing.inviteToken
        })
      )

      // 5. Messages cross the relay in both directions, encrypted end to end.
      await expect(desktopReceived.promise).resolves.toBe(
        JSON.stringify({ id: 'rpc-1', method: 'status.get' })
      )
      await expect(phoneReceived.promise).resolves.toBe(
        JSON.stringify({ id: 'rpc-1', ok: true, result: { via: 'self-hosted-relay' } })
      )
    } finally {
      phone?.terminate()
      broker.closeNow()
    }

    // 6. Signing out revokes the session: no more relay tokens for it.
    await revokeMarkovCloudSession(config, refreshed)
    const signedOut = exchangeRelayAuthorization({
      endpoint: config.relayTokenEndpoint,
      accessToken: refreshed.accessToken,
      keypair
    })
    await expect(signedOut).rejects.toBeInstanceOf(RelayHttpError)
    await expect(signedOut).rejects.toMatchObject({ statusCode: 401 })
    await expect(refreshMarkovCloudCapabilities(config, refreshed)).rejects.toBeInstanceOf(
      MarkovCloudRequestError
    )
  })
})
