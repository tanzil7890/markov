import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/markov-app'
import {
  cleanupMarkdownFixture,
  closeActiveEditorTab,
  createMarkdownFixture,
  getActiveWorktreeContext,
  openMarkdownFixture,
  waitForRichMarkdownEditor
} from './helpers/markdown-editor-fixture'
import {
  expectEditableNestedToggles,
  expectFileKeepsNesting,
  expectPassthroughFallback,
  expectSentinelInsideNestedToggle,
  NESTED_TOGGLE_FIXTURE_DIRECTORY,
  NESTED_TOGGLE_MARKDOWN,
  placeCaretInNestedToggleBody,
  UNSUPPORTED_NESTED_TOGGLE_MARKDOWN
} from './helpers/markdown-nested-toggle'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe('Markdown nested toggle regression', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
  })

  test('editing a nested toggle survives save and reopen', async ({ markovPage }, testInfo) => {
    const context = await getActiveWorktreeContext(markovPage)
    const sentinel = `editedInsideNestedToggle${Date.now()}`
    let filePath: string | null = null

    try {
      filePath = await createMarkdownFixture(
        context,
        NESTED_TOGGLE_FIXTURE_DIRECTORY,
        'nested-toggle-edit',
        testInfo.workerIndex,
        NESTED_TOGGLE_MARKDOWN
      )
      await openMarkdownFixture(markovPage, context, filePath)
      await waitForRichMarkdownEditor(markovPage)
      await expectEditableNestedToggles(markovPage)

      await placeCaretInNestedToggleBody(markovPage)
      await markovPage.keyboard.type(` ${sentinel}`)
      await expectSentinelInsideNestedToggle(markovPage, sentinel)

      // Save through the real shortcut and assert the bytes that landed on disk.
      await markovPage.keyboard.press('ControlOrMeta+S')
      const savedPath = filePath
      await expect
        .poll(() => readFileSync(savedPath, 'utf8'), { timeout: 10_000 })
        .toContain(sentinel)
      expectFileKeepsNesting(readFileSync(savedPath, 'utf8'), sentinel)

      // Reopen the saved bytes from scratch; the reported bug appeared only after reparsing.
      await closeActiveEditorTab(markovPage, savedPath)
      await openMarkdownFixture(markovPage, context, savedPath)
      await waitForRichMarkdownEditor(markovPage)
      await expectEditableNestedToggles(markovPage)
      await expectSentinelInsideNestedToggle(markovPage, sentinel)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })

  test('a nested toggle that cannot be represented stays raw passthrough', async ({
    markovPage
  }, testInfo) => {
    const context = await getActiveWorktreeContext(markovPage)
    let filePath: string | null = null

    try {
      filePath = await createMarkdownFixture(
        context,
        NESTED_TOGGLE_FIXTURE_DIRECTORY,
        'nested-toggle-unsupported',
        testInfo.workerIndex,
        UNSUPPORTED_NESTED_TOGGLE_MARKDOWN
      )
      await openMarkdownFixture(markovPage, context, filePath)
      await waitForRichMarkdownEditor(markovPage)

      await expectPassthroughFallback(markovPage)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })
})
