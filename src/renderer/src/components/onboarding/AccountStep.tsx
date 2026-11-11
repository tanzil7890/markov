import { useEffect, useRef } from 'react'
import { BookOpen, Check, ExternalLink, Files, Smartphone, type LucideIcon } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { MarkovSignInButton, MarkovSignInWaitNotice } from '@/components/MarkovSignInProgress'
import { useMarkovProfileAuthStatusRefresh } from '@/hooks/use-markov-profile-auth-status-refresh'

type AccountStepProps = {
  /** Moves the flow on when sign-in finishes here, or when this build turns out to have no sign-in. */
  onAutoContinue: () => void
}

function Benefit({ icon: Icon, label }: { icon: LucideIcon; label: string }): React.JSX.Element {
  return (
    <li className="flex items-center gap-2.5 text-[13px] text-foreground">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {label}
    </li>
  )
}

export function AccountStep({ onAutoContinue }: AccountStepProps): React.JSX.Element {
  const authStatus = useAppStore((state) => state.markovProfileAuthStatus)
  useMarkovProfileAuthStatusRefresh()
  const connected = authStatus?.state === 'connected'
  const unavailable = authStatus?.configured === false
  const email = authStatus?.cloud?.email
  // Why: only a sign-in that completes here advances; arriving already signed in waits for Continue.
  const wasConnectedRef = useRef(connected)
  useEffect(() => {
    if ((connected && !wasConnectedRef.current) || unavailable) {
      onAutoContinue()
    }
    wasConnectedRef.current = connected
  }, [connected, unavailable, onAutoContinue])

  return (
    <div className="max-w-120 space-y-5 rounded-xl border border-border bg-muted/20 p-5">
      {connected ? (
        <p className="flex items-center gap-2.5 text-sm text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-status-success-background text-status-success">
            <Check className="size-3.5" />
          </span>
          <span className="min-w-0 truncate">
            {email
              ? translate('components.onboarding.account.signedInAs', 'Signed in as {{email}}', {
                  email
                })
              : translate('auto.components.settings.markovAccount.connected', 'Connected')}
          </span>
        </p>
      ) : (
        <div className="space-y-3">
          <MarkovSignInButton
            size="lg"
            className="w-full"
            disabled={authStatus?.configured !== true}
          >
            {authStatus?.state === 'reconnect-required'
              ? translate('auto.components.settings.markovAccount.signInAgain', 'Sign in again')
              : translate(
                  'components.onboarding.account.signInWithBrowser',
                  'Sign in with browser'
                )}
            <ExternalLink className="size-4" />
          </MarkovSignInButton>
          <MarkovSignInWaitNotice className="justify-center" />
          {authStatus?.state === 'reconnect-required' ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.markovAccount.reconnectRequired',
                'Your session expired. Sign in again to use cloud features.'
              )}
            </p>
          ) : null}
        </div>
      )}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {translate(
            'auto.components.settings.markovAccount.benefitsTitle',
            'Included with your account'
          )}
        </p>
        <ul className="space-y-2.5">
          <Benefit
            icon={Files}
            label={translate(
              'auto.components.settings.markovAccount.artifactsTitle',
              'Artifact sharing'
            )}
          />
          <Benefit
            icon={Smartphone}
            label={translate('auto.components.settings.markovAccount.relayTitle', 'Markov Relay')}
          />
          <Benefit
            icon={BookOpen}
            label={translate('auto.components.settings.markovAccount.skillsTitle', 'Skill sharing')}
          />
        </ul>
      </div>
    </div>
  )
}
