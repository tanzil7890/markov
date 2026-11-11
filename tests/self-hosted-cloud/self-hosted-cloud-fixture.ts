// Boots the self-hosted stack for an end-to-end test and plays the browser half of desktop sign-in.
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { z } from 'zod'
import {
  getMarkovCloudAuthConfig,
  type MarkovCloudAuthConfig
} from '../../src/main/markov-profiles/profile-cloud-auth-config'
import { beginMarkovCloudPkceFlow } from '../../src/main/markov-profiles/profile-cloud-pkce'
import { exchangeMarkovCloudAuthCode } from '../../src/main/markov-profiles/profile-cloud-client'
import { startSelfHostedStack } from '../../cloud/dev/self-hosted-stack.mjs'

export type Stack = Awaited<ReturnType<typeof startSelfHostedStack>>

export const E2E_EMAIL = 'e2e.user@example.com'

export async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('expected a TCP port')
  }
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  return address.port
}

// Unset runs on SQLite; CI also runs against PostgreSQL, the production dialect.
function databaseUrls() {
  const env = process.env
  return {
    ...(env.MARKOV_SELF_HOSTED_E2E_ACCOUNTS_DATABASE_URL
      ? { accountsDatabaseUrl: env.MARKOV_SELF_HOSTED_E2E_ACCOUNTS_DATABASE_URL }
      : {}),
    ...(env.MARKOV_SELF_HOSTED_E2E_RELAY_DATABASE_URL
      ? { relayDatabaseUrl: env.MARKOV_SELF_HOSTED_E2E_RELAY_DATABASE_URL }
      : {}),
    ...(env.MARKOV_SELF_HOSTED_E2E_SHARING_DATABASE_URL
      ? { sharingDatabaseUrl: env.MARKOV_SELF_HOSTED_E2E_SHARING_DATABASE_URL }
      : {}),
    ...(env.MARKOV_SELF_HOSTED_E2E_CONNECTOR_DATABASE_URL
      ? { connectorDatabaseUrl: env.MARKOV_SELF_HOSTED_E2E_CONNECTOR_DATABASE_URL }
      : {})
  }
}

// Start only what a test drives: on PostgreSQL every test file shares one database, and a relay
// registers its cell there, so a later file's relay would hand phones to an earlier, stopped cell.
export async function startTestStack(
  services: { relay?: boolean; sharing?: boolean; connector?: boolean } = {}
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'self-hosted-stack-'))
  const stack = await startSelfHostedStack({
    accountsPort: await unusedPort(),
    ...(services.relay ? { relayPort: await unusedPort() } : {}),
    ...(services.sharing ? { sharingPort: await unusedPort() } : {}),
    ...(services.connector
      ? { connectorPort: await unusedPort(), connectorChat: { kind: 'fake' } }
      : {}),
    dataDir,
    identity: { kind: 'fake' },
    ...databaseUrls()
  }).catch((error: unknown) => {
    rmSync(dataDir, { recursive: true, force: true })
    throw error
  })
  const configState = getMarkovCloudAuthConfig(stack.desktopEnv, false)
  if (!configState.configured) {
    await stack.stop()
    throw new Error(configState.setupMessage)
  }
  return {
    stack,
    config: configState.config,
    async stop() {
      await stack.stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  }
}

// Acts as the user's browser: opens the sign-in page, fills it in, follows the redirect home.
export async function completeBrowserSignIn(
  authorizeUrl: string,
  email = E2E_EMAIL
): Promise<void> {
  const page = await fetch(authorizeUrl)
  expect(page.status).toBe(200)
  const requestId = /name="markov-authorization-request" content="([^"]+)"/.exec(
    await page.text()
  )?.[1]
  expect(requestId).toBeTruthy()
  const completion = await fetch(new URL('/v1/desktop/auth/authorize/complete', authorizeUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, email, displayName: 'E2E User' })
  })
  expect(completion.status).toBe(200)
  const { redirectTo } = z.object({ redirectTo: z.string() }).parse(await completion.json())
  const callback = await fetch(redirectTo)
  expect(callback.status).toBe(200)
}

export async function signInDesktop(
  config: MarkovCloudAuthConfig,
  localProfileId: string,
  email = E2E_EMAIL
): Promise<Awaited<ReturnType<typeof exchangeMarkovCloudAuthCode>>> {
  const authorization = await beginMarkovCloudPkceFlow(config, localProfileId, {
    onAuthorizeUrl: (url) => void completeBrowserSignIn(url, email)
  })
  return await exchangeMarkovCloudAuthCode(config, { ...authorization, localProfileId })
}

export async function waitFor<T>(
  read: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  description: string,
  timeoutMs = 20_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${description}`)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
}
