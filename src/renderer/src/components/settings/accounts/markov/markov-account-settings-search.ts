import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../../search/settings-search-keywords'

export const getMarkovAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.markovAccount.account', 'Markov account'),
    description: translate(
      'auto.components.settings.markovAccount.searchDescription',
      'Sign in or out of the account used by Artifacts and Markov Relay.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordAccount', 'account'),
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordLogout', 'logout'),
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordSignIn', 'sign in'),
      ...translateSearchKeyword(
        'auto.components.settings.markovAccount.keywordSignOut',
        'sign out'
      ),
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordRelay', 'relay'),
      ...translateSearchKeyword('auto.components.settings.markovAccount.keywordCloud', 'cloud')
    ]
  }
])
