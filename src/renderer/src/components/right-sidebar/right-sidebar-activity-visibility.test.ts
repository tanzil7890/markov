import { Files } from 'lucide-react'
import { expect, it } from 'vitest'
import type { ActivityBarItem } from './activity-bar-buttons'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

function item(id: ActivityBarItem['id'], gitOnly = false): ActivityBarItem {
  return { id, icon: Files, title: id, shortcut: '', ...(gitOnly ? { gitOnly } : {}) }
}

it('leaves the withheld Agents tab out of the right sidebar', () => {
  const visible = getVisibleRightSidebarActivityItems(
    [item('explorer'), item('vault'), item('source-control', true), item('checks', true)],
    { isFolder: false, isFolderWorkspace: false, hasSshHost: false }
  )

  expect(visible.map(({ id }) => id)).toEqual(['explorer', 'source-control', 'checks'])
})
