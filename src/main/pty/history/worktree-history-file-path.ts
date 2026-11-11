/** Drop inherited Markov history paths so nested apps cannot reuse the outer pane's worktree history. */

/** Must match hashWorktreeId. */
const WORKTREE_HASH = '[0-9a-f]{16}'
const HISTORY_FILE = '(?:zsh|bash)_history'

// Match layout rather than a resolved root: daemon and relay cannot derive desktop userData.
const MARKOV_MINTED_HISTFILE = new RegExp(
  '/(?:' +
    // Desktop: <userData>/terminal-history/<hash>/<file>
    `terminal-history/${WORKTREE_HASH}/${HISTORY_FILE}` +
    '|' +
    // Desktop WSL retains this tail after translation to /mnt/<drive>/... .
    `terminal-history-wsl/[^/]+/${WORKTREE_HASH}/${HISTORY_FILE}` +
    '|' +
    // Relay: ~/.markov-remote/terminal-history/<hash>-<file>
    `\\.markov-remote/terminal-history/${WORKTREE_HASH}-${HISTORY_FILE}` +
    ')$'
)

export function isMarkovMintedHistFile(value: string | undefined): boolean {
  return typeof value === 'string' && MARKOV_MINTED_HISTFILE.test(value.replace(/\\/g, '/'))
}

export function dropInheritedMarkovHistFile(env: Record<string, string | undefined>): void {
  if (isMarkovMintedHistFile(env.HISTFILE)) {
    delete env.HISTFILE
  }
}
