import { getWorkspaceComposerInitialFocusTarget } from '@/lib/workspace-composer-initial-focus'
import { useCreateDialogHost, useRegisterCreateDialogHandlers } from './create-dialog-host'

/** The Workspace side's rules: its own focus target, and Escape stays with an open preset editor. */
export function useWorkspaceCreateDialogHandlers(onDismiss: () => void): void {
  const host = useCreateDialogHost()
  useRegisterCreateDialogHandlers(host, {
    onOpenChange: (open) => !open && onDismiss(),
    onEscapeKeyDown: (event) => {
      const content = (event.target as HTMLElement | null)?.closest('[role="dialog"]')
      if (content?.querySelector('[data-sparse-preset-editor]')) {
        event.preventDefault()
      }
    },
    // Override Radix’s first-tabbable control with the name/source field for immediate typing.
    focusInitial: (content) => {
      const target = getWorkspaceComposerInitialFocusTarget(content)
      target?.focus({ preventScroll: true })
      return Boolean(target)
    },
    contentClassName: 'flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden'
  })
}
