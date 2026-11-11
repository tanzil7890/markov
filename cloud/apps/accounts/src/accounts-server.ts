import { createAdaptorServer } from '@hono/node-server'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { CloudDatabase } from '@markov-cloud/cloud-database'
import type { z } from 'zod'
import { AccountStore, type AccountProfile, type AccountUser } from './account-store.js'
import { AuthorizationStore } from './authorization-store.js'
import type { AccountsConfig } from './config.js'
import {
  AuthorizeQuerySchema,
  isLoopbackCallback,
  LogoutRequestSchema,
  OrgRequestSchema,
  ProfileRequestSchema,
  RefreshRequestSchema,
  RELAY_USE_CAPABILITY,
  ConnectorTokenRequestSchema,
  RelayTokenRequestSchema,
  SessionRequestSchema,
  type AccountView,
  type Capabilities,
  type SessionResponse
} from './desktop-auth-contract.js'
import type { IdentityProvider, VerifiedIdentity } from './identity/identity-provider.js'
import { pkceChallengeMatches } from './opaque-token.js'
import { relayHostIdForPublicKey, type AccountsTokenSigner } from './accounts-token-signer.js'
import { SessionStore, type AuthenticatedSession, type IssuedSession } from './session-store.js'

const AUTH_PREFIX = '/v1/desktop/auth'
const MAX_JSON_BODY_BYTES = 16 * 1024

type AccountsVariables = { session: AuthenticatedSession }
type AccountsEnv = { Variables: AccountsVariables }

export type AccountsServerDependencies = {
  config: AccountsConfig
  database: CloudDatabase
  identity: IdentityProvider
  signer: AccountsTokenSigner
  now?: () => number
}

function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  const token = rest.join(' ').trim()
  return scheme?.toLowerCase() === 'bearer' && token.length > 0 ? token : null
}

function errorPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign-in error</title></head><body style="font-family:system-ui,sans-serif;margin:4rem auto;max-width:28rem"><h1>Sign-in error</h1><p>${message}</p><p>Return to the app and try again.</p></body></html>`
}

function callbackUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function readJson<T extends z.ZodType>(context: Context, schema: T): Promise<z.infer<T> | null> {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : null
}

export function createAccountsApp(dependencies: AccountsServerDependencies) {
  const { config, database, identity, signer } = dependencies
  const now = dependencies.now ?? Date.now
  const accounts = new AccountStore(database, now)
  const authorizations = new AuthorizationStore(database, now, {
    requestMs: config.authorizationRequestTtlMs,
    codeMs: config.authorizationCodeTtlMs
  })
  const sessions = new SessionStore(database, now, {
    accessMs: config.accessTokenTtlMs,
    refreshMs: config.refreshTokenTtlMs
  })
  const app = new Hono<AccountsEnv>()

  const limitBody = bodyLimit({
    maxSize: MAX_JSON_BODY_BYTES,
    onError: (context) => context.json({ error: 'request_too_large' }, 413)
  })

  const requireSession: MiddlewareHandler<AccountsEnv> = async (context, next) => {
    const token = readBearer(context.req.header('authorization'))
    const session = token ? await sessions.authenticate(token) : null
    if (!session) {
      context.header('www-authenticate', 'Bearer error="invalid_token"')
      return context.json({ error: 'invalid_token' }, 401)
    }
    context.set('session', session)
    await next()
  }

  function capabilities(): Capabilities {
    return { flags: { [RELAY_USE_CAPABILITY]: true }, refreshedAt: now() }
  }

  async function accountView(user: AccountUser, profile: AccountProfile): Promise<AccountView> {
    const organizations = await accounts.listOrganizations(user.userId)
    const activeOrg = organizations.find((organization) => organization.orgId === profile.activeOrgId)
    return {
      cloud: {
        cloudProfileId: profile.profileId,
        userId: user.userId,
        email: user.email,
        ...(user.displayName ? { displayName: user.displayName } : {}),
        ...(activeOrg ? { activeOrgId: activeOrg.orgId, activeOrgName: activeOrg.name } : {}),
        linkedAt: profile.linkedAt
      },
      organizations,
      capabilities: capabilities()
    }
  }

  async function sessionResponse(
    user: AccountUser,
    profile: AccountProfile,
    tokens: IssuedSession
  ): Promise<SessionResponse> {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      ...(await accountView(user, profile))
    }
  }

  // Re-reads the identity provider at most every identityResyncMs; a deleted user loses every session.
  async function currentUser(session: AuthenticatedSession): Promise<AccountUser | null> {
    const user = await accounts.getUser(session.userId)
    if (!user) return null
    if (now() - user.syncedAt < config.identityResyncMs) return user
    const lookup = await identity.lookup(user.externalId)
    if (lookup.status === 'gone') {
      await sessions.revokeUser(user.userId)
      return null
    }
    return await accounts.upsertIdentity(lookup.identity)
  }

  async function sessionAccount(
    context: Context<AccountsEnv>
  ): Promise<{ session: AuthenticatedSession; user: AccountUser; profile: AccountProfile } | Response> {
    const session = context.get('session')
    const user = await currentUser(session)
    const profile = await accounts.getProfile(session.profileId)
    if (!user || !profile || profile.userId !== user.userId) {
      return context.json({ error: 'invalid_token' }, 401)
    }
    return { session, user, profile }
  }

  async function completeSignIn(requestId: string, verified: VerifiedIdentity): Promise<string | null> {
    const user = await accounts.upsertIdentity(verified)
    const completed = await authorizations.completeRequest(requestId, user.userId)
    if (!completed) return null
    return callbackUrl(completed.request.redirectUri, {
      code: completed.code,
      state: completed.request.state
    })
  }

  app.use('*', async (context, next) => {
    await next()
    context.header('cache-control', 'no-store')
    context.header('x-content-type-options', 'nosniff')
    context.header('referrer-policy', 'no-referrer')
  })

  app.get('/healthz', (context) => context.json({ ok: true }))
  app.get('/.well-known/jwks.json', (context) => context.json(signer.jwks()))

  app.get(`${AUTH_PREFIX}/authorize`, async (context) => {
    const parsed = AuthorizeQuerySchema.safeParse(context.req.query())
    // Never redirect to a callback that has not been proven to be this machine's loopback listener.
    const redirectUri = context.req.query('redirect_uri') ?? ''
    if (!config.clientIds.has(context.req.query('client_id') ?? '') || !isLoopbackCallback(redirectUri)) {
      return context.html(errorPage('This sign-in link is not valid.'), 400)
    }
    if (!parsed.success) {
      const state = context.req.query('state')
      return context.redirect(
        callbackUrl(redirectUri, { error: 'invalid_request', ...(state ? { state } : {}) }),
        302
      )
    }
    const query = parsed.data
    const request = await authorizations.createRequest({
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      state: query.state,
      nonce: query.nonce,
      codeChallenge: query.code_challenge,
      localProfileId: query.local_profile_id ?? null
    })
    const autoApproved = identity.autoApprovedIdentity()
    if (autoApproved) {
      const redirectTo = await completeSignIn(request.requestId, autoApproved)
      return redirectTo
        ? context.redirect(redirectTo, 302)
        : context.html(errorPage('This sign-in request has expired.'), 400)
    }
    const page = identity.signInPage({
      requestId: request.requestId,
      completeUrl: `${AUTH_PREFIX}/authorize/complete`
    })
    context.header('x-frame-options', 'DENY')
    if (page.contentSecurityPolicy) context.header('content-security-policy', page.contentSecurityPolicy)
    return context.html(page.html)
  })

  app.post(`${AUTH_PREFIX}/authorize/complete`, limitBody, async (context) => {
    const body: unknown = await context.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return context.json({ error: 'invalid_request' }, 400)
    }
    const record = body as Record<string, unknown>
    const requestId = typeof record.requestId === 'string' ? record.requestId : ''
    const request = requestId ? await authorizations.getRequest(requestId) : null
    if (!request || request.completedAt !== null || request.expiresAt <= now()) {
      return context.json({ error: 'request_expired' }, 400)
    }
    const verified = await identity.verifyCompletion(record)
    if (!verified) return context.json({ error: 'sign_in_not_verified' }, 401)
    const redirectTo = await completeSignIn(request.requestId, verified)
    return redirectTo
      ? context.json({ redirectTo })
      : context.json({ error: 'request_expired' }, 400)
  })

  app.post(`${AUTH_PREFIX}/session`, limitBody, async (context) => {
    const body = await readJson(context, SessionRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const redeemed = await authorizations.redeemCode(body.code)
    const request = redeemed?.request
    if (
      !redeemed ||
      !request ||
      request.redirectUri !== body.redirectUri ||
      request.state !== body.state ||
      request.nonce !== body.nonce ||
      !pkceChallengeMatches(body.codeVerifier, request.codeChallenge)
    ) {
      return context.json({ error: 'invalid_grant' }, 400)
    }
    const user = await accounts.getUser(redeemed.userId)
    if (!user) return context.json({ error: 'invalid_grant' }, 400)
    const profile = await accounts.findOrCreateLinkedProfile(
      user.userId,
      body.localProfileId ?? request.localProfileId
    )
    const { tokens } = await sessions.issue({ userId: user.userId, profileId: profile.profileId })
    return context.json(await sessionResponse(user, profile, tokens))
  })

  app.post(`${AUTH_PREFIX}/refresh`, limitBody, async (context) => {
    const body = await readJson(context, RefreshRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const rotated = await sessions.rotate(body.refreshToken)
    if (rotated.status !== 'rotated') return context.json({ error: 'invalid_grant' }, 401)
    const user = await currentUser(rotated.session)
    const profile = await accounts.getProfile(rotated.session.profileId)
    if (!user || !profile) {
      await sessions.revokeFamily(rotated.session.familyId)
      return context.json({ error: 'invalid_grant' }, 401)
    }
    return context.json(await sessionResponse(user, profile, rotated.tokens))
  })

  app.post(`${AUTH_PREFIX}/capabilities`, limitBody, requireSession, async (context) => {
    const account = await sessionAccount(context)
    if (account instanceof Response) return account
    return context.json(await accountView(account.user, account.profile))
  })

  app.post(`${AUTH_PREFIX}/profile`, limitBody, requireSession, async (context) => {
    const body = await readJson(context, ProfileRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const account = await sessionAccount(context)
    if (account instanceof Response) return account
    if (body.orgId) {
      const organizations = await accounts.listOrganizations(account.user.userId)
      if (!organizations.some((organization) => organization.orgId === body.orgId)) {
        return context.json({ error: 'org_not_member' }, 403)
      }
    }
    const profile = await accounts.createProfile(account.user.userId, {
      localProfileId: null,
      name: body.name ?? null,
      activeOrgId: body.orgId ?? null
    })
    const { tokens } = await sessions.issue({ userId: account.user.userId, profileId: profile.profileId })
    return context.json(await sessionResponse(account.user, profile, tokens))
  })

  app.post(`${AUTH_PREFIX}/org`, limitBody, requireSession, async (context) => {
    const body = await readJson(context, OrgRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const account = await sessionAccount(context)
    if (account instanceof Response) return account
    const organizations = await accounts.listOrganizations(account.user.userId)
    if (!organizations.some((organization) => organization.orgId === body.orgId)) {
      return context.json({ error: 'org_not_member' }, 403)
    }
    await accounts.setActiveOrg(account.profile.profileId, body.orgId)
    const profile = (await accounts.getProfile(account.profile.profileId))!
    return context.json(await accountView(account.user, profile))
  })

  app.post(`${AUTH_PREFIX}/logout`, limitBody, async (context) => {
    const body = (await readJson(context, LogoutRequestSchema)) ?? {}
    const token = readBearer(context.req.header('authorization'))
    const session = token ? await sessions.authenticate(token) : null
    const familyId =
      session?.familyId ?? (body.refreshToken ? await sessions.familyForRefreshToken(body.refreshToken) : null)
    if (!familyId) return context.json({ error: 'invalid_token' }, 401)
    await sessions.revokeFamily(familyId)
    return context.json({ ok: true })
  })

  app.post(`${AUTH_PREFIX}/relay-token`, limitBody, requireSession, async (context) => {
    const body = await readJson(context, RelayTokenRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const publicKey = Buffer.from(body.hostPublicKeyB64, 'base64')
    if (publicKey.length !== 32 || relayHostIdForPublicKey(publicKey) !== body.relayHostId) {
      return context.json({ error: 'relay_host_mismatch' }, 400)
    }
    const account = await sessionAccount(context)
    if (account instanceof Response) return account
    if (!capabilities().flags[RELAY_USE_CAPABILITY]) {
      return context.json({ error: 'relay_not_allowed' }, 403)
    }
    const organizations = await accounts.listOrganizations(account.user.userId)
    const activeOrgId = organizations.some((organization) => organization.orgId === account.profile.activeOrgId)
      ? account.profile.activeOrgId
      : null
    return context.json(
      await signer.mint({
        userId: account.user.userId,
        profileId: account.profile.profileId,
        orgId: activeOrgId,
        relayHostId: body.relayHostId
      })
    )
  })

  app.post(`${AUTH_PREFIX}/connector-token`, limitBody, requireSession, async (context) => {
    const body = await readJson(context, ConnectorTokenRequestSchema)
    if (!body) return context.json({ error: 'invalid_request' }, 400)
    const account = await sessionAccount(context)
    if (account instanceof Response) return account
    return context.json(
      await signer.mintConnector({
        userId: account.user.userId,
        machineId: body.machineId,
        email: account.user.email
      })
    )
  })

  app.notFound((context) => context.json({ error: 'not_found' }, 404))
  app.onError((error, context) => {
    console.error(JSON.stringify({ event: 'markov_accounts_request_failed', message: error.message }))
    return context.json({ error: 'internal_error' }, 500)
  })

  return { app, sweep: () => sweepExpired(authorizations, sessions) }
}

async function sweepExpired(authorizations: AuthorizationStore, sessions: SessionStore): Promise<void> {
  await authorizations.deleteExpired()
  await sessions.deleteExpired()
}

export function createAccountsServer(dependencies: AccountsServerDependencies) {
  const { app, sweep } = createAccountsApp(dependencies)
  return { app, sweep, server: createAdaptorServer({ fetch: app.fetch }) }
}
