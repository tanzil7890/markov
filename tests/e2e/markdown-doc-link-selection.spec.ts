import { test, expect } from './helpers/markov-app'
import type { Editor } from '@tiptap/core'
import {
  cleanupMarkdownFixture,
  createMarkdownFixture,
  getActiveWorktreeContext,
  openMarkdownFixture,
  waitForRichMarkdownEditor
} from './helpers/markdown-editor-fixture'
import { waitForSessionReady, waitForActiveWorktree } from './helpers/store'

type PageRichMarkdownLinkEditorElement = HTMLElement & {
  editor?: Editor
}

test('collapses a selection beside a document link without rewriting the link', async ({
  markovPage,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  const context = await getActiveWorktreeContext(markovPage)
  const filePath = await createMarkdownFixture(
    context,
    '.markov-e2e-markdown-links',
    'selection',
    testInfo.workerIndex,
    '[[Guide]]after\n\nSelecting text beside a document link should keep the link intact.'
  )
  registerPostElectronShutdownCleanup(() => cleanupMarkdownFixture(filePath))
  await openMarkdownFixture(markovPage, context, filePath)
  const editor = await waitForRichMarkdownEditor(markovPage)
  await expect(editor.locator('[data-doc-link-target="Guide"]')).toHaveCount(1)
  await markovPage.evaluate(() => {
    const editorElement =
      document.querySelector<PageRichMarkdownLinkEditorElement>('.rich-markdown-editor')
    const instance = editorElement?.editor
    if (!editorElement || !instance) {
      throw new Error('Editor unavailable')
    }
    editorElement.focus()
    if (!instance.commands.setTextSelection({ from: 2, to: 7 })) {
      throw new Error('Selection unavailable')
    }
  })
  await expect
    .poll(() => markovPage.evaluate(() => window.getSelection()?.toString()))
    .toBe('after')
  await expect
    .poll(() =>
      markovPage.evaluate(() => {
        const selection =
          document.querySelector<PageRichMarkdownLinkEditorElement>('.rich-markdown-editor')?.editor
            ?.state.selection
        return selection ? { from: selection.from, to: selection.to, empty: selection.empty } : null
      })
    )
    .toEqual({ from: 2, to: 7, empty: false })
  await expect(editor).toBeFocused()
  await markovPage.keyboard.press('ArrowLeft')
  await expect(editor.locator('[data-doc-link-target="Guide"]')).toHaveCount(1)
  await expect(editor.locator('p').first()).toHaveText('Guideafter')
  await expect.poll(() => markovPage.evaluate(() => window.getSelection()?.toString())).toBe('')
  await markovPage.screenshot({ path: testInfo.outputPath('link-after-collapse.png') })
})
