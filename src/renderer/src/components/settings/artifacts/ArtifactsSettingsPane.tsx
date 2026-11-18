import { ArrowRight, Files } from 'lucide-react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { Button } from '@/components/ui/button'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import { SettingsHowToGuide, type SettingsHowToStep } from '../section-layout/SettingsHowToGuide'
import { useMarkovProfileAuthStatusRefresh } from '@/hooks/use-markov-profile-auth-status-refresh'
import { useAppStore } from '@/store/index'
import { isWebClientLocation } from '@/lib/web-client-location'
import { translate } from '@/i18n/i18n'
import { MarkovSignInButton, MarkovSignInWaitNotice } from '../../MarkovSignInProgress'

export function ArtifactsSettingsPane({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}): React.JSX.Element {
  const openArtifactsPage = useAppStore((state) => state.openArtifactsPage)
  const authStatus = useAppStore((state) => state.markovProfileAuthStatus)
  const signedIn = authStatus?.state === 'connected'
  // Only the desktop host can grant sharing; web clients mirror it because settings.update excludes this capability.
  const isWebClient = isWebClientLocation()
  const sharingEnabled = settings.artifactSharingEnabled === true

  useMarkovProfileAuthStatusRefresh()

  const howToSteps: SettingsHowToStep[] = [
    ...(sharingEnabled
      ? []
      : [
          {
            key: 'enable',
            title: translate(
              'auto.components.settings.artifacts.enableStepTitle',
              'Enable artifact sharing'
            ),
            description: isWebClient
              ? translate(
                  'auto.components.settings.artifacts.enableStepWebDescription',
                  'Open Settings → Artifacts in the Markov desktop app on the host device and enable publishing.'
                )
              : translate(
                  'auto.components.settings.artifacts.enableStepDescription',
                  'Turn on “Allow publishing public artifact links” above.'
                )
          }
        ]),
    {
      key: 'share',
      title: translate(
        'auto.components.settings.artifacts.shareStepTitle',
        'Choose a file to share'
      ),
      description: translate(
        'auto.components.settings.artifacts.shareStepDescription',
        'Open an HTML or Markdown file and select Share as artifact, or ask an agent to share it.'
      )
    },
    {
      key: 'link',
      title: translate('auto.components.settings.artifacts.linkStepTitle', 'Copy the public link'),
      description: translate(
        'auto.components.settings.artifacts.linkStepDescription',
        'After publishing, copy the link and send it to your team.'
      )
    },
    {
      key: 'manage',
      title: translate('auto.components.settings.artifacts.manageStepTitle', 'Manage it in Markov'),
      description: translate(
        'auto.components.settings.artifacts.manageStepDescription',
        'Open Artifacts from the sidebar to preview or remove links.'
      )
    }
  ]

  return (
    <div className="divide-y divide-border">
      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.artifacts.allowPublishing',
          'Allow publishing public artifact links'
        )}
        description={
          isWebClient
            ? translate(
                'auto.components.settings.artifacts.allowPublishingWebDescription',
                'Desktop only. Open Settings → Artifacts on the host device to change this setting.'
              )
            : translate(
                'auto.components.settings.artifacts.allowPublishingDescription',
                'Publish HTML and Markdown files as links anyone with the URL can open. Existing links remain until you delete them from Artifacts.'
              )
        }
        checked={sharingEnabled}
        disabled={isWebClient}
        onChange={() => void updateSettings({ artifactSharingEnabled: !sharingEnabled })}
      />
      <SettingsSwitchRow
        label={translate('auto.components.settings.artifacts.showButton', 'Show Artifacts Button')}
        description={translate(
          'auto.components.settings.artifacts.showButtonDescription',
          'Show the Artifacts shortcut in the sidebar.'
        )}
        checked={settings.showArtifactsButton === true}
        onChange={() => void updateSettings({ showArtifactsButton: !settings.showArtifactsButton })}
      />
      {!signedIn ? (
        <section className="flex flex-wrap items-center gap-4 py-5">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-sm font-medium">
              {translate(
                'auto.components.settings.artifacts.signInTitle',
                'Sign in to share artifacts'
              )}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {translate(
                'auto.components.settings.artifacts.signInDescription',
                'Use your Markov account to upload artifacts and manage their public links.'
              )}
            </p>
          </div>
          <MarkovSignInButton size="sm" disabled={authStatus?.configured !== true}>
            {authStatus?.state === 'reconnect-required'
              ? translate('auto.components.settings.artifacts.signInAgain', 'Sign in again')
              : translate('auto.components.settings.artifacts.signIn', 'Sign in to Markov')}
          </MarkovSignInButton>
          <MarkovSignInWaitNotice className="basis-full" />
        </section>
      ) : null}
      <div className="py-3">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-left hover:bg-muted/35 hover:text-foreground"
          onClick={openArtifactsPage}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <Files className="size-4" />
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-sm font-medium text-foreground">
              {translate('auto.components.settings.artifacts.openArtifacts', 'Open Artifacts')}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {translate(
                'auto.components.settings.artifacts.openArtifactsDescriptionV2',
                'Preview, copy, and manage links shared through your account.'
              )}
            </span>
          </span>
          <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </Button>
      </div>
      <SettingsHowToGuide
        title={translate('auto.components.settings.artifacts.howToTitle', 'How to use Artifacts')}
        description={
          sharingEnabled
            ? translate(
                'auto.components.settings.artifacts.howToDescription',
                'Publish HTML or Markdown files as public links, then share them with your team.'
              )
            : translate(
                'auto.components.settings.artifacts.howToDescriptionDisabled',
                'Enable artifact sharing above to publish HTML or Markdown files as public links.'
              )
        }
        steps={howToSteps}
      />
    </div>
  )
}
