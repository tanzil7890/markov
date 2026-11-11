import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/markov-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'
import {
  assertInlineImagePixels,
  assertKittyPlaceholderPixels,
  enableInlineImages,
  inlineImagePayload
} from './helpers/terminal-inline-image-proof'
import { getFirstWslDistro, useWslRuntimeForActiveProject } from './helpers/wsl-golden-stub-agent'
import { nodeTerminalCommand } from './terminal-node-command'
import { proveWindowsKittyFileImage } from './helpers/terminal-kitty-file-image-proof'

test.skip(process.platform !== 'win32', 'Native Windows and WSL PTY coverage')

for (const runtime of ['native', 'wsl'] as const) {
  for (const acceleration of ['off', 'on'] as const) {
    test(`@headful ${runtime}, ${acceleration}: PTY images and Kitty placeholders render on Windows`, async ({
      markovPage,
      testRepoPath
    }, testInfo) => {
      await waitForSessionReady(markovPage)
      await ensureTerminalVisible(markovPage)
      await markovPage.evaluate(async (policy) => {
        await window.__store!.getState().updateSettings({ terminalGpuAcceleration: policy })
      }, acceleration)
      if (runtime === 'wsl') {
        const distro = await getFirstWslDistro(markovPage)
        expect(distro, 'This Windows verification requires an installed WSL distro').not.toBeNull()
        if (!distro) {
          throw new Error('No WSL distro available')
        }
        await useWslRuntimeForActiveProject(markovPage, distro)
      } else {
        await markovPage.evaluate(async () => {
          await window
            .__store!.getState()
            .updateSettings({ terminalWindowsShell: 'powershell.exe' })
        })
      }
      const tabId = await markovPage.evaluate(() => {
        const state = window.__store!.getState()
        const worktreeId = state.activeWorktreeId
        if (!worktreeId) {
          throw new Error('Missing verification worktree')
        }
        const tab = state.createTab(worktreeId)
        window.__store!.getState().setActiveTab(tab.id)
        window.__store!.getState().setActiveTabType('terminal', worktreeId)
        return tab.id
      })
      await expect(
        markovPage.locator(`[data-tab-id="${tabId}"] [data-shell-icon]`).first()
      ).toHaveAttribute('data-shell-icon', runtime === 'wsl' ? 'wsl.exe' : 'powershell.exe')
      await waitForActiveTerminalManager(markovPage, 30_000)
      await enableInlineImages(markovPage)
      await expect
        .poll(() =>
          markovPage.evaluate(() => {
            const tab = window.__store!.getState().activeTabId
            const manager = tab && window.__paneManagers?.get(tab)
            const pane = manager && manager.getActivePane()
            return Boolean(manager && pane && manager.hasWebglRenderer(pane.id))
          })
        )
        .toBe(acceleration === 'on')
      const ptyId = await waitForActivePanePtyId(markovPage)
      const marker = 'WINDOWS_INLINE_IMAGES_DONE'
      const rawPayload = `${inlineImagePayload(true)}${marker}\r\n`
      const payload = Buffer.from(rawPayload).toString('base64')
      // Stage a file: the command is typed before WSL bash reaches readline, where cooked TTY input truncates ~25KB lines at 4095 bytes.
      const payloadFile = `.markov-inline-images-${randomUUID()}.bin`
      if (runtime === 'wsl') {
        writeFileSync(path.join(testRepoPath, payloadFile), rawPayload)
      }
      const command =
        runtime === 'wsl'
          ? `cat ${payloadFile}; rm -f ${payloadFile}; printf 'WSL_IMAGE_PROTOCOL=%s\\n' "$MARKOV_IMAGE_PROTOCOL"`
          : nodeTerminalCommand(['-e', `process.stdout.write(Buffer.from('${payload}', 'base64'))`])
      await execInTerminal(markovPage, ptyId, command)
      await waitForTerminalOutput(markovPage, marker, 30_000)
      if (runtime === 'wsl') {
        await waitForTerminalOutput(markovPage, 'WSL_IMAGE_PROTOCOL=kitty', 30_000)
      }
      await assertInlineImagePixels(markovPage, testInfo.outputPath('windows-inline-protocols.png'))
      await assertKittyPlaceholderPixels(
        markovPage,
        testInfo.outputPath('windows-inline-placeholders.png')
      )
      await proveWindowsKittyFileImage(
        markovPage,
        ptyId,
        runtime,
        testInfo.outputPath('windows-file-placeholders.png')
      )
    })
  }
}
