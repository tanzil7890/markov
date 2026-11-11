import type { MarkovProfileAuthStatus } from '../../../shared/markov-profiles'

export const PREFERRED_NAME_MAX_LENGTH = 40

/** First word of the account's display name, the starting suggestion for what to call the user. */
export function suggestPreferredName(authStatus: MarkovProfileAuthStatus | null): string {
  const displayName = authStatus?.state === 'connected' ? authStatus.cloud?.displayName : undefined
  const firstWord = displayName?.trim().split(/\s+/)[0] ?? ''
  return firstWord.slice(0, PREFERRED_NAME_MAX_LENGTH)
}

/** The name to greet the user with: their own choice, then the account name, else null. */
export function resolveUserDisplayName(
  preferredName: string | undefined,
  authStatus: MarkovProfileAuthStatus | null
): string | null {
  const chosen = preferredName?.trim()
  if (chosen) {
    return chosen
  }
  const accountName = authStatus?.state === 'connected' ? authStatus.cloud?.displayName?.trim() : ''
  return accountName || null
}

/** Up to two initials for an avatar, or null when there is no name to draw from. */
export function nameInitials(name: string): string | null {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  return initials || null
}
