import { app } from 'electron'
import {
  cleanCloudServiceUrl as cleanUrl,
  cleanCloudServiceOrigin as cleanOrigin
} from '../../shared/cloud-service-url'
import { resolvePushGatewayOrigin } from '../runtime/push/push-gateway-origin'

export type MarkovCloudAuthConfig = {
  apiBaseUrl: string
  authorizeEndpoint: string
  sessionEndpoint: string
  refreshEndpoint: string
  capabilitiesEndpoint: string
  profileEndpoint: string
  orgEndpoint: string
  logoutEndpoint: string
  relayTokenEndpoint: string
  connectorTokenEndpoint: string
  relayDirectorUrl: string
  clientId: string
  scope: string
}

const DEFAULT_SCOPE = 'openid profile email offline_access'
const PRODUCTION_API_BASE_URL = 'https://login.markov.outhad.com'
const PRODUCTION_CLIENT_ID = 'markov-desktop'
const PRODUCTION_RELAY_DIRECTOR_URL = 'https://relay.markov.outhad.com'

// Packaged main omits NODE_ENV; use packaged status to gate development auth overrides.
function isPackagedMarkovBuild(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString()
}

export function getMarkovCloudAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedMarkovBuild()
):
  | { configured: true; config: MarkovCloudAuthConfig }
  | { configured: false; setupMessage: string } {
  // Plain HTTP token endpoints are development-only.
  const allowLoopbackHttp = !packaged
  const cleanEndpointUrl = (value: string | undefined): string | null =>
    cleanUrl(value, allowLoopbackHttp)
  const configuredApiBaseUrl = env.MARKOV_CLOUD_API_URL?.trim()
  // Packaged builds need defaults; first-party endpoints and public client IDs are not secrets.
  const apiBaseUrl = configuredApiBaseUrl
    ? cleanEndpointUrl(configuredApiBaseUrl)
    : packaged
      ? PRODUCTION_API_BASE_URL
      : null
  const clientId =
    env.MARKOV_CLOUD_CLIENT_ID?.trim() || (packaged ? PRODUCTION_CLIENT_ID : undefined)
  if (!apiBaseUrl || !clientId) {
    return {
      configured: false,
      setupMessage: 'Markov Cloud sign-in is not configured for this build.'
    }
  }

  const authBaseUrl = cleanEndpointUrl(env.MARKOV_CLOUD_AUTH_URL) ?? apiBaseUrl
  return {
    configured: true,
    config: {
      apiBaseUrl,
      authorizeEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_AUTHORIZE_URL) ??
        endpoint(authBaseUrl, '/v1/desktop/auth/authorize'),
      sessionEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_SESSION_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/session'),
      refreshEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_REFRESH_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/refresh'),
      capabilitiesEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_CAPABILITIES_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/capabilities'),
      profileEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_PROFILE_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/profile'),
      orgEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_ORG_URL) ?? endpoint(apiBaseUrl, '/v1/desktop/auth/org'),
      logoutEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_LOGOUT_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/logout'),
      relayTokenEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_RELAY_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/relay-token'),
      connectorTokenEndpoint:
        cleanEndpointUrl(env.MARKOV_CLOUD_CONNECTOR_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/connector-token'),
      relayDirectorUrl:
        cleanOrigin(env.MARKOV_RELAY_URL, allowLoopbackHttp) ?? PRODUCTION_RELAY_DIRECTOR_URL,
      clientId,
      scope: env.MARKOV_CLOUD_AUTH_SCOPE?.trim() || DEFAULT_SCOPE
    }
  }
}

/** Host-key authentication keeps phone push available without a signed-in account. */
export function getMarkovPushGatewayUrl(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedMarkovBuild()
): string {
  return resolvePushGatewayOrigin(env, packaged)
}

export function allowsPlaintextMarkovCloudSession(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedMarkovBuild()
): boolean {
  return (
    env.MARKOV_CLOUD_ALLOW_PLAINTEXT_SESSION === '1' && env.NODE_ENV !== 'production' && !packaged
  )
}

export function isMarkovCloudDevAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedMarkovBuild()
): boolean {
  return env.MARKOV_CLOUD_DEV_AUTH === '1' && env.NODE_ENV !== 'production' && !packaged
}
