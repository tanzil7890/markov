import { expect, type Page } from '@playwright/test'

// Scope to the sidebar because Landing renders another Add project button when no workspace is open.
function sidebarHeaderActions(page: Page) {
  return page.locator('[data-sidebar-header-actions]')
}

export async function openSidebarProjectDialog(page: Page): Promise<void> {
  await sidebarHeaderActions(page).getByRole('button', { name: 'Add project', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /Add a project/i })).toBeVisible()
}

// New workspace lives on each project row; its actions appear on hover.
export async function openSidebarWorkspaceComposer(page: Page): Promise<void> {
  const projectRow = page.locator('[data-repo-header-id]').first()
  await expect(projectRow).toBeVisible()
  await projectRow.hover()
  await projectRow.getByRole('button', { name: /^Create workspace for / }).click()
}
