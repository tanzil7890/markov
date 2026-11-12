import type { TaskPageComposerActionsModel } from './use-task-page-composer-actions'
import { TaskPageListChrome } from './ListChrome'
import { TaskPageContent } from './Content'
export function TaskPageFrame({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-5 pt-4 pb-4 md:px-8 md:pt-5 md:pb-5">
        <TaskPageListChrome model={model} />

        <TaskPageContent model={model} />
      </div>
    </div>
  )
}
