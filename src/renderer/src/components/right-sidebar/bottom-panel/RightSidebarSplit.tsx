import { useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  clampRightSidebarTopShare,
  useRightSidebarBottomPanel
} from './right-sidebar-bottom-panel-state'

const KEYBOARD_STEP = 0.05

/** Two stacked halves with a draggable line between them; a folded bottom keeps only its own header. */
export function RightSidebarSplit({
  top,
  bottom
}: {
  top: React.ReactNode
  /** Null outside a workspace: the top half then fills the sidebar. */
  bottom: React.ReactNode | null
}): React.JSX.Element {
  const storedFolded = useRightSidebarBottomPanel((s) => s.folded)
  const folded = storedFolded || bottom === null
  const savedShare = useRightSidebarBottomPanel((s) => s.topShare)
  const setTopShare = useRightSidebarBottomPanel((s) => s.setTopShare)
  const [draftShare, setDraftShare] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const share = draftShare ?? savedShare

  const shareAt = (clientY: number): number | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) {
      return null
    }
    return clampRightSidebarTopShare((clientY - rect.top) / rect.height)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraftShare(share)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (draftShare === null) {
      return
    }
    const next = shareAt(event.clientY)
    if (next !== null) {
      setDraftShare(next)
    }
  }
  const finishDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (draftShare === null) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setTopShare(draftShare)
    setDraftShare(null)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      setTopShare(share + (event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP))
    }
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ flex: folded ? '1 1 0' : `${share} 1 0` }}
      >
        {top}
      </div>
      {bottom === null ? null : folded ? (
        <div aria-hidden className="h-px shrink-0 bg-border" />
      ) : (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={translate(
            'auto.components.right.sidebar.bottomPanel.resize',
            'Resize the two halves'
          )}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(share * 100)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={onKeyDown}
          className={cn(
            'group/split relative h-px shrink-0 cursor-row-resize touch-none bg-border outline-none',
            'before:absolute before:inset-x-0 before:-top-1 before:-bottom-1 before:content-[""]',
            'hover:bg-ring/40 focus-visible:bg-ring',
            draftShare !== null && 'bg-ring/60'
          )}
        />
      )}
      {bottom === null ? null : (
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ flex: folded ? '0 0 auto' : `${1 - share} 1 0` }}
        >
          {bottom}
        </div>
      )}
    </div>
  )
}
