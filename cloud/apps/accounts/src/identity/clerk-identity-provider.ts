import { createClerkClient, verifyToken } from '@clerk/backend'
import { isClerkAPIResponseError } from '@clerk/backend/errors'
import { z } from 'zod'
import {
  escapeHtml,
  type IdentityLookup,
  type IdentityProvider,
  type VerifiedIdentity
} from './identity-provider.js'

const CompletionSchema = z.object({ sessionToken: z.string().min(1).max(8192) })

// Publishable keys are `pk_<env>_<base64("<frontend api host>$")>`.
export function clerkFrontendApiHost(publishableKey: string): string {
  const encoded = publishableKey.split('_').slice(2).join('_')
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  if (!/^pk_(test|live)_/.test(publishableKey) || !decoded.endsWith('$')) {
    throw new Error('CLERK_PUBLISHABLE_KEY is not a Clerk publishable key')
  }
  const host = decoded.slice(0, -1)
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error('CLERK_PUBLISHABLE_KEY names an invalid frontend API host')
  }
  return host
}

function roleLabel(role: string): string {
  const bare = role.replace(/^org:/, '')
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : role
}

export function createClerkIdentityProvider(options: {
  secretKey: string
  publishableKey: string
  publicUrl: string
}): IdentityProvider {
  const clerk = createClerkClient({
    secretKey: options.secretKey,
    publishableKey: options.publishableKey
  })
  const frontendApi = clerkFrontendApiHost(options.publishableKey)

  async function organizationsOf(userId: string): Promise<VerifiedIdentity['organizations']> {
    try {
      const memberships = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 })
      return memberships.data.map((membership) => ({
        orgId: membership.organization.id,
        name: membership.organization.name,
        role: roleLabel(membership.role)
      }))
    } catch (error) {
      // Clerk refuses membership reads while its Organizations feature is off; nobody is in one then.
      if (
        isClerkAPIResponseError(error) &&
        error.errors.some((entry) => entry.code === 'organization_not_enabled_in_instance')
      ) {
        return []
      }
      throw error
    }
  }

  async function lookup(externalId: string): Promise<IdentityLookup> {
    try {
      const user = await clerk.users.getUser(externalId)
      const email =
        user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
      if (!email) return { status: 'gone' }
      const identity: VerifiedIdentity = {
        provider: 'clerk',
        externalId,
        email,
        organizations: await organizationsOf(externalId)
      }
      const displayName = user.fullName ?? user.username ?? undefined
      if (displayName) identity.displayName = displayName
      return { status: 'found', identity }
    } catch (error) {
      if (isClerkAPIResponseError(error) && error.status === 404) {
        return { status: 'gone' }
      }
      throw error
    }
  }

  return {
    kind: 'clerk',
    autoApprovedIdentity: () => null,
    signInPage({ requestId, completeUrl }) {
      const fapi = escapeHtml(frontendApi)
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="markov-authorization-request" content="${escapeHtml(requestId)}">
<title>Sign in</title>
<style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;margin:3rem 1rem}#status{color:#555;margin-top:1rem}</style>
<script defer crossorigin="anonymous" src="https://${fapi}/npm/@clerk/ui@1/dist/ui.browser.js"></script>
<script defer crossorigin="anonymous" data-clerk-publishable-key="${escapeHtml(options.publishableKey)}" src="https://${fapi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script>
</head>
<body>
<div id="sign-in"></div>
<p id="status" role="status">Loading sign-in…</p>
<script>
const status = document.getElementById('status')
let completing = false
async function complete() {
  if (completing || !window.Clerk.session) return
  completing = true
  status.textContent = 'Finishing sign-in…'
  try {
    const sessionToken = await window.Clerk.session.getToken()
    const response = await fetch(${JSON.stringify(completeUrl)}, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: ${JSON.stringify(requestId)}, sessionToken })
    })
    const body = await response.json().catch(() => ({}))
    if (response.ok && body.redirectTo) { window.location.replace(body.redirectTo); return }
    status.textContent = 'Sign-in failed (' + (body.error || response.status) + '). Return to the app and try again.'
  } catch (error) {
    status.textContent = 'Sign-in failed. Return to the app and try again.'
  }
}
window.addEventListener('load', async () => {
  await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } })
  if (window.Clerk.isSignedIn) { await complete(); return }
  status.textContent = ''
  window.Clerk.mountSignIn(document.getElementById('sign-in'), { forceRedirectUrl: window.location.href })
  window.Clerk.addListener(({ session }) => { if (session) void complete() })
})
</script>
</body>
</html>`
      return { html }
    },
    async verifyCompletion(body) {
      const parsed = CompletionSchema.safeParse(body)
      if (!parsed.success) return null
      let subject: string
      try {
        // The package-root verifyToken resolves to the claims and throws on any rejection.
        // authorizedParties stops a session token minted for another site from being replayed here.
        const claims = await verifyToken(parsed.data.sessionToken, {
          secretKey: options.secretKey,
          authorizedParties: [options.publicUrl]
        })
        subject = claims.sub
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'markov_accounts_clerk_token_rejected',
            message: error instanceof Error ? error.message : String(error)
          })
        )
        return null
      }
      if (!subject) return null
      const result = await lookup(subject)
      return result.status === 'found' ? result.identity : null
    },
    lookup
  }
}
