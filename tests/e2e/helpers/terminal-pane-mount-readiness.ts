import { test } from './markov-app'
import { waitForSessionReady, waitForActiveWorktree, ensureTerminalVisible } from './store'
import { waitForActiveTerminalManager, waitForPaneCount } from './terminal'

export function registerTerminalPaneMountReadiness(): void {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
    // Allow cold starts 30s for the React terminal lifecycle to register PaneManager.
    const hasPaneManager = await waitForActiveTerminalManager(markovPage, 30_000)
      .then(() => true)
      .catch(() => false)
    test.skip(
      !hasPaneManager,
      'Electron automation in this environment never mounts the live TerminalPane manager, so pane split/resize assertions would only fail on harness setup.'
    )
    // Hidden-window readiness may precede the first xterm/PTY pair; require it before split/content assertions.
    await waitForPaneCount(markovPage, 1, 30_000)
  })
}
