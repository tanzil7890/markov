import type { RightSidebarTab } from './ui-chrome-types'

/**
 * Right sidebar tabs that are withheld, not deleted. `false` removes the tab's icon and panel from
 * the sidebar and every shortcut into it (the Settings button and the feature tip); the code stays,
 * so flipping it back to `true` restores the tab. The Agents tab's history still opens from
 * `/resume` in a chat, which shows the same panel in a window.
 */
export const RIGHT_SIDEBAR_TAB_OFFERED = {
  vault: false
} satisfies Partial<Record<RightSidebarTab, boolean>>

/** Plugin tabs and every tab not listed above are offered. */
export function isOfferedRightSidebarTab(tab: string): boolean {
  const offered: Partial<Record<string, boolean>> = RIGHT_SIDEBAR_TAB_OFFERED
  return offered[tab] !== false
}
