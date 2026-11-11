import { expect, test } from './helpers/markov-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { crashGuestRenderer } from './browser-guest-runtime-oracle'
import { observeBrowserLoadingSurface } from './browser-loading-surface-oracle'

test('browser host follows the theme before content and preserves the webpage canvas', async ({
  markovPage,
  electronApp
}, testInfo) => {
  await waitForSessionReady(markovPage)
  await ensureTerminalVisible(markovPage)
  await waitForActiveWorktree(markovPage)
  const observations = await observeBrowserLoadingSurface(
    markovPage,
    (name) => testInfo.outputPath(name),
    async (id) => {
      await crashGuestRenderer(electronApp, id)
    }
  )
  expect(observations.filter((entry) => !entry.pass)).toEqual([])
})
