import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { AgentIcon, getAgentCatalog } from '@/lib/agent-catalog'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { translate } from '@/i18n/i18n'
import { isMacUserAgent, isWindowsUserAgent } from '@/components/terminal-pane/pane-helpers'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '../../../../shared/managed-account-types'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { OnboardingInlineCommandTerminal } from './OnboardingInlineCommandTerminal'
import { getAgentCliInstallPlan, type OnboardingSetupAgent } from './agent-cli-install-commands'

type AgentSignIn = { signedIn: boolean; email: string | null }

function agentLabel(agent: OnboardingSetupAgent): string {
  return agent === 'claude'
    ? translate('components.onboarding.agentSetup.claude.label', 'Claude Code')
    : translate('components.onboarding.agentSetup.codex.label', 'Codex')
}

function signInLabel(agent: OnboardingSetupAgent): string {
  return agent === 'claude'
    ? translate('components.onboarding.agentSetup.claude.signIn', 'Sign in with Claude')
    : translate('components.onboarding.agentSetup.codex.signIn', 'Sign in with ChatGPT')
}

function claudeSignIn(state: ClaudeRateLimitAccountsState): AgentSignIn {
  const activeId = state.activeAccountIdsByRuntime?.host ?? state.activeAccountId
  const active = state.accounts.find((account) => account.id === activeId)
  if (active) {
    return { signedIn: true, email: active.email }
  }
  return state.systemDefaultEmail
    ? { signedIn: true, email: state.systemDefaultEmail }
    : { signedIn: false, email: null }
}

function codexSignIn(state: CodexRateLimitAccountsState): AgentSignIn {
  const activeId = state.activeAccountIdsByRuntime?.host ?? state.activeAccountId
  const active = state.accounts.find((account) => account.id === activeId)
  if (active) {
    return { signedIn: true, email: active.email }
  }
  return state.systemDefault?.hasAuth
    ? { signedIn: true, email: state.systemDefault.email }
    : { signedIn: false, email: null }
}

async function readAgentSignIn(agent: OnboardingSetupAgent): Promise<AgentSignIn> {
  return agent === 'claude'
    ? claudeSignIn(await window.api.claudeAccounts.list())
    : codexSignIn(await window.api.codexAccounts.list())
}

async function addClaudeAccountAndSelectIfNone(): Promise<AgentSignIn> {
  const before = await window.api.claudeAccounts.list()
  const knownIds = new Set(before.accounts.map((account) => account.id))
  const hadSelection = (before.activeAccountIdsByRuntime?.host ?? before.activeAccountId) !== null
  let after = await window.api.claudeAccounts.add({ runtime: 'host' })
  const added = after.accounts.find((account) => !knownIds.has(account.id))
  // Why: Codex activates a first account on sign-in; Claude does not, so match Codex here.
  if (added && !hadSelection) {
    after = await window.api.claudeAccounts.select({ accountId: added.id, runtime: 'host' })
  }
  return claudeSignIn(after)
}

async function addAgentAccount(agent: OnboardingSetupAgent): Promise<AgentSignIn> {
  return agent === 'claude'
    ? addClaudeAccountAndSelectIfNone()
    : codexSignIn(await window.api.codexAccounts.add({ runtime: 'host' }))
}

function installPlatform(): 'darwin' | 'linux' | 'win32' {
  return isWindowsUserAgent() ? 'win32' : isMacUserAgent() ? 'darwin' : 'linux'
}

function AgentSetupRow({
  agent,
  installed,
  isDetecting,
  onRecheck
}: {
  agent: OnboardingSetupAgent
  installed: boolean
  isDetecting: boolean
  onRecheck: () => void
}): React.JSX.Element {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [signIn, setSignIn] = useState<AgentSignIn | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const cancelledRef = useRef(false)
  const plan = getAgentCliInstallPlan(agent, installPlatform())
  const label = agentLabel(agent)
  const homepageUrl = getAgentCatalog().find((entry) => entry.id === agent)?.homepageUrl

  useEffect(() => {
    if (!installed) {
      return
    }
    // The install finished: its output has done its job and sign-in takes the row over.
    setTerminalOpen(false)
    let cancelled = false
    void readAgentSignIn(agent).then(
      (result) => {
        if (!cancelled) {
          setSignIn(result)
        }
      },
      () => {
        if (!cancelled) {
          setSignIn({ signedIn: false, email: null })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [agent, installed])

  const startSignIn = useCallback(async () => {
    cancelledRef.current = false
    setSigningIn(true)
    try {
      setSignIn(await addAgentAccount(agent))
    } catch (error) {
      // Cancel ends the pending login with an error; the person asked for that, so stay quiet.
      if (cancelledRef.current) {
        return
      }
      toast.error(
        translate(
          'components.onboarding.agentSetup.signInFailed',
          'Could not sign in to {{agent}}',
          {
            agent: label
          }
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setSigningIn(false)
    }
  }, [agent, label])

  const cancelSignIn = (): void => {
    cancelledRef.current = true
    const cancel =
      agent === 'claude'
        ? window.api.claudeAccounts.cancelPendingLogin()
        : window.api.codexAccounts.cancelPendingLogin()
    void cancel.catch(() => {})
  }

  const connected = installed && signIn?.signedIn === true
  const status = !installed
    ? translate('components.onboarding.agentSetup.notInstalled', 'Not installed on this computer')
    : connected
      ? signIn?.email
        ? translate('components.onboarding.agentSetup.signedInAs', 'Signed in as {{email}}', {
            email: signIn.email
          })
        : translate('components.onboarding.agentSetup.signedIn', 'Signed in')
      : agent === 'claude'
        ? translate(
            'components.onboarding.agentSetup.claude.signInHint',
            'Installed. If you already use Claude Code on this computer, you can skip signing in.'
          )
        : translate(
            'components.onboarding.agentSetup.codex.signInHint',
            'Installed. Sign in with your ChatGPT plan.'
          )

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <AgentIcon agent={agent} size={20} />
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground">{label}</h3>
            {connected ? (
              <IntegrationStatusPill tone="connected">
                {translate('auto.components.onboarding.IntegrationsStep.c91a5782f1', 'Connected')}
              </IntegrationStatusPill>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[13px] leading-relaxed text-muted-foreground">
            {status}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!installed ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={terminalOpen}
                onClick={() => setTerminalOpen(true)}
              >
                <Terminal className="size-3.5" />
                {translate('components.onboarding.agentSetup.install', 'Install')}
              </Button>
              {homepageUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => openAppHttpLink(homepageUrl, { event })}
                >
                  <ExternalLink className="size-3.5" />
                  {translate(
                    'auto.components.onboarding.AgentStep.9c163bb0e0',
                    'Install instructions'
                  )}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" disabled={isDetecting} onClick={onRecheck}>
                {isDetecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
              </Button>
            </>
          ) : null}
          {installed && !connected && signIn !== null ? (
            signingIn ? (
              <>
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {translate(
                    'components.onboarding.agentSetup.waitingForBrowser',
                    'Waiting for your browser…'
                  )}
                </span>
                <Button variant="ghost" size="sm" onClick={cancelSignIn}>
                  {translate('auto.components.MarkovSignInProgress.cancel', 'Cancel')}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void startSignIn()}>
                <ExternalLink className="size-3.5" />
                {signInLabel(agent)}
              </Button>
            )
          ) : null}
        </div>
      </div>
      {!installed && terminalOpen ? (
        <div className="px-4 pb-4">
          <OnboardingInlineCommandTerminal
            command={plan.command}
            shellOverride={plan.shellOverride}
            forceHostRuntime
            title={translate('components.onboarding.agentSetup.installTitle', 'Install {{agent}}', {
              agent: label
            })}
            ariaLabel={translate(
              'components.onboarding.agentSetup.installAriaLabel',
              '{{agent}} install command',
              { agent: label }
            )}
            description={translate(
              'components.onboarding.agentSetup.installDescription',
              'Press Enter to run the official installer. Markov checks again when it finishes.'
            )}
            terminalHeightPx={200}
            terminalTopMarginPx={0}
            autoScrollIntoView={false}
            onCommandFinished={onRecheck}
            onTerminalExit={onRecheck}
          />
        </div>
      ) : null}
    </div>
  )
}

type AgentSetupStepProps = {
  detectedSet: Set<TuiAgent>
  isDetecting: boolean
  onRecheck: () => void
}

export function AgentSetupStep({
  detectedSet,
  isDetecting,
  onRecheck
}: AgentSetupStepProps): React.JSX.Element {
  return (
    <div className="max-w-190 space-y-3">
      {(['claude', 'codex'] as const).map((agent) => (
        <AgentSetupRow
          key={agent}
          agent={agent}
          installed={detectedSet.has(agent)}
          isDetecting={isDetecting}
          onRecheck={onRecheck}
        />
      ))}
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        {translate(
          'components.onboarding.agentSetup.footnote',
          'Markov runs each agent’s official CLI. You sign in on claude.ai or chatgpt.com, and the sign-in stays with that CLI. You pick your default agent, including others, in a moment.'
        )}
      </p>
    </div>
  )
}
