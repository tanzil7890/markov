import type { AccountsConfig } from '../config.js'
import { createClerkIdentityProvider } from './clerk-identity-provider.js'
import { createFakeIdentityProvider } from './fake-identity-provider.js'
import type { IdentityProvider } from './identity-provider.js'

export function createIdentityProvider(config: AccountsConfig): IdentityProvider {
  return config.identity.kind === 'fake'
    ? createFakeIdentityProvider(
        config.identity.autoApproveEmail ? { autoApproveEmail: config.identity.autoApproveEmail } : {}
      )
    : createClerkIdentityProvider({
        secretKey: config.identity.secretKey,
        publishableKey: config.identity.publishableKey,
        publicUrl: config.publicUrl
      })
}
