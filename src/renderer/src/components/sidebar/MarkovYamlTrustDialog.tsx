import React, { useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import type { MarkovHookScriptKind } from '@/lib/markov-hook-trust'
import { Trans } from 'react-i18next'
import { i18n, translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'

type ScriptKind = MarkovHookScriptKind

function getTitle(kind: ScriptKind, repoName: string, previouslyApproved: boolean): string {
  const repo = { repo: repoName }
  if (previouslyApproved) {
    switch (kind) {
      case 'setup':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.setupChangedTitle',
          "{{repo}}'s setup script changed — run the new version?",
          repo
        )
      case 'archive':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.archiveChangedTitle',
          "{{repo}}'s archive script changed — run the new version?",
          repo
        )
      case 'issueCommand':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.issueCommandChangedTitle',
          "{{repo}}'s issue command changed — run the new version?",
          repo
        )
      case 'vmRecipe':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.vmRecipeChangedTitle',
          "{{repo}}'s VM recipe changed — run the new version?",
          repo
        )
    }
  }
  switch (kind) {
    case 'setup':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.setupRunTitle',
        'Run setup script from {{repo}}?',
        repo
      )
    case 'archive':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.archiveRunTitle',
        'Run archive script from {{repo}}?',
        repo
      )
    case 'issueCommand':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.issueCommandRunTitle',
        'Run issue command from {{repo}}?',
        repo
      )
    case 'vmRecipe':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.vmRecipeRunTitle',
        'Run VM recipe from {{repo}}?',
        repo
      )
  }
}

// Templates embed <code>markov.yaml</code> and a <repo/> slot filled by the component.
function getDescription(kind: ScriptKind, previouslyApproved: boolean): string {
  if (previouslyApproved) {
    switch (kind) {
      case 'setup':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.setupChangedBody',
          '<code>markov.yaml</code> changed since you last approved. Re-review before it runs when this workspace is created.'
        )
      case 'archive':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.archiveChangedBody',
          '<code>markov.yaml</code> changed since you last approved. Re-review before it runs when this workspace is removed.'
        )
      case 'issueCommand':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.issueCommandChangedBody',
          '<code>markov.yaml</code> changed since you last approved. Re-review before it runs when this workspace launches with a linked issue.'
        )
      case 'vmRecipe':
        return translate(
          'auto.components.sidebar.MarkovYamlTrustDialog.vmRecipeChangedBody',
          '<code>markov.yaml</code> changed since you last approved. Re-review before it runs before provisioning a VM.'
        )
    }
  }
  switch (kind) {
    case 'setup':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.setupRunBody',
        "This repository's <code>markov.yaml</code> runs on your machine when this workspace is created. Only run if you trust <repo/>."
      )
    case 'archive':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.archiveRunBody',
        "This repository's <code>markov.yaml</code> runs on your machine when this workspace is removed. Only run if you trust <repo/>."
      )
    case 'issueCommand':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.issueCommandRunBody',
        "This repository's <code>markov.yaml</code> runs on your machine when this workspace launches with a linked issue. Only run if you trust <repo/>."
      )
    case 'vmRecipe':
      return translate(
        'auto.components.sidebar.MarkovYamlTrustDialog.vmRecipeRunBody',
        "This repository's <code>markov.yaml</code> runs on your machine before provisioning a VM. Only run if you trust <repo/>."
      )
  }
}

function getScriptHeading(kind: ScriptKind, previouslyApproved: boolean): string {
  switch (kind) {
    case 'setup':
      return previouslyApproved
        ? translate(
            'auto.components.sidebar.MarkovYamlTrustDialog.newSetupScript',
            'New setup script'
          )
        : translate('auto.components.sidebar.MarkovYamlTrustDialog.setupScript', 'Setup script')
    case 'archive':
      return previouslyApproved
        ? translate(
            'auto.components.sidebar.MarkovYamlTrustDialog.newArchiveScript',
            'New archive script'
          )
        : translate('auto.components.sidebar.MarkovYamlTrustDialog.archiveScript', 'Archive script')
    case 'issueCommand':
      return previouslyApproved
        ? translate(
            'auto.components.sidebar.MarkovYamlTrustDialog.newIssueCommand',
            'New issue command'
          )
        : translate('auto.components.sidebar.MarkovYamlTrustDialog.issueCommand', 'Issue command')
    case 'vmRecipe':
      return previouslyApproved
        ? translate('auto.components.sidebar.MarkovYamlTrustDialog.newVmRecipe', 'New VM recipe')
        : translate('auto.components.sidebar.MarkovYamlTrustDialog.vmRecipe', 'VM recipe')
  }
}

const MarkovYamlTrustDialog = React.memo(function MarkovYamlTrustDialog() {
  useUiLanguageRevision()
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const markMarkovHookScriptConfirmed = useAppStore((s) => s.markMarkovHookScriptConfirmed)
  const markMarkovHookRepoAlwaysTrusted = useAppStore((s) => s.markMarkovHookRepoAlwaysTrusted)

  const isOpen = activeModal === 'confirm-markov-yaml-hooks'
  const [alwaysTrustState, setAlwaysTrustState] = useState(() => ({
    isOpen,
    value: false
  }))

  // Reset before paint so a new hook prompt never flashes stale Always trust consent.
  if (alwaysTrustState.isOpen !== isOpen) {
    setAlwaysTrustState({ isOpen, value: false })
  }
  const alwaysTrust = alwaysTrustState.isOpen === isOpen ? alwaysTrustState.value : false
  const setAlwaysTrust = (value: boolean): void => {
    setAlwaysTrustState({ isOpen, value })
  }

  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const repoName =
    typeof modalData.repoName === 'string'
      ? modalData.repoName
      : translate('auto.components.sidebar.MarkovYamlTrustDialog.thisRepository', 'this repository')
  const scriptKind: ScriptKind =
    modalData.scriptKind === 'archive'
      ? 'archive'
      : modalData.scriptKind === 'issueCommand'
        ? 'issueCommand'
        : modalData.scriptKind === 'vmRecipe'
          ? 'vmRecipe'
          : 'setup'
  const scriptContent = typeof modalData.scriptContent === 'string' ? modalData.scriptContent : ''
  const contentHash = typeof modalData.contentHash === 'string' ? modalData.contentHash : ''
  const previouslyApproved = modalData.previouslyApproved === true
  const onResolve =
    typeof modalData.onResolve === 'function'
      ? (modalData.onResolve as (decision: 'run' | 'skip') => void)
      : null

  const resolveAndClose = useCallback(
    (decision: 'run' | 'skip') => {
      if (decision === 'run' && repoId) {
        // Repo-wide trust is ignored when the repo id is on two hosts, so keep this script's approval too.
        if (contentHash) {
          markMarkovHookScriptConfirmed(repoId, scriptKind, contentHash)
        }
        if (alwaysTrust) {
          markMarkovHookRepoAlwaysTrusted(repoId)
        }
      }
      onResolve?.(decision)
      closeModal()
    },
    [
      alwaysTrust,
      closeModal,
      contentHash,
      markMarkovHookRepoAlwaysTrusted,
      markMarkovHookScriptConfirmed,
      onResolve,
      repoId,
      scriptKind
    ]
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resolveAndClose('skip')
      }
    },
    [resolveAndClose]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent surface="security" className="max-w-md sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {getTitle(scriptKind, repoName, previouslyApproved)}
          </DialogTitle>
          <DialogDescription className="text-xs">
            <Trans
              i18n={i18n}
              defaults={getDescription(scriptKind, previouslyApproved)}
              components={{ code: <code />, repo: <>{repoName}</> }}
            />
          </DialogDescription>
        </DialogHeader>

        {scriptContent && (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {getScriptHeading(scriptKind, previouslyApproved)}
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground scrollbar-sleek">
              {scriptContent}
            </pre>
          </div>
        )}

        <label
          className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors ${
            alwaysTrust
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/70 bg-muted/25 hover:border-border hover:bg-muted/40'
          }`}
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={alwaysTrust}
            onChange={(event) => setAlwaysTrust(event.target.checked)}
          />
          <span className="text-xs font-medium text-foreground">
            <Trans
              i18n={i18n}
              defaults={translate(
                'auto.components.sidebar.MarkovYamlTrustDialog.alwaysTrustRepo',
                'Always trust <code>markov.yaml</code> in <repo/>'
              )}
              components={{ code: <code />, repo: <>{repoName}</> }}
            />
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => resolveAndClose('skip')}>
            {translate('auto.components.sidebar.MarkovYamlTrustDialog.43b7bec4cd', "Don't run")}
          </Button>
          <Button onClick={() => resolveAndClose('run')}>
            {translate('auto.components.sidebar.MarkovYamlTrustDialog.f3e2b868fb', 'Run hooks')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default MarkovYamlTrustDialog
