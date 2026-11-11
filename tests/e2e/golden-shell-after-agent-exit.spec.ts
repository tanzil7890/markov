import { expect, test } from './helpers/markov-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  GOLDEN_STUB_EXIT_MARKER,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForRestoredTerminalInputReady } from './helpers/restored-terminal-input-readiness'
import {
  focusActiveTerminalInput,
  waitForActivePanePtyId,
  waitForTerminalOutput
} from './helpers/terminal'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

// Split the marker so terminal input echo cannot impersonate successful shell execution.
function buildSplitMarkerEcho(prefix: string, suffix: string): { command: string; marker: string } {
  const command =
    process.platform === 'win32'
      ? `Write-Output ('${prefix}' + '${suffix}')`
      : `echo "${prefix}""${suffix}"`
  return { command, marker: `${prefix}${suffix}` }
}

test('opens a clean live shell after an agent exits', async ({ markovPage }) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await ensureTerminalVisible(markovPage)
  await configureGoldenStubAgent(markovPage)
  await launchGoldenStubAgentFromNewTab(markovPage)

  await markovPage.keyboard.type('exit')
  await markovPage.keyboard.press('Enter')
  await waitForTerminalOutput(markovPage, GOLDEN_STUB_EXIT_MARKER, 15_000)

  const tabsBeforeShell = await markovPage.locator('[data-testid="sortable-tab"]').count()
  await markovPage.getByRole('button', { name: 'New tab' }).click({ force: true })
  await markovPage
    .getByRole('menuitem', { name: /New Terminal/i })
    .first()
    .click({ force: true })
  await expect(markovPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabsBeforeShell + 1)
  const shellPtyId = await waitForActivePanePtyId(markovPage)
  // A bound pane can precede transport readiness; wait or marker keystrokes may be dropped.
  expect(await waitForRestoredTerminalInputReady(markovPage, shellPtyId)).toBe(true)

  const afterAgent = buildSplitMarkerEcho('after-', 'agent')
  await focusActiveTerminalInput(markovPage)
  await markovPage.keyboard.type(afterAgent.command)
  await markovPage.keyboard.press('Enter')
  await waitForTerminalOutput(markovPage, afterAgent.marker, 15_000)

  const afterShiftEnter = buildSplitMarkerEcho('after-shift-', 'enter')
  await markovPage.keyboard.press('Shift+Enter')
  await markovPage.keyboard.type(afterShiftEnter.command)
  await markovPage.keyboard.press('Enter')
  await waitForTerminalOutput(markovPage, afterShiftEnter.marker, 15_000)
  await expect(markovPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabsBeforeShell + 1)
})
