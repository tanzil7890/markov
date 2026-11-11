import { expect, test } from './helpers/markov-app'
import { waitForSessionReady } from './helpers/store'
import {
  addSshHostFormFields,
  buildSshConfigBody,
  closeOpenDialogs,
  configHostRow,
  expectSshHostListedInSettings,
  makeSshConfigHostPrefix,
  openSshConfigHostPicker,
  openSshHostSettings,
  removeSshTargetsByPrefix,
  seedIsolatedSshConfig,
  type SeededSshConfigHost
} from './helpers/ssh-config-host-picker'

test.use({ seedTestRepo: false })

// Use unique cleanup prefixes so workers loaded in the same millisecond cannot delete each other’s targets.
const HOST_PREFIX = makeSshConfigHostPrefix()

test.describe('SSH config host picker', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
  })

  test.afterEach(async ({ markovPage }) => {
    await closeOpenDialogs(markovPage).catch(() => undefined)
    await removeSshTargetsByPrefix(markovPage, HOST_PREFIX).catch(() => undefined)
  })

  test('P3: select host prefills form; Save persists; N3 identity hint', async ({
    electronApp,
    markovPage
  }) => {
    const prod: SeededSshConfigHost = {
      alias: `${HOST_PREFIX}-prod`,
      hostname: 'prod.example.test',
      user: 'deploy',
      port: 2222
    }
    await seedIsolatedSshConfig(electronApp, buildSshConfigBody([prod]))

    const picker = await openSshConfigHostPicker(markovPage)
    await configHostRow(picker, prod).click()

    const form = markovPage.getByRole('dialog', { name: 'Add SSH host' })
    await expect(form.getByRole('heading', { name: 'Add SSH host' })).toBeVisible({
      timeout: 10_000
    })
    const fields = addSshHostFormFields(form)
    await expect(fields.host).toHaveValue(prod.hostname, { timeout: 15_000 })
    await expect(fields.username).toHaveValue(prod.user)
    await expect(fields.port).toHaveValue(String(prod.port))
    await expect(fields.label).toHaveValue(prod.alias)
    await expect(fields.identityFile).toHaveValue('')
    // N3: empty Identity file explains multi-key resolve from config.
    await expect(
      form.getByText(new RegExp(`Left empty on purpose:.*${escapeRegExp(prod.alias)}`, 'i'))
    ).toBeVisible()
    await expect(
      markovPage.getByText(new RegExp(`Filled from ${escapeRegExp(prod.alias)}`, 'i'))
    ).toBeVisible({ timeout: 5_000 })

    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form).toBeHidden({ timeout: 10_000 })

    // The saved settings card is durable; the success toast is not.
    const sshSection = await openSshHostSettings(markovPage)
    await expectSshHostListedInSettings(sshSection, prod)
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
