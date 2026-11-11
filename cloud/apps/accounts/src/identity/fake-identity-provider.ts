import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  escapeHtml,
  type IdentityProvider,
  type VerifiedIdentity
} from './identity-provider.js'

const FAKE_PREFIX = 'fake:'

const CompletionSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().trim().min(1).max(200).optional()
})

// Every fake user belongs to the same two teams so org switching can be exercised.
function fakeIdentity(email: string, displayName?: string): VerifiedIdentity {
  const normalized = email.trim().toLowerCase()
  const suffix = createHash('sha256').update(normalized).digest('hex').slice(0, 8)
  return {
    provider: 'fake',
    externalId: `${FAKE_PREFIX}${normalized}`,
    email: normalized,
    displayName: displayName ?? normalized.split('@')[0]!,
    organizations: [
      { orgId: `fake-personal-${suffix}`, name: 'Personal', role: 'Owner' },
      { orgId: 'fake-team', name: 'Fake Team', role: 'Member' }
    ]
  }
}

export function createFakeIdentityProvider(options: { autoApproveEmail?: string }): IdentityProvider {
  return {
    kind: 'fake',
    autoApprovedIdentity: () =>
      options.autoApproveEmail ? fakeIdentity(options.autoApproveEmail) : null,
    signInPage({ requestId, completeUrl }) {
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="markov-authorization-request" content="${escapeHtml(requestId)}">
<title>Sign in (test mode)</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem}label,input,button{display:block;width:100%;margin:.5rem 0}input,button{padding:.5rem;font-size:1rem}.note{color:#a15c00}</style>
</head>
<body>
<h1>Sign in</h1>
<p class="note">Test mode: no password is checked. Never expose this server beyond this machine.</p>
<form id="fake-sign-in">
<label for="email">Email</label>
<input id="email" name="email" type="email" required value="dev@example.com">
<label for="displayName">Name</label>
<input id="displayName" name="displayName" type="text" value="Dev User">
<button type="submit">Continue</button>
</form>
<p id="error" role="alert"></p>
<script>
document.getElementById('fake-sign-in').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.target)
  const response = await fetch(${JSON.stringify(completeUrl)}, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: ${JSON.stringify(requestId)}, email: form.get('email'), displayName: form.get('displayName') })
  })
  const body = await response.json().catch(() => ({}))
  if (response.ok && body.redirectTo) { window.location.replace(body.redirectTo); return }
  document.getElementById('error').textContent = 'Sign-in failed: ' + (body.error || response.status)
})
</script>
</body>
</html>`
      return {
        html,
        contentSecurityPolicy:
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"
      }
    },
    async verifyCompletion(body) {
      const parsed = CompletionSchema.safeParse(body)
      return parsed.success ? fakeIdentity(parsed.data.email, parsed.data.displayName) : null
    },
    async lookup(externalId) {
      if (!externalId.startsWith(FAKE_PREFIX)) return { status: 'gone' }
      return { status: 'found', identity: fakeIdentity(externalId.slice(FAKE_PREFIX.length)) }
    }
  }
}
