import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getTaskEligibleRepos } from './task-page-default-repo-selection'

// Why: with no git project to pick, the empty list's own instruction cannot be followed.
export function TaskPageAddProjectAction(): React.JSX.Element | null {
  const repos = useAppStore((s) => s.repos)
  const openModal = useAppStore((s) => s.openModal)
  const hasSelectableProject = useMemo(() => getTaskEligibleRepos(repos).length > 0, [repos])
  if (hasSelectableProject) {
    return null
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-4"
      onClick={() => openModal('add-repo')}
    >
      {translate('auto.components.sidebar.SidebarHeader.addProject', 'Add project')}
    </Button>
  )
}
