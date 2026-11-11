import type { BrowserPageZoomCommand } from '../../../../../shared/browser-page-zoom'

export type { BrowserPageZoomCommand } from '../../../../../shared/browser-page-zoom'

export const MARKOV_BROWSER_PAGE_ZOOM_EVENT = 'markov:browser-page-zoom'

/** Zoom chords that land in Markov's own window while a browser pane holds focus. */
export function dispatchBrowserPageZoom(command: BrowserPageZoomCommand): void {
  window.dispatchEvent(new CustomEvent(MARKOV_BROWSER_PAGE_ZOOM_EVENT, { detail: command }))
}

export function addBrowserPageZoomEventListener(
  callback: (command: BrowserPageZoomCommand) => void
): () => void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent) {
      callback(event.detail)
    }
  }
  window.addEventListener(MARKOV_BROWSER_PAGE_ZOOM_EVENT, listener)
  return () => window.removeEventListener(MARKOV_BROWSER_PAGE_ZOOM_EVENT, listener)
}
