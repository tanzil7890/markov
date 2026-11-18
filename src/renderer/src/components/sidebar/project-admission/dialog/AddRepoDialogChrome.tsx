import { useEffect, useRef, type ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { preventOutsideDismissWhenDirty } from '@/lib/outside-dismiss-guard'
import {
  useCreateDialogHost,
  useRegisterCreateDialogHandlers
} from '@/components/create-dialog/create-dialog-host'
import type { AddRepoDialogStep } from './add-repo-dialog-types'
import { AddRepoStepIndicator } from './AddRepoStepIndicator'

type AddRepoDialogChromeProps = {
  children: ReactNode
  /** Inside the Create dialog, which owns the window; this side supplies its rules. */
  embedded?: boolean
  /** Embedded, this side unmounts without a closed render; it still has to stop a running clone. */
  onEmbeddedUnmount?: () => void
  isAdding: boolean
  isCloning: boolean
  isOpen: boolean
  onBack: () => void
  onCloseAutoFocus?: (event: Event) => void
  onOpenChange: (open: boolean) => void
  step: AddRepoDialogStep
}

function EmbeddedAddRepoChrome({
  children,
  isAdding,
  isCloning,
  onBack,
  onCloseAutoFocus,
  onOpenChange,
  step,
  onEmbeddedUnmount
}: Omit<AddRepoDialogChromeProps, 'embedded' | 'isOpen'>): React.JSX.Element {
  const host = useCreateDialogHost()
  const unmountRef = useRef(onEmbeddedUnmount)
  unmountRef.current = onEmbeddedUnmount
  useEffect(() => () => unmountRef.current?.(), [])
  useRegisterCreateDialogHandlers(host, {
    onOpenChange,
    // Closing the dialog aborts the clone; require an explicit close while it runs.
    onInteractOutside: preventOutsideDismissWhenDirty(() => isCloning),
    onCloseAutoFocus,
    // Leaving mid-add or mid-clone would drop work the user started here.
    kindSwitchDisabled: isAdding || isCloning,
    contentClassName:
      step === 'nested'
        ? 'max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden [&>*]:min-w-0'
        : 'overflow-hidden [&>*]:min-w-0'
  })
  return (
    <>
      <AddRepoStepIndicator step={step} isAdding={isAdding} onBack={onBack} />
      {children}
    </>
  )
}

export function AddRepoDialogChrome({
  children,
  embedded = false,
  isAdding,
  isCloning,
  isOpen,
  onBack,
  onCloseAutoFocus,
  onOpenChange,
  step,
  onEmbeddedUnmount
}: AddRepoDialogChromeProps) {
  if (embedded) {
    return (
      <EmbeddedAddRepoChrome
        onEmbeddedUnmount={onEmbeddedUnmount}
        isAdding={isAdding}
        isCloning={isCloning}
        onBack={onBack}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenChange={onOpenChange}
        step={step}
      >
        {children}
      </EmbeddedAddRepoChrome>
    )
  }
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        // Closing the dialog aborts the clone; require an explicit close while it runs.
        onInteractOutside={preventOutsideDismissWhenDirty(() => isCloning)}
        className={`min-w-0 overflow-hidden sm:max-w-lg [&>*]:min-w-0 ${
          step === 'nested' ? 'max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)]' : ''
        }`}
      >
        <AddRepoStepIndicator step={step} isAdding={isAdding} onBack={onBack} />
        {children}
      </DialogContent>
    </Dialog>
  )
}
