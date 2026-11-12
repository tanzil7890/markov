import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollToCurrentWorkspaceToolbarButton } from './worktree-list/navigation/ScrollToCurrentWorkspaceToolbarButton'
import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'

const SidebarToolbar = React.memo(function SidebarToolbar() {
  // Subscribe across this memo boundary so asynchronously applied locale changes relabel the toolbar and its children.
  useTranslation()

  return (
    <div className="mt-auto shrink-0">
      <div className="@container flex items-center justify-between border-t border-worktree-sidebar-border px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarSettingsHelpMenu />
        </div>
        <div className="flex items-center gap-1">
          <ScrollToCurrentWorkspaceToolbarButton />
        </div>
      </div>
    </div>
  )
})

export default SidebarToolbar
