import {
  AzureDevOpsIntegrationCard,
  GiteaIntegrationCard
} from '../../integrations/source-control/token-source-control-integration-cards'
import { BitbucketIntegrationCard } from '../../integrations/source-control/bitbucket-integration-card'
import {
  GitHubIntegrationCard,
  GitLabIntegrationCard
} from '../../integrations/source-control/cli-source-control-integration-cards'
import { JiraIntegrationCard } from '../../integrations/task-trackers/jira-integration-card'
import { LinearIntegrationCard } from '../../integrations/task-trackers/linear-integration-card'
import { useIntegrationProviderStatusRefresh } from '../../../hooks/use-integration-provider-status-refresh'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { getProviderAccountScope } from '../../provider-accounts/provider-account-scope'
import {
  ProviderHostScopeControl,
  ProviderHostScopeStatedOnce
} from '../../provider-accounts/ProviderHostScopeControl'
import { useIntegrationSubordinateRowClass } from '../../integrations/presentation/integration-card-presentation'

export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()
  const settings = useAppStore((state) => state.settings)
  const scopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  return (
    <div className="space-y-5">
      {/* Every provider here keeps its credentials on the same computer, so it is said once. */}
      <ProviderHostScopeControl
        standalone
        labelPrefix={translate(
          'auto.components.settings.cli.source.control.integration.cards.account_scope_prefix',
          'Account scope'
        )}
        scope={getProviderAccountScope(settings)}
        className={scopeRowClass}
      />
      <ProviderHostScopeStatedOnce value>
        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {translate(
                'auto.components.settings.IntegrationsPane.298c65ecac',
                'Review providers'
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.IntegrationsPane.1683acbac4',
                'Connect the source hosts Markov can use for pull requests, merge requests, checks, and review status.'
              )}
            </p>
          </div>
          <div className="space-y-3">
            <GitHubIntegrationCard />
            <GitLabIntegrationCard />
            <BitbucketIntegrationCard />
            <AzureDevOpsIntegrationCard />
            <GiteaIntegrationCard />
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {translate('auto.components.settings.IntegrationsPane.70e885705b', 'Task providers')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.IntegrationsPane.3ba07f933b',
                'Connect issue trackers Markov can use to browse tasks and start workspaces with linked context.'
              )}
            </p>
          </div>
          <div className="space-y-3">
            <LinearIntegrationCard />
            <JiraIntegrationCard />
          </div>
        </section>
      </ProviderHostScopeStatedOnce>
    </div>
  )
}
