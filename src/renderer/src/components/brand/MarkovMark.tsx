import { useEffect, useId, useRef } from 'react'
import {
  MARKOV_MARK_BODY_PATH,
  MARKOV_MARK_EYE_CENTERS,
  MARKOV_MARK_EYE_HEIGHT,
  MARKOV_MARK_EYE_WIDTH,
  MARKOV_MARK_HEIGHT,
  MARKOV_MARK_VIEW_BOX,
  MARKOV_MARK_WIDTH
} from '../../../../shared/markov-mark'
import { cn } from '@/lib/utils'
import { trackMarkovMarkEyes } from './markov-mark-gaze'

type MarkovMarkProps = {
  className?: string
  /** Eyes follow the pointer and blink. */
  live?: boolean
  /** Paint in currentColor instead of the brand red, for icon slots. */
  monochrome?: boolean
  /** Accessible name; without one the mark is decorative. */
  label?: string
}

type BlinkStyle = React.CSSProperties & { '--markov-mark-blink-delay': string }

/** Markie, the Markov mark. The eyes are holes, so the surface behind shows through them. */
export function MarkovMark({
  className,
  live = false,
  monochrome = false,
  label
}: MarkovMarkProps): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const maskId = `markov-mark-${id}`
  const svgRef = useRef<SVGSVGElement>(null)
  const eyesRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    const eyes = eyesRef.current
    if (!live || !svg || !eyes || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    return trackMarkovMarkEyes(svg, eyes)
  }, [live])

  // Offset blinks by instance so marks on screen together never blink in unison.
  const blinkOffsetSeconds = ([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 60) / 10
  const blinkStyle: BlinkStyle | undefined = live
    ? { '--markov-mark-blink-delay': `-${blinkOffsetSeconds}s` }
    : undefined

  return (
    <svg
      ref={svgRef}
      viewBox={MARKOV_MARK_VIEW_BOX}
      className={cn('markov-mark', monochrome && 'markov-mark--monochrome', className)}
      style={blinkStyle}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={MARKOV_MARK_WIDTH}
          height={MARKOV_MARK_HEIGHT}
        >
          <path className="markov-mark-mask-body" d={MARKOV_MARK_BODY_PATH} />
          <g ref={eyesRef} className={live ? 'markov-mark-eyes' : undefined}>
            {MARKOV_MARK_EYE_CENTERS.map((eye) => (
              <rect
                key={eye.x}
                className="markov-mark-mask-eye"
                x={eye.x - MARKOV_MARK_EYE_WIDTH / 2}
                y={eye.y - MARKOV_MARK_EYE_HEIGHT / 2}
                width={MARKOV_MARK_EYE_WIDTH}
                height={MARKOV_MARK_EYE_HEIGHT}
                rx={MARKOV_MARK_EYE_WIDTH / 2}
              />
            ))}
          </g>
        </mask>
      </defs>
      <path className="markov-mark-body" d={MARKOV_MARK_BODY_PATH} mask={`url(#${maskId})`} />
    </svg>
  )
}
