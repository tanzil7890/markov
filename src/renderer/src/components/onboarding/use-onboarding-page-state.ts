import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { suggestPreferredName } from '@/lib/user-preferred-name'
import { isWindowsUserAgent } from '@/components/terminal-pane/pane-helpers'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  shouldSkipAccountStep,
  shouldSkipIntegrationsStep,
  shouldSkipWindowsTerminalStep
} from './onboarding-flow-state'

/** Which optional pages this run hides. */
export function useOnboardingSkipOptions(preflightStatus: AppState['preflightStatus']) {
  const skipAccount = useAppStore((s) => shouldSkipAccountStep(s.markovProfileAuthStatus))
  const skipIntegrations = shouldSkipIntegrationsStep(preflightStatus)
  const skipWindowsTerminal = shouldSkipWindowsTerminalStep(isWindowsUserAgent())
  const skipOptions = useMemo(
    () => ({ skipIntegrations, skipWindowsTerminal, skipAccount }),
    [skipIntegrations, skipWindowsTerminal, skipAccount]
  )
  return { skipOptions, skipIntegrations }
}

/** What to call the user, suggested from the account until they type their own. */
export function useOnboardingPreferredName(settings: GlobalSettings | null) {
  const authStatus = useAppStore((s) => s.markovProfileAuthStatus)
  // Null until the person types, so a late sign-in can still fill in its suggestion.
  const [draft, setPreferredName] = useState<string | null>(null)
  return {
    preferredName: draft ?? settings?.preferredName ?? suggestPreferredName(authStatus),
    setPreferredName
  }
}
