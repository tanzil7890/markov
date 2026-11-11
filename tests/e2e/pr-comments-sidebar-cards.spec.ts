import { test, expect } from './helpers/markov-app'
import { openChecks } from './helpers/source-control-ai-generation'
import { seedPRCommentsSidebarFixture } from './helpers/pr-comments-sidebar-fixture'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe('PR comments sidebar cards view', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
  })

  test('can switch from grouped to chronological timeline order', async ({ markovPage }) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(markovPage)
    await openChecks(markovPage, worktreeId)

    await expect(markovPage.getByText('Needs review · 1')).toBeVisible({ timeout: 10_000 })
    await markovPage.getByRole('button', { name: 'Comment display options' }).click()
    await markovPage.getByRole('menuitemradio', { name: 'Timeline' }).click()

    await expect(markovPage.getByText('Needs review · 1')).toHaveCount(0)
    await expect(markovPage.getByText('Already fixed upstream.')).toBeVisible()

    const comments = [
      markovPage.getByText('Already fixed upstream.'),
      markovPage.getByText('Please update this handler before merge.'),
      markovPage.getByText('LGTM on the overall approach.')
    ]
    const positions = await Promise.all(
      comments.map(async (comment) => {
        const box = await comment.boundingBox()
        if (!box) {
          throw new Error(`Comment not visible: ${await comment.textContent()}`)
        }
        return box.y
      })
    )

    expect(positions[0]).toBeLessThan(positions[1])
    expect(positions[1]).toBeLessThan(positions[2])
  })

  test('adds reactions to conversation and review-thread comments', async ({
    markovPage
  }, testInfo) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(markovPage)
    await openChecks(markovPage, worktreeId)
    await expect(markovPage.getByText('Needs review · 1')).toBeVisible({ timeout: 10_000 })

    const reviewThreadCard = markovPage.getByTestId('pr-comment-group').filter({
      hasText: 'Please update this handler before merge.'
    })
    const threadReactionButton = reviewThreadCard.getByRole('button', { name: 'Add reaction' })
    await markovPage.screenshot({ path: testInfo.outputPath('reaction-before.png') })
    await threadReactionButton.click()
    await expect(markovPage.getByRole('group', { name: 'Add reaction' })).toBeFocused()
    await expect(markovPage.getByRole('button', { name: 'Add rocket reaction' })).toBeVisible()
    await markovPage.screenshot({
      path: testInfo.outputPath('reaction-picker.png'),
      animations: 'disabled'
    })
    await markovPage.getByRole('button', { name: 'Add rocket reaction' }).click()
    await expect(markovPage.getByRole('group', { name: 'Add reaction' })).toBeHidden()
    const selectedRocket = reviewThreadCard.getByRole('button', { name: '1 rocket reaction' })
    await expect(selectedRocket).toHaveAttribute('aria-pressed', 'true')
    await selectedRocket.focus()
    await expect(selectedRocket).toBeFocused()
    await markovPage.screenshot({
      path: testInfo.outputPath('reaction-after.png'),
      animations: 'disabled'
    })
    await selectedRocket.press('Enter')
    await expect(selectedRocket).toHaveCount(0)
    await expect(threadReactionButton).toBeFocused()

    const conversationCard = markovPage.getByTestId('pr-comment-group').filter({
      hasText: 'LGTM on the overall approach.'
    })
    const conversationReactionButton = conversationCard.getByRole('button', {
      name: 'Add reaction'
    })
    await conversationReactionButton.click()
    const conversationPicker = markovPage.getByRole('group', { name: 'Add reaction' }).last()
    const heartReactionButton = conversationPicker.getByRole('button', {
      name: 'Add heart reaction'
    })
    await expect(heartReactionButton).toBeVisible()
    await heartReactionButton.evaluate((element) => (element as HTMLElement).click())
    await expect(
      conversationCard.getByRole('button', { name: '1 heart reaction' })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(markovPage.getByRole('button', { name: 'Add rocket reaction' })).toHaveCount(0)
  })

  test('keeps reaction focus while a remote mutation fails', async ({ markovPage }) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(markovPage)
    await openChecks(markovPage, worktreeId)
    await expect(markovPage.getByText('Needs review · 1')).toBeVisible({ timeout: 10_000 })
    await markovPage.evaluate(() => {
      window.__store?.setState({
        setPRCommentReaction: async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 300))
          return false
        }
      })
    })

    const reviewThreadCard = markovPage.getByTestId('pr-comment-group').filter({
      hasText: 'Please update this handler before merge.'
    })
    const addReaction = reviewThreadCard.getByRole('button', { name: 'Add reaction' })
    await addReaction.focus()
    await addReaction.press('Enter')
    const picker = markovPage.getByRole('group', { name: 'Add reaction' })
    await expect(picker).toBeFocused()
    const rocket = picker.getByRole('button', { name: /rocket reaction/ })
    await rocket.focus()
    await rocket.press('Enter')
    await expect(rocket).toBeFocused()
    await expect(rocket).toHaveAttribute('aria-disabled', 'true')
    await rocket.press('Enter')
    await expect(picker).toBeVisible()
    await expect(rocket).toHaveAttribute('aria-disabled', 'false')
    await expect(rocket).toBeFocused()
    await expect(rocket).toHaveAccessibleName('Add rocket reaction')

    await markovPage.evaluate(() => {
      window.__store?.setState({ setPRCommentReaction: async () => true })
    })
    await rocket.press('Enter')
    const selectedRocket = reviewThreadCard.getByRole('button', { name: '1 rocket reaction' })
    await expect(selectedRocket).toHaveAttribute('aria-pressed', 'true')
    await markovPage.evaluate(() => {
      window.__store?.setState({
        setPRCommentReaction: async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 300))
          return false
        }
      })
    })
    await selectedRocket.focus()
    await selectedRocket.press('Enter')
    await expect(addReaction).toBeFocused()
    await expect(addReaction).toHaveAttribute('aria-disabled', 'true')
    await expect(selectedRocket).toHaveCount(0)
    await expect(selectedRocket).toHaveCount(1)
    await expect(addReaction).toHaveAttribute('aria-disabled', 'false')
    await expect(addReaction).toBeFocused()
  })
})
