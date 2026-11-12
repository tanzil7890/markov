import { setPortalSlot, usePortalSlot } from '@/lib/portal-slots'

/** Places inside one chat pane that a sibling subtree fills through a portal. */
export type NativeChatPaneSlot = 'header-workspace' | 'below-composer'

const slotKey = (slot: NativeChatPaneSlot, tabId: string): string => `native-chat:${slot}:${tabId}`

export function setNativeChatPaneSlot(
  slot: NativeChatPaneSlot,
  tabId: string,
  element: HTMLElement | null
): void {
  setPortalSlot(slotKey(slot, tabId), element)
}

export function useNativeChatPaneSlot(slot: NativeChatPaneSlot, tabId: string): HTMLElement | null {
  return usePortalSlot(slotKey(slot, tabId))
}
