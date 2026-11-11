// Require scrollback retention across tab, pane and worktree changes.

import { test, expect } from './helpers/markov-app'
import {
  discoverActivePtyId,
  execInTerminal,
  closeActiveTerminalPane,
  countVisibleTerminalPanes,
  focusLastTerminalPane,
  splitActiveTerminalPane,
  waitForTerminalOutput,
  waitForPaneCount,
  getTerminalContent
} from './helpers/terminal'
import {
  getActiveWorktreeId,
  getActiveTabType,
  getWorktreeTabs,
  getAllWorktreeIds,
  switchToOtherWorktree,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { pressShortcut } from './helpers/shortcuts'
import { registerTerminalPaneMountReadiness } from './helpers/terminal-pane-mount-readiness'

// Serialize headful scenarios; visible-window runs require an isolated display.
test.describe.configure({ mode: 'serial' })
test.describe('Terminal Panes', () => {
  registerTerminalPaneMountReadiness()

  test('terminal pane retains content when switching tabs and back', async ({ markovPage }) => {
    const ptyId = await discoverActivePtyId(markovPage)
    const marker = `RETAIN_TEST_${Date.now()}`
    await execInTerminal(markovPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(markovPage, marker)

    const worktreeId = (await getActiveWorktreeId(markovPage))!
    await pressShortcut(markovPage, 't')

    await expect
      .poll(async () => (await getWorktreeTabs(markovPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    const activeType = await getActiveTabType(markovPage)
    expect(activeType).toBe('terminal')

    await pressShortcut(markovPage, 'BracketLeft', { shift: true })

    await expect
      .poll(async () => (await getTerminalContent(markovPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)

    await pressShortcut(markovPage, 'BracketRight', { shift: true })
    await pressShortcut(markovPage, 'w')
  })

  test('terminal pane retains content when splitting and closing a pane', async ({
    markovPage
  }) => {
    const ptyId = await discoverActivePtyId(markovPage)
    const marker = `SPLIT_RETAIN_${Date.now()}`
    await execInTerminal(markovPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(markovPage, marker)

    const panesBefore = await countVisibleTerminalPanes(markovPage)

    await splitActiveTerminalPane(markovPage, 'vertical')
    await waitForPaneCount(markovPage, panesBefore + 1)

    await focusLastTerminalPane(markovPage)
    await closeActiveTerminalPane(markovPage)
    await waitForPaneCount(markovPage, panesBefore)

    await expect
      .poll(async () => (await getTerminalContent(markovPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)
  })

  test('terminal pane retains content when switching worktrees and back', async ({
    markovPage
  }) => {
    const allWorktreeIds = await getAllWorktreeIds(markovPage)
    if (allWorktreeIds.length < 2) {
      test.skip(true, 'Need at least 2 worktrees to test worktree switching')
      return
    }

    const worktreeId = (await getActiveWorktreeId(markovPage))!

    const ptyId = await discoverActivePtyId(markovPage)
    const marker = `WT_RETAIN_${Date.now()}`
    await execInTerminal(markovPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(markovPage, marker)

    const otherId = await switchToOtherWorktree(markovPage, worktreeId)
    expect(otherId).not.toBeNull()
    await expect.poll(async () => getActiveWorktreeId(markovPage), { timeout: 5_000 }).toBe(otherId)

    await switchToWorktree(markovPage, worktreeId)
    await expect
      .poll(async () => getActiveWorktreeId(markovPage), { timeout: 5_000 })
      .toBe(worktreeId)

    // Poll the retained marker after worktree return: serialize-addon rebind can lag the activation cascade, so avoid an earlier manager-timing assertion.
    await ensureTerminalVisible(markovPage)

    await expect
      .poll(async () => (await getTerminalContent(markovPage)).includes(marker), {
        timeout: 20_000
      })
      .toBe(true)
  })
})
