import { expect, test } from './helpers/markov-app'
import type { Page } from '@playwright/test'
import { focusActiveTerminalInput } from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  browserAddressBar,
  createBrowserSplit,
  createTerminalBrowserSplit,
  focusBrowserAddressBar,
  focusBrowserGroup,
  guestModifier,
  pressKeyInBrowserGuest,
  shortcutModifier as modifier,
  waitForFocusedGroup
} from './helpers/browser-split-fixture'

function browserFindInput(page: Page) {
  return page.getByPlaceholder('Find in page...')
}

function browserFindCloseButton(page: Page) {
  return browserFindInput(page).locator('xpath=..').getByTitle('Close')
}

function browserSplitFindInput(page: Page, browserTabId: string) {
  return page
    .locator(`[data-browser-overlay-tab-id="${browserTabId}"]`)
    .getByPlaceholder('Find in page...')
}

async function pressFindInBrowserGuest(
  page: Page,
  browserTabId: string,
  browserPageId: string
): Promise<void> {
  await pressKeyInBrowserGuest(page, browserTabId, browserPageId, 'F', [guestModifier])
}

function terminalFindInput(page: Page) {
  return page.locator('[data-terminal-search-root] input:visible')
}

test.describe('browser split shortcuts', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
  })

  test('routes repeated Find shortcuts to the focused terminal or browser split', async ({
    markovPage
  }) => {
    const fixture = await createTerminalBrowserSplit(markovPage)

    await markovPage.evaluate(({ terminalGroupId }) => {
      const state = window.__store?.getState()
      const worktreeId = state?.activeWorktreeId
      if (state && worktreeId) {
        state.focusGroup(worktreeId, terminalGroupId)
      }
    }, fixture)
    await focusActiveTerminalInput(markovPage)
    await waitForFocusedGroup(markovPage, fixture.terminalGroupId)
    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(terminalFindInput(markovPage)).toBeFocused()
    await expect(browserFindInput(markovPage)).toBeHidden()
    await markovPage.keyboard.press('Escape')

    await focusBrowserGroup(markovPage, fixture.browserGroupId)
    await focusBrowserAddressBar(markovPage, fixture.browserTabId)
    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(markovPage)).toBeFocused()
    await expect(terminalFindInput(markovPage)).toBeHidden()
    await browserFindCloseButton(markovPage).click()
    await expect(browserFindInput(markovPage)).toBeHidden()

    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(markovPage)).toBeFocused()
    await browserFindCloseButton(markovPage).click()

    await markovPage.evaluate(({ browserTabId }) => {
      window.__store?.getState().closeBrowserTab(browserTabId)
    }, fixture)
    await expect(
      markovPage.locator(`[data-browser-overlay-tab-id="${fixture.browserTabId}"]`)
    ).toHaveCount(0)

    await focusActiveTerminalInput(markovPage)
    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(terminalFindInput(markovPage)).toBeFocused()
    await expect(browserFindInput(markovPage)).toBeHidden()
  })

  test('opens Find only in the browser split whose guest owns the shortcut', async ({
    markovPage
  }) => {
    const fixture = await createBrowserSplit(markovPage)

    await pressFindInBrowserGuest(markovPage, fixture.firstBrowserTabId, fixture.firstBrowserPageId)

    await expect(browserSplitFindInput(markovPage, fixture.firstBrowserTabId)).toBeVisible()
    await expect(browserSplitFindInput(markovPage, fixture.secondBrowserTabId)).toBeHidden()
    await expect
      .poll(() =>
        markovPage.evaluate(
          ({ browserPageId, browserTabId }) =>
            window.__store
              ?.getState()
              .browserPagesByWorkspace[browserTabId]?.find((page) => page.id === browserPageId)
              ?.loadError?.code ?? null,
          {
            browserPageId: fixture.firstBrowserPageId,
            browserTabId: fixture.firstBrowserTabId
          }
        )
      )
      .toBeNull()
  })

  test('keeps browser Find available when split focus state is temporarily missing', async ({
    markovPage
  }) => {
    const fixture = await createTerminalBrowserSplit(markovPage)
    await focusBrowserGroup(markovPage, fixture.browserGroupId)
    const addressBar = browserAddressBar(markovPage, fixture.browserTabId)
    await focusBrowserAddressBar(markovPage, fixture.browserTabId)

    await markovPage.evaluate(() => {
      const store = window.__store
      const worktreeId = store?.getState().activeWorktreeId
      if (!store || !worktreeId) {
        throw new Error('Active worktree unavailable')
      }
      store.setState((state) => {
        const activeGroupIdByWorktree = { ...state.activeGroupIdByWorktree }
        delete activeGroupIdByWorktree[worktreeId]
        return { activeGroupIdByWorktree }
      })
    })
    await expect(addressBar).toBeFocused()

    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(markovPage)).toBeFocused()
    await expect(terminalFindInput(markovPage)).toBeHidden()
  })

  test('keeps browser Find available when the focused split ID is stale', async ({
    markovPage
  }) => {
    const fixture = await createTerminalBrowserSplit(markovPage)
    await focusBrowserGroup(markovPage, fixture.browserGroupId)
    const addressBar = browserAddressBar(markovPage, fixture.browserTabId)
    await focusBrowserAddressBar(markovPage, fixture.browserTabId)

    await markovPage.evaluate(() => {
      const store = window.__store
      const worktreeId = store?.getState().activeWorktreeId
      if (!store || !worktreeId) {
        throw new Error('Active worktree unavailable')
      }
      store.setState((state) => ({
        activeGroupIdByWorktree: {
          ...state.activeGroupIdByWorktree,
          [worktreeId]: 'removed-group'
        }
      }))
    })
    await expect(addressBar).toBeFocused()

    await markovPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(markovPage)).toBeFocused()
    await expect(terminalFindInput(markovPage)).toBeHidden()
  })
})
