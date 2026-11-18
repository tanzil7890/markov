import React, { useRef } from 'react'
import { cn } from '@/lib/utils'

type CompactAgentExpansionProps = {
  expanded: boolean
  contentClassName?: string
  children: React.ReactNode
}

export function CompactAgentExpansion({
  expanded,
  contentClassName,
  children
}: CompactAgentExpansionProps): React.JSX.Element {
  const hasRenderedChildrenRef = useRef(expanded)
  if (expanded) {
    // Retain opened content for collapse animation without an extra effect-driven expansion render.
    hasRenderedChildrenRef.current = true
  }
  const shouldRenderChildren = expanded || hasRenderedChildrenRef.current

  return (
    <div
      className={cn(
        'compact-agent-expansion-grid',
        expanded && 'compact-agent-expansion-grid-expanded'
      )}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      {/* Why: clip only the height animation; a gutter-hung chevron overflows horizontally. */}
      <div className="min-h-0 min-w-0 overflow-x-visible overflow-y-clip">
        {shouldRenderChildren && (
          <div
            className={cn(
              'compact-agent-expansion-content flex flex-col gap-0.5 pt-0.5',
              contentClassName
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
