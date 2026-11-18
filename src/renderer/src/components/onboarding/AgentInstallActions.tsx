import { Download, ExternalLink, Loader2, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { translate } from '@/i18n/i18n'
import type { OneClickInstallState } from './use-agent-cli-one-click-install'

/** The row's status line while an agent is missing or installing. */
export function agentInstallStatusText(state: OneClickInstallState): string {
  if (state.kind === 'running') {
    return state.stage === 'downloading' && state.percent !== null
      ? translate('components.onboarding.agentSetup.downloading', 'Downloading… {{percent}}%', {
          percent: state.percent
        })
      : state.stage === 'downloading'
        ? translate('components.onboarding.agentSetup.downloadingNoPercent', 'Downloading…')
        : translate(
            'components.onboarding.agentSetup.runningInstaller',
            'Running the official installer…'
          )
  }
  if (state.kind === 'finishing') {
    return translate('components.onboarding.agentSetup.finishing', 'Installed. Checking…')
  }
  if (state.kind === 'failed') {
    return translate(
      'components.onboarding.agentSetup.installFailed',
      'Install failed: {{error}}',
      {
        error: state.error
      }
    )
  }
  return translate(
    'components.onboarding.agentSetup.notInstalled',
    'Not installed on this computer'
  )
}

type AgentInstallActionsProps = {
  state: OneClickInstallState
  /** False or still unknown: Install opens the terminal instead. */
  oneClickSupported: boolean | null
  onInstall: () => void
  terminalOpen: boolean
  onOpenTerminal: () => void
  homepageUrl: string | undefined
  isDetecting: boolean
  onRecheck: () => void
}

export function AgentInstallActions({
  state,
  oneClickSupported,
  onInstall,
  terminalOpen,
  onOpenTerminal,
  homepageUrl,
  isDetecting,
  onRecheck
}: AgentInstallActionsProps): React.JSX.Element {
  if (state.kind === 'running' || state.kind === 'finishing') {
    return <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
  }
  const oneClick = oneClickSupported === true
  const failed = state.kind === 'failed'
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!oneClick && terminalOpen}
        onClick={oneClick ? onInstall : onOpenTerminal}
      >
        {oneClick ? <Download className="size-3.5" /> : <Terminal className="size-3.5" />}
        {failed
          ? translate('components.onboarding.agentSetup.tryAgain', 'Try again')
          : translate('components.onboarding.agentSetup.install', 'Install')}
      </Button>
      {oneClick && failed ? (
        <Button variant="ghost" size="sm" disabled={terminalOpen} onClick={onOpenTerminal}>
          <Terminal className="size-3.5" />
          {translate('components.onboarding.agentSetup.installInTerminal', 'Install in terminal')}
        </Button>
      ) : null}
      {homepageUrl ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => openAppHttpLink(homepageUrl, { event })}
        >
          <ExternalLink className="size-3.5" />
          {translate('auto.components.onboarding.AgentStep.9c163bb0e0', 'Install instructions')}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={isDetecting} onClick={onRecheck}>
        {isDetecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
      </Button>
    </>
  )
}
