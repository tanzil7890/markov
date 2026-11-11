export type VerifiedOrganization = { orgId: string; name: string; role?: string }

export type VerifiedIdentity = {
  provider: 'clerk' | 'fake'
  externalId: string
  email: string
  displayName?: string
  organizations: VerifiedOrganization[]
}

export type IdentityLookup = { status: 'found'; identity: VerifiedIdentity } | { status: 'gone' }

export type SignInPageInput = { requestId: string; completeUrl: string }

export type SignInPage = { html: string; contentSecurityPolicy?: string }

export type IdentityProvider = {
  readonly kind: 'clerk' | 'fake'
  // Test-only shortcut: signs this identity in without showing a page.
  autoApprovedIdentity(): VerifiedIdentity | null
  signInPage(input: SignInPageInput): SignInPage
  // Proves who finished the sign-in page; null means the proof was not valid.
  verifyCompletion(body: Record<string, unknown>): Promise<VerifiedIdentity | null>
  // Re-reads the user so revoked users and changed organizations take effect.
  lookup(externalId: string): Promise<IdentityLookup>
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
