import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { cn } from '@/lib/utils'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { normalizeTaskRepoSelection } from '@/components/task-page/task-page-default-repo-selection'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
export function TaskPageGitHubModeControls({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const {
    setTaskResumeState,
    updateSettings,
    eligibleRepos,
    repoSelection,
    setRepoSelection,
    taskPickerGroups,
    taskPickerRepos,
    githubModeButtons,
    taskSource,
    getTaskPickerRepoHostLabel,
    projectModeVisible,
    githubMode,
    setGithubMode,
    activeGithubTaskKind,
    selectedGitHubRepoExternalLink,
    handleSelectGithubTaskKind
  } = model
  return taskSource === 'github' ? (
    <div className="flex min-w-0 flex-wrap items-end gap-2 border-b border-border">
      {projectModeVisible ? (
        <div role="tablist" className="mr-auto flex items-end gap-5">
          {githubModeButtons.map((mode) => {
            const active =
              mode.id === 'project'
                ? githubMode === 'project'
                : githubMode === 'items' && activeGithubTaskKind === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (mode.id === 'project') {
                    setGithubMode('project')
                    setTaskResumeState({
                      githubMode: 'project'
                    })
                    return
                  }
                  setGithubMode('items')
                  setTaskResumeState({
                    githubMode: 'items'
                  })
                  handleSelectGithubTaskKind(mode.id)
                }}
                className={cn(
                  '-mb-px h-9 border-b-2 text-sm transition',
                  active
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {mode.label}
              </button>
            )
          })}
        </div>
      ) : null}
      {/* Repository-backed Project rows follow this selection in both GitHub modes. */}
      <div className="mb-1.5 flex min-w-0 shrink-0 items-center gap-2">
        <div className="min-w-0 max-w-[220px] shrink-0">
          <TaskProjectSourceCombobox
            groups={taskPickerGroups}
            selected={repoSelection}
            getRepoHostLabel={getTaskPickerRepoHostLabel}
            onChange={(next) => {
              const normalized = normalizeTaskRepoSelection(eligibleRepos, next)
              setRepoSelection(normalized)
              void updateSettings({
                defaultRepoSelection: [...normalized]
              }).catch(() => {
                toast.error(
                  translate(
                    'auto.components.TaskPage.dfd72673e7',
                    'Failed to save project selection.'
                  )
                )
              })
            }}
            onSelectAll={() => {
              const allIds = new Set(taskPickerRepos.map((r) => r.id))
              setRepoSelection(allIds)
              void updateSettings({
                defaultRepoSelection: null
              }).catch(() => {
                toast.error(
                  translate(
                    'auto.components.TaskPage.dfd72673e7',
                    'Failed to save project selection.'
                  )
                )
              })
            }}
            triggerClassName="h-8 w-auto max-w-[220px] rounded-md border border-border/50 bg-muted/50 px-2 text-xs font-medium shadow-sm transition hover:bg-muted/50 focus:ring-2 focus:ring-ring/20 focus:outline-none"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={(event) => {
                if (!selectedGitHubRepoExternalLink?.url) {
                  return
                }
                openAppHttpLink(selectedGitHubRepoExternalLink.url, { event })
              }}
              aria-label={
                selectedGitHubRepoExternalLink
                  ? translate('auto.components.TaskPage.8d1e17a3ef', 'Open {{value0}} in GitHub', {
                      value0: selectedGitHubRepoExternalLink.label
                    })
                  : translate(
                      'auto.components.TaskPage.d1132848f8',
                      'Select one GitHub project to open in GitHub'
                    )
              }
              className="h-8 w-8 rounded-md border-border/50 bg-muted/50 text-foreground shadow-sm transition hover:bg-muted/50"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {selectedGitHubRepoExternalLink
              ? translate('auto.components.TaskPage.8d1e17a3ef', 'Open {{value0}} in GitHub', {
                  value0: selectedGitHubRepoExternalLink.label
                })
              : translate(
                  'auto.components.TaskPage.bc46d8204e',
                  'Select one project to open in GitHub'
                )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ) : null
}
