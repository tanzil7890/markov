import { FolderPlus, GitBranchPlus } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import type { CreateDialogKind } from './create-dialog-host'

export function CreateDialogKindSwitch({
  kind,
  disabled,
  onKindChange
}: {
  kind: CreateDialogKind
  disabled?: boolean
  onKindChange: (kind: CreateDialogKind) => void
}): React.JSX.Element {
  return (
    <Tabs
      value={kind}
      onValueChange={(next) => onKindChange(next === 'project' ? 'project' : 'workspace')}
      className="pr-8"
      data-create-dialog-switch=""
    >
      <TabsList
        size="sm"
        className="h-8 w-full"
        aria-label={translate('auto.components.createDialog.kindSwitch', 'What to create')}
      >
        <TabsTrigger value="workspace" disabled={disabled} className="text-xs">
          <GitBranchPlus className="size-3.5" />
          {translate('auto.components.createDialog.workspace', 'Workspace')}
        </TabsTrigger>
        <TabsTrigger value="project" disabled={disabled} className="text-xs">
          <FolderPlus className="size-3.5" />
          {translate('auto.components.createDialog.project', 'Project')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
