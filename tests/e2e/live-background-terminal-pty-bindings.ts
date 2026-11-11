import type { Page } from '@playwright/test'
import type { RuntimeTerminalSummary } from '../../src/shared/runtime-types'
import { expect } from './helpers/markov-app'

type TerminalPtyBinding = Pick<RuntimeTerminalSummary, 'leafId' | 'ptyId' | 'tabId'>

async function readRendererBindings(page: Page, identities: TerminalPtyBinding[]) {
  return page.evaluate((targets) => {
    const state = window.__store?.getState()
    return targets.map(({ leafId, tabId }) => ({
      tabId,
      tabPtyId:
        Object.values(state?.tabsByWorktree ?? {})
          .flat()
          .find((tab) => tab.id === tabId)?.ptyId ?? null,
      ptyIds: state?.ptyIdsByTabId[tabId] ?? [],
      leafBindings: Object.entries(state?.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}).sort(
        ([left], [right]) => left.localeCompare(right)
      ),
      leafId
    }))
  }, identities)
}

async function readPersistedBindings(
  page: Page,
  worktreeId: string,
  identities: TerminalPtyBinding[]
) {
  return page.evaluate(
    async ({ identities, worktreeId }) => {
      const session = await window.api.session.get()
      return identities.map(({ leafId, tabId }) => ({
        tabId,
        tabPtyId:
          session.tabsByWorktree[worktreeId]?.find((tab) => tab.id === tabId)?.ptyId ?? null,
        leafBindings: Object.entries(
          session.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}
        ).sort(([left], [right]) => left.localeCompare(right)),
        leafId
      }))
    },
    { identities, worktreeId }
  )
}

function expectedBindings(identities: TerminalPtyBinding[], includeLiveIds: boolean) {
  return identities.map(({ leafId, ptyId, tabId }) => ({
    tabId,
    tabPtyId: ptyId,
    ...(includeLiveIds ? { ptyIds: [ptyId] } : {}),
    leafBindings: [[leafId, ptyId]],
    leafId
  }))
}

export async function assertTargetBindings(
  page: Page,
  worktreeId: string,
  identities: TerminalPtyBinding[]
): Promise<void> {
  await expect
    .poll(() => readRendererBindings(page, identities), { timeout: 15_000 })
    .toEqual(expectedBindings(identities, true))
  await expect
    .poll(() => readPersistedBindings(page, worktreeId, identities), { timeout: 15_000 })
    .toEqual(expectedBindings(identities, false))
}
