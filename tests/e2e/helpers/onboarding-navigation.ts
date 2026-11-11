import { expect, type Page } from '@playwright/test'

const AGENT_SURFACE_HEADING = 'How do you want to work with agents?'

function onboardingFooterButton(page: Page, name: RegExp) {
  return page.locator('footer').getByRole('button', { name })
}

/** Walks past the account, name and agent setup pages that open a fresh onboarding. */
export async function continueToOnboardingAgentSurface(page: Page): Promise<void> {
  const surface = page.getByRole('heading', { name: AGENT_SURFACE_HEADING, exact: true })
  const account = page.getByRole('heading', { name: 'Sign in, or jump straight in', exact: true })
  const profile = page.getByRole('heading', { name: 'What should we call you?', exact: true })
  const agentSetup = page.getByRole('heading', { name: 'Set up your agents', exact: true })
  await expect(surface.or(account).or(profile).or(agentSetup)).toBeVisible({ timeout: 30_000 })
  // Why a retry loop: a build without sign-in leaves the account page by itself, which can race one click.
  await expect(async () => {
    if (await surface.isVisible()) {
      return
    }
    if (await account.isVisible()) {
      await onboardingFooterButton(page, /^Continue without an account\b/).click({
        timeout: 2_000
      })
    } else if ((await profile.isVisible()) || (await agentSetup.isVisible())) {
      await onboardingFooterButton(page, /^Continue\b/).click({ timeout: 2_000 })
    }
    await expect(surface).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
}

export async function chooseOnboardingAgentSurface(
  page: Page,
  surface: 'chat' | 'terminal' = 'terminal'
): Promise<void> {
  await continueToOnboardingAgentSurface(page)
  const option = page.getByRole('radio', {
    name: surface === 'chat' ? /^Chat UI/ : /^Terminal/
  })
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')
  await onboardingFooterButton(page, /^Continue\b/).click()
  await expect(
    page.getByRole('heading', { name: 'Pick your default agent', exact: true })
  ).toBeVisible()
}
