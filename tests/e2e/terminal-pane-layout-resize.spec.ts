// Require pane geometry to change after a divider drag.

import { test, expect } from './helpers/markov-app'
import {
  countVisibleTerminalPanes,
  splitActiveTerminalPane,
  waitForPaneCount
} from './helpers/terminal'
import { registerTerminalPaneMountReadiness } from './helpers/terminal-pane-mount-readiness'

// Serialize headful scenarios; visible-window runs require an isolated display.
test.describe.configure({ mode: 'serial' })
test.describe('Terminal Panes', () => {
  registerTerminalPaneMountReadiness()

  // Real pointer capture needs a valid pointing-device id, unreliable in hidden Electron.
  // Run MARKOV_BACKGROUND_LAUNCH=1 MARKOV_E2E_HEADFUL=1 pnpm run test:e2e only on an isolated display or CI.
  test('@headful can resize terminal panes by real mouse drag', async ({ markovPage }) => {
    const panesBefore = await countVisibleTerminalPanes(markovPage)
    await splitActiveTerminalPane(markovPage, 'vertical')
    await waitForPaneCount(markovPage, panesBefore + 1)

    const paneWidthsBefore = await markovPage.evaluate(() => {
      const xterms = document.querySelectorAll('.xterm')
      return Array.from(xterms)
        .filter((x) => (x as HTMLElement).offsetParent !== null)
        .map((x) => (x as HTMLElement).getBoundingClientRect().width)
    })
    expect(paneWidthsBefore.length).toBeGreaterThanOrEqual(2)

    const divider = markovPage.locator('.pane-divider.is-vertical').first()
    await expect(divider).toBeVisible({ timeout: 3_000 })
    const box = await divider.boundingBox()
    expect(box).not.toBeNull()

    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await markovPage.mouse.move(startX, startY)
    await markovPage.mouse.down()
    await markovPage.mouse.move(startX + 150, startY, { steps: 20 })
    await markovPage.mouse.up()

    await expect
      .poll(
        async () => {
          const widthsAfter = await markovPage.evaluate(() => {
            const xterms = document.querySelectorAll('.xterm')
            return Array.from(xterms)
              .filter((x) => (x as HTMLElement).offsetParent !== null)
              .map((x) => (x as HTMLElement).getBoundingClientRect().width)
          })
          if (widthsAfter.length < 2) {
            return false
          }

          return paneWidthsBefore.some((w, i) => Math.abs(w - widthsAfter[i]) > 20)
        },
        { timeout: 5_000, message: 'Pane widths did not change after dragging divider' }
      )
      .toBe(true)
  })
})
