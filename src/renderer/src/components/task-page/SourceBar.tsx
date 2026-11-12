import React from 'react'
import type { TaskPageComposerActionsModel } from './use-task-page-composer-actions'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { LinearScopeSelector } from '@/components/linear-scope-selector'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { createPortal } from 'react-dom'
import { useTitlebarPageControlsSlot } from '@/lib/titlebar-page-controls-slot'
export function TaskPageSourceBar({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const {
    openTaskPage,
    closeTaskPage,
    updateSettings,
    selectJiraSite,
    linearConnected,
    jiraConnected,
    linearWorkspaces,
    selectedLinearWorkspaceId,
    jiraSites,
    selectedJiraSiteId,
    visibleSourceOptions,
    taskSource,
    taskSourceAvailabilityNoticeByProvider,
    taskSourceManuallyChangedRef,
    setSelectedJiraIssueKey,
    setSelectedJiraIssueFallback,
    setJiraIssues,
    setJiraLoading,
    setJiraError,
    defaultLinearTeamSelection,
    linearTeamSelection,
    linearTeamOptions,
    selectedLinearTeamForExternalLink,
    setLinearConnectOpen,
    handleLinearWorkspaceChange,
    handleLinearTeamSelectionChange,
    handleLinearScopeOpen
  } = model
  const titlebarSlot = useTitlebarPageControlsSlot()
  const sourceSwitcher = (
    <div
      className="flex min-w-0 items-center gap-2"
      data-contextual-tour-target="tasks-source-filters"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={closeTaskPage}
            aria-label={translate('auto.components.TaskPage.1a06219d5c', 'Close tasks')}
          >
            <X className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.TaskPage.4826fd1ad8', 'Close · Esc')}
        </TooltipContent>
      </Tooltip>
      <h1 className="text-[13px] font-semibold text-foreground">
        {translate('auto.components.TaskPage.title', 'Tasks')}
      </h1>
      <div
        role="group"
        aria-label={translate('auto.components.TaskPage.sources', 'Task sources')}
        className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {visibleSourceOptions.map((source) => {
          const active = taskSource === source.id
          const sourceAvailabilityNotice = taskSourceAvailabilityNoticeByProvider[source.id] ?? null
          const sourceDisabled = source.disabled || sourceAvailabilityNotice?.blocking
          const sourceButton = (
            <button
              type="button"
              disabled={sourceDisabled}
              onClick={() => {
                if (sourceAvailabilityNotice?.blocking) {
                  return
                }
                taskSourceManuallyChangedRef.current = true
                openTaskPage(
                  {
                    taskSource: source.id
                  },
                  {
                    recordTasksInteraction: false
                  }
                )
                void updateSettings({
                  defaultTaskSource: source.id
                }).catch(() => {
                  toast.error(
                    translate(
                      'auto.components.TaskPage.609532fae7',
                      'Failed to save default task source.'
                    )
                  )
                })
              }}
              data-task-source={source.id}
              aria-label={sourceAvailabilityNotice?.label ?? source.label}
              aria-pressed={active}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition',
                active
                  ? 'bg-background text-foreground shadow-xs dark:bg-accent'
                  : 'text-muted-foreground hover:text-foreground',
                sourceDisabled && 'cursor-not-allowed opacity-55'
              )}
            >
              <source.Icon className="size-3.5" />
              <span>{source.label}</span>
            </button>
          )
          // Why: the label is visible, so only an availability notice needs a tooltip.
          return sourceAvailabilityNotice ? (
            <Tooltip key={source.id}>
              <TooltipTrigger asChild>{sourceButton}</TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {sourceAvailabilityNotice.label}
              </TooltipContent>
            </Tooltip>
          ) : (
            <React.Fragment key={source.id}>{sourceButton}</React.Fragment>
          )
        })}
      </div>
    </div>
  )
  const showsSourceScope =
    (taskSource === 'linear' && linearConnected) || (taskSource === 'jira' && jiraConnected)
  // Why: with the switcher in the title bar, GitHub has nothing left for this row.
  if (titlebarSlot && !showsSourceScope) {
    return createPortal(sourceSwitcher, titlebarSlot)
  }
  return (
    <div className="flex items-center justify-between gap-3">
      {titlebarSlot ? createPortal(sourceSwitcher, titlebarSlot) : sourceSwitcher}
      <div className="flex-1" />
      {taskSource === 'linear' && linearConnected ? (
        <div className="flex items-center gap-2">
          <LinearScopeSelector
            workspaces={linearWorkspaces}
            selectedWorkspaceId={selectedLinearWorkspaceId}
            teams={linearTeamOptions}
            selectedTeamIds={linearTeamSelection}
            teamSelectionIsStickyAll={defaultLinearTeamSelection == null}
            onWorkspaceChange={handleLinearWorkspaceChange}
            onTeamSelectionChange={handleLinearTeamSelectionChange}
            onAddTeamAccess={() => setLinearConnectOpen(true)}
            onOpen={handleLinearScopeOpen}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={(event) => {
                  if (!selectedLinearTeamForExternalLink?.url) {
                    return
                  }
                  openAppHttpLink(selectedLinearTeamForExternalLink.url, { event })
                }}
                disabled={!selectedLinearTeamForExternalLink}
                aria-label={
                  selectedLinearTeamForExternalLink
                    ? translate(
                        'auto.components.TaskPage.246bd64aed',
                        'Open {{value0}} in Linear',
                        {
                          value0: selectedLinearTeamForExternalLink.name
                        }
                      )
                    : translate(
                        'auto.components.TaskPage.8029e2bd4d',
                        'Select one Linear team to open in Linear'
                      )
                }
                className="h-8 w-8 rounded-md border-border/50 bg-muted/50 text-foreground shadow-sm transition hover:bg-muted/50"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {selectedLinearTeamForExternalLink
                ? translate('auto.components.TaskPage.246bd64aed', 'Open {{value0}} in Linear', {
                    value0: selectedLinearTeamForExternalLink.name
                  })
                : translate(
                    'auto.components.TaskPage.2af3ab5c58',
                    'Select one team to open in Linear'
                  )}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      {taskSource === 'jira' && jiraConnected ? (
        <div className="flex items-center gap-2">
          {jiraSites.length > 1 ? (
            <Select
              value={selectedJiraSiteId ?? undefined}
              onValueChange={(value) => {
                setSelectedJiraIssueKey(null)
                setSelectedJiraIssueFallback(null)
                setJiraIssues([])
                setJiraError(null)
                setJiraLoading(true)
                void selectJiraSite(value).catch(() => {
                  toast.error(
                    translate('auto.components.TaskPage.d09b7631b7', 'Failed to switch Jira site.')
                  )
                })
              }}
            >
              <SelectTrigger className="h-8 w-[220px] rounded-md border-border/50 bg-muted/50 text-xs font-medium shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('auto.components.TaskPage.e592d99051', 'All Jira sites')}
                </SelectItem>
                {jiraSites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
