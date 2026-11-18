import { useState } from 'react'
import { resolveMountedLazyModalIds, type LazyModalId } from '../lazy-modal-mount-state'
import { useAppStore } from '../store'

/** Retain first-opened lazy modals for state and smooth reopening. */
export function useLazyModalMounts(): {
  mountedLazyModalIds: ReadonlySet<LazyModalId>
} {
  const activeModal = useAppStore((s) => s.activeModal)
  const [mountedLazyModalIds, setMountedLazyModalIds] = useState<Set<LazyModalId>>(() => new Set())

  const resolvedMountedLazyModalIds = resolveMountedLazyModalIds(activeModal, mountedLazyModalIds)
  if (resolvedMountedLazyModalIds !== mountedLazyModalIds) {
    setMountedLazyModalIds(new Set(resolvedMountedLazyModalIds))
  }

  return { mountedLazyModalIds: resolvedMountedLazyModalIds }
}
