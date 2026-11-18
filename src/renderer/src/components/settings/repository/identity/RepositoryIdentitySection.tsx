import type { Repo } from '../../../../../../shared/repo-types'
import { getRepoKindLabel, isFolderRepo } from '../../../../../../shared/repo-kind'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import { Label } from '../../../ui/label'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { RepositoryRemoveProjectButton } from '../RepositoryRemoveProjectButton'
import type { SettingsProjectRemovalScope } from '../../navigation/settings-project-list'
import { getRepositoryIconSectionId } from '../repository-settings-targets'
import { RepositoryIconPicker } from './RepositoryIconPicker'
import { RepoSettingsDraftInput } from '../RepositorySettingsDraftInput'
import { RepositoryJiraProjectSection } from '../RepositoryJiraProjectSection'
import { translate } from '@/i18n/i18n'

/** How the project is named and shown: its name, icon, default Jira project, and the way to remove it. */
export function RepositoryIdentitySection({
  repo,
  removalScope,
  forceVisible,
  updateRepo,
  removeProject
}: {
  repo: Repo
  removalScope: SettingsProjectRemovalScope
  forceVisible: boolean
  updateRepo: React.ComponentProps<typeof RepositoryIconPicker>['updateRepo']
  removeProject: (repoId: string) => void
}): React.JSX.Element {
  const isFolder = isFolderRepo(repo)
  const selectedHostId = getRepoExecutionHostId(repo)
  return (
    <section className="relative space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 pr-12">
          <h3 className="text-sm font-semibold">
            {translate('auto.components.settings.RepositoryPane.499a437335', 'Identity')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.RepositoryPane.b0a0c14a1c',
              'Project-specific display details for the sidebar and tabs.'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate('auto.components.settings.RepositoryPane.323debba71', 'Type:')}{' '}
            <span className="text-foreground">{getRepoKindLabel(repo)}</span>
          </p>
          {isFolder ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.RepositoryPane.ee5a290616',
                'Opened as folder. Git features are unavailable for this workspace.'
              )}
            </p>
          ) : null}
        </div>
        <RepositoryRemoveProjectButton
          repo={repo}
          removalScope={removalScope}
          forceVisible={forceVisible}
          removeProject={removeProject}
        />
      </div>

      <SearchableSetting
        title={translate('auto.components.settings.RepositoryPane.c7ef4415de', 'Display Name')}
        description={translate(
          'auto.components.settings.RepositoryPane.b0a0c14a1c',
          'Project-specific display details for the sidebar and tabs.'
        )}
        keywords={[repo.displayName, repo.path, 'project name', 'repository name']}
        className="space-y-2"
        forceVisible={forceVisible}
      >
        <Label htmlFor={`repo-display-name-${repo.id}`} className="text-sm font-semibold">
          {translate('auto.components.settings.RepositoryPane.c7ef4415de', 'Display Name')}
        </Label>
        <RepoSettingsDraftInput
          id={`repo-display-name-${repo.id}`}
          repoId={repo.id}
          storeValue={repo.displayName}
          onTextChange={(text) => updateRepo(repo.id, { displayName: text })}
          className="h-9 text-sm"
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.RepositoryPane.26fef02bf3', 'Project Icon')}
        description={translate(
          'auto.components.settings.RepositoryPane.e641c359de',
          'Project icon and color used in the sidebar and tabs.'
        )}
        keywords={[
          repo.displayName,
          repo.path,
          'project icon',
          'repository icon',
          'color',
          'badge',
          'emoji',
          'favicon'
        ]}
        className="space-y-2"
        id={getRepositoryIconSectionId(repo.id)}
        forceVisible={forceVisible}
      >
        <RepositoryIconPicker repo={repo} updateRepo={updateRepo} />
      </SearchableSetting>

      <RepositoryJiraProjectSection
        key={`${selectedHostId}:${repo.id}`}
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
    </section>
  )
}
