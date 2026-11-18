// One pointer listener moves the eyes of every live mark; CSS eases each move.
type TrackedMark = { svg: SVGSVGElement; eyes: SVGGElement }

const tracked = new Set<TrackedMark>()
// In mark units (84 x 88): far enough to read as looking, close enough to stay inside the body.
const MAX_SHIFT_X = 6
const MAX_SHIFT_Y = 5
const FULL_REACH_PX = 280

let frame = 0
let pointer: { x: number; y: number } | null = null

function moveEyes(): void {
  frame = 0
  for (const mark of tracked) {
    let x = 0
    let y = 0
    if (pointer) {
      const rect = mark.svg.getBoundingClientRect()
      const dx = pointer.x - (rect.left + rect.width / 2)
      const dy = pointer.y - (rect.top + rect.height / 2)
      const distance = Math.hypot(dx, dy)
      if (distance > 0) {
        const reach = Math.min(1, distance / FULL_REACH_PX)
        x = (dx / distance) * reach * MAX_SHIFT_X
        y = (dy / distance) * reach * MAX_SHIFT_Y
      }
    }
    mark.eyes.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`
  }
}

function scheduleMove(): void {
  if (!frame) {
    frame = requestAnimationFrame(moveEyes)
  }
}

function onPointerMove(event: PointerEvent): void {
  pointer = { x: event.clientX, y: event.clientY }
  scheduleMove()
}

function onPointerGone(): void {
  pointer = null
  scheduleMove()
}

/** Eyes look toward the pointer and return to centre when it leaves the window. */
export function trackMarkovMarkEyes(svg: SVGSVGElement, eyes: SVGGElement): () => void {
  const mark = { svg, eyes }
  if (tracked.size === 0) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerGone)
    window.addEventListener('blur', onPointerGone)
  }
  tracked.add(mark)
  scheduleMove()
  return () => {
    tracked.delete(mark)
    if (tracked.size > 0) {
      return
    }
    window.removeEventListener('pointermove', onPointerMove)
    document.documentElement.removeEventListener('pointerleave', onPointerGone)
    window.removeEventListener('blur', onPointerGone)
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}
