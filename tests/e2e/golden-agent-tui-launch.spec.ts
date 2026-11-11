import { expect, test } from './helpers/markov-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { focusActiveTerminalInput, getTerminalContent } from './helpers/terminal'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

test('launches an agent TUI with a live multiline composer', async ({ markovPage }) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await ensureTerminalVisible(markovPage)
  await configureGoldenStubAgent(markovPage)
  await launchGoldenStubAgentFromNewTab(markovPage)

  const activeTab = markovPage.locator('[data-testid="sortable-tab"][data-active="true"]')
  await expect(activeTab).toHaveAttribute('data-tab-title', /Codex|Golden Stub Agent/i)

  await focusActiveTerminalInput(markovPage)
  await markovPage.keyboard.type('hello from e2e')
  await markovPage.keyboard.press('Shift+Enter')
  await markovPage.keyboard.type('second line')

  await expect
    .poll(() => getTerminalContent(markovPage), { timeout: 10_000 })
    .toContain('> hello from e2e\r\n  second line')
  expect(await getTerminalContent(markovPage)).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
})
