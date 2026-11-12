import { useLayoutEffect, useState } from 'react'

export type WorkspaceColumnRect = { left: number; top: number; width: number; height: number }

const WORKSPACE_COLUMN_SELECTOR = '[data-workspace-main-column]'

function findVisibleWorkspaceColumn(): HTMLElement | null {
  // Every mounted workspace renders a column; only the active one has a size.
  for (const column of document.querySelectorAll<HTMLElement>(WORKSPACE_COLUMN_SELECTOR)) {
    if (column.getBoundingClientRect().width > 0) {
      return column
    }
  }
  return null
}

function sameRect(a: WorkspaceColumnRect | null, b: WorkspaceColumnRect | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.height === b.height)
  )
}

/** Where the active workspace column sits, so the board replaces it (tab strip included) like a page. */
export function useWorkspaceColumnRect(active: boolean): WorkspaceColumnRect | null {
  const [rect, setRect] = useState<WorkspaceColumnRect | null>(null)
  useLayoutEffect(() => {
    if (!active) {
      return
    }
    let observed: HTMLElement | null = null
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    function measure(): void {
      const column = findVisibleWorkspaceColumn()
      if (column !== observed) {
        if (observed) {
          observer?.unobserve(observed)
        }
        if (column) {
          observer?.observe(column)
        }
        observed = column
      }
      const box = column?.getBoundingClientRect()
      const next = box
        ? { left: box.left, top: box.top, width: box.width, height: box.height }
        : null
      setRect((previous) => (sameRect(previous, next) ? previous : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active])
  return active ? rect : null
}
