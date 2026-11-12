import type React from 'react'
import { isFolderRepo } from '../../../../../../shared/repo-kind'
import type { WorktreeGroupBy } from '../../../../../../shared/sidebar-list/row-types'
import type { RenderRow } from '../listing/render-row'
import { getWorktreeOptionId } from './option-dom'

type WorktreeItemRenderRow = Extract<RenderRow, { type: 'item' }>

/** A folder project holds one workspace with its own name, so the project row stands in for it. */
export function getMergedFolderWorkspaceRow(
  rows: readonly RenderRow[],
  headerIndex: number,
  groupBy: WorktreeGroupBy
): WorktreeItemRenderRow | null {
  const header = rows[headerIndex]
  const next = rows[headerIndex + 1]
  if (
    groupBy !== 'repo' ||
    header?.type !== 'header' ||
    !header.repo ||
    !isFolderRepo(header.repo) ||
    header.count !== 1 ||
    next?.type !== 'item' ||
    next.sectionKey !== header.key ||
    next.worktree.displayName !== (header.label ?? header.repo.displayName)
  ) {
    return null
  }
  return next
}

export function isMergedIntoFolderProjectHeader(
  rows: readonly RenderRow[],
  itemIndex: number,
  groupBy: WorktreeGroupBy
): boolean {
  return (
    itemIndex > 0 && getMergedFolderWorkspaceRow(rows, itemIndex - 1, groupBy) === rows[itemIndex]
  )
}

/** Replays a press or right-click on the project row against the workspace card it stands in for; false when there is none. */
export function forwardHeaderEventToMergedWorkspace(
  event: React.MouseEvent<HTMLElement>,
  rowKey: string | undefined
): boolean {
  const surface = rowKey
    ? document
        .getElementById(getWorktreeOptionId(rowKey))
        ?.querySelector<HTMLElement>('[data-worktree-card-surface]')
    : null
  if (!surface) {
    return false
  }
  if (event.type === 'contextmenu') {
    event.preventDefault()
  }
  const { altKey, ctrlKey, metaKey, shiftKey, clientX, clientY, button } = event
  surface.dispatchEvent(
    new MouseEvent(event.type, {
      bubbles: true,
      cancelable: true,
      altKey,
      ctrlKey,
      metaKey,
      shiftKey,
      clientX,
      clientY,
      button
    })
  )
  return true
}
