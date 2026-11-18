import { translate } from '@/i18n/i18n'
import type { SettingsSettingRequest } from '../navigation/settings-setting-request'

export const REPOSITORY_PANE_TAB_IDS = [
  'identity',
  'worktrees',
  'scripts',
  'git',
  'advanced'
] as const

export type RepositoryPaneTabId = (typeof REPOSITORY_PANE_TAB_IDS)[number]

export function getRepositoryPaneTabTitles(): Record<RepositoryPaneTabId, string> {
  return {
    identity: translate('auto.components.settings.RepositoryPane.499a437335', 'Identity'),
    worktrees: translate('settings.repository.tabs.worktrees', 'Worktrees'),
    scripts: translate('settings.repository.tabs.scripts', 'Scripts'),
    git: translate('settings.repository.tabs.git', 'Git & AI'),
    advanced: translate('auto.components.settings.Settings.1c87f8d024', 'Advanced')
  }
}

/** The tab that holds a requested setting, or null when the request names nothing in this pane. */
export function repositoryPaneTabForRequest(
  request: Pick<SettingsSettingRequest, 'targetId' | 'title'>,
  tabByEntryTitle: ReadonlyMap<string, RepositoryPaneTabId>
): RepositoryPaneTabId | null {
  const { targetId } = request
  if (targetId?.endsWith('-local-commands')) {
    return 'scripts'
  }
  if (targetId?.endsWith('-icon')) {
    return 'identity'
  }
  if (targetId?.includes('-source-control-ai')) {
    return 'git'
  }
  return (request.title ? tabByEntryTitle.get(request.title) : undefined) ?? null
}
