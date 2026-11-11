import { hostname } from 'node:os'
import { getAppEnvironment } from '../../shared/app-environment'
import { admitConnectorAgent, CONNECTOR_AGENTS } from '../external-conversations/connector-agents'
import { runtimeConversationHost } from '../external-conversations/external-conversation-seam'
import { getMarkovCloudAuthConfig } from '../markov-profiles/profile-cloud-auth-config'
import type { MarkovRuntimeService } from '../runtime/markov-runtime'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import { ConnectorCloud } from './connector-cloud'
import { resolveConnectorOrigin } from './connector-origin'
import { connectorProjects, type ConnectorPlacesStore } from './connector-places'
import { connectorAccount, desktopConnectorTokenMint } from './connector-token-mint'

export type ConnectorCloudStore = ConnectorPlacesStore &
  Pick<RuntimeStore, 'getSettings' | 'onSettingsChanged'>

/** Desktop only: the connector acts as the desktop's Markov account; `markov serve` has no sign-in yet. */
export function createDesktopConnectorCloud(
  runtime: MarkovRuntimeService,
  store: ConnectorCloudStore,
  userDataPath: string,
  isFenced: () => boolean
): ConnectorCloud | null {
  const auth = getMarkovCloudAuthConfig()
  if (!auth.configured) {
    return null
  }
  const environment = getAppEnvironment()
  return new ConnectorCloud({
    userDataPath,
    origin: resolveConnectorOrigin(process.env, environment.isPackaged()),
    isFenced,
    account: () => connectorAccount(userDataPath),
    mintFor: (account) => desktopConnectorTokenMint(auth.config, userDataPath, account),
    machine: {
      runtime: 'desktop',
      markovVersion: environment.getVersion(),
      hostName: hostname(),
      seam: () => runtime.getExternalConversationSeam(),
      conversationHost: () => runtimeConversationHost(runtime),
      agents: () =>
        CONNECTOR_AGENTS.filter((agent) => admitConnectorAgent(store.getSettings(), agent)),
      projects: () => connectorProjects(store),
      onConnectorsToggled: (listener) => {
        store.onSettingsChanged?.((updates) => {
          if ('experimentalConnectors' in updates) {
            listener()
          }
        })
      }
    }
  })
}
