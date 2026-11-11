import type { SettingsSearchEntry } from '../search/settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../search/settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getChatConnectorsExperimentalSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.chatConnectorsExperimental.title',
      'Chat connectors'
    ),
    description: translate(
      'auto.components.settings.chatConnectorsExperimental.description',
      'Let threads in Slack start and steer Claude Code or Codex in your projects on this computer. Requires sign-in.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.chatConnectorsExperimental.keywordSlack',
        'slack'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.chatConnectorsExperimental.keywordConnector',
        'connector'
      )
    ],
    targetSectionId: 'chat-connectors'
  })
)
