import { setPortalSlot, usePortalSlot } from './portal-slots'

const TITLEBAR_PAGE_CONTROLS_SLOT = 'titlebar:page-controls'

/** The title bar's left area that a full-page view (Tasks) fills with its own controls. */
export function registerTitlebarPageControlsSlot(element: HTMLElement | null): void {
  setPortalSlot(TITLEBAR_PAGE_CONTROLS_SLOT, element)
}

export function useTitlebarPageControlsSlot(): HTMLElement | null {
  return usePortalSlot(TITLEBAR_PAGE_CONTROLS_SLOT)
}
