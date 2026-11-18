import { useCallback } from 'react'
import type { AddRepoDialogStep } from './add-repo-dialog-types'

/** Back returns to the first step; closing also leaves the modal. Both abort any clone via reset. */
export function useAddRepoDialogCloseActions({
  step,
  isAdding,
  closeModal,
  resetState,
  trackNestedBackAction
}: {
  step: AddRepoDialogStep
  isAdding: boolean
  closeModal: () => void
  resetState: () => void
  trackNestedBackAction: () => void
}): { handleBack: () => void; handleOpenChange: (open: boolean) => void } {
  const handleBack = useCallback(() => {
    if (step === 'nested') {
      trackNestedBackAction()
    }
    resetState()
  }, [resetState, step, trackNestedBackAction])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (step === 'nested' && !isAdding) {
          trackNestedBackAction()
        }
        closeModal()
        resetState()
      }
    },
    [closeModal, isAdding, resetState, step, trackNestedBackAction]
  )

  return { handleBack, handleOpenChange }
}
