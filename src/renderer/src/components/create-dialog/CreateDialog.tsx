import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CreateDialogKindSwitch } from './CreateDialogKindSwitch'
import {
  CreateDialogHostContext,
  type CreateDialogHandlers,
  type CreateDialogHost,
  type CreateDialogKind
} from './create-dialog-host'

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Focus the shown side's first control, past the switch. */
function focusFirstBodyControl(content: HTMLElement): void {
  const target = Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
    (element) => !element.closest('[data-create-dialog-switch]')
  )
  target?.focus({ preventScroll: true })
}

/** One dialog for creating a workspace or adding a project; each side keeps its own flow. */
export function CreateDialog({
  initialKind,
  workspace,
  project,
  onClose
}: {
  initialKind: CreateDialogKind
  workspace: ReactNode
  project: ReactNode
  onClose: () => void
}): React.JSX.Element {
  const [kind, setKind] = useState<CreateDialogKind>(initialKind)
  const [contentClassName, setContentClassName] = useState<string | undefined>(undefined)
  const [kindSwitchDisabled, setKindSwitchDisabled] = useState(false)
  const handlersRef = useRef<CreateDialogHandlers | null>(null)

  const host = useMemo<CreateDialogHost>(
    () => ({
      registerHandlers: (handlers) => {
        handlersRef.current = handlers
        setContentClassName(handlers.contentClassName)
        setKindSwitchDisabled(handlers.kindSwitchDisabled === true)
      }
    }),
    []
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (handlersRef.current) {
          handlersRef.current.onOpenChange(open)
        } else if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        className={cn('min-w-0 sm:max-w-lg', contentClassName)}
        onInteractOutside={(event) => handlersRef.current?.onInteractOutside?.(event)}
        onEscapeKeyDown={(event) => handlersRef.current?.onEscapeKeyDown?.(event)}
        onCloseAutoFocus={(event) => handlersRef.current?.onCloseAutoFocus?.(event)}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const content = event.currentTarget as HTMLElement
          if (!handlersRef.current?.focusInitial?.(content)) {
            focusFirstBodyControl(content)
          }
        }}
      >
        {/* The switch stays mounted across sides so focus remains on the tab just chosen. */}
        <CreateDialogKindSwitch
          kind={kind}
          disabled={kindSwitchDisabled}
          onKindChange={(next) => {
            handlersRef.current = null
            setKindSwitchDisabled(false)
            setKind(next)
          }}
        />
        <CreateDialogHostContext.Provider value={host}>
          {kind === 'workspace' ? workspace : project}
        </CreateDialogHostContext.Provider>
      </DialogContent>
    </Dialog>
  )
}
