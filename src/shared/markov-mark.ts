// Same geometry as resources/logo.svg: Markie, an M-topped body with two pill eyes cut out.
// Draw MARKOV_MARK_PATH with fill-rule evenodd so the eyes stay holes in one-colour copies.
export const MARKOV_MARK_WIDTH = 84
export const MARKOV_MARK_HEIGHT = 88
export const MARKOV_MARK_VIEW_BOX = `0 0 ${MARKOV_MARK_WIDTH} ${MARKOV_MARK_HEIGHT}`
export const MARKOV_MARK_BODY_PATH =
  'M0 40C0 12 12 0 25 0C35 0 40 7 42 12C44 7 49 0 59 0C72 0 84 12 84 40V60C84 78 72 88 54 88H30C12 88 0 78 0 60Z'
export const MARKOV_MARK_EYES_PATH =
  'M25 40.5A5 5 0 0 1 35 40.5V49.5A5 5 0 0 1 25 49.5ZM49 40.5A5 5 0 0 1 59 40.5V49.5A5 5 0 0 1 49 49.5Z'
export const MARKOV_MARK_PATH = `${MARKOV_MARK_BODY_PATH}${MARKOV_MARK_EYES_PATH}`
/** Eye centres and size, so a live mark can move and blink them. */
export const MARKOV_MARK_EYE_CENTERS = [
  { x: 30, y: 45 },
  { x: 54, y: 45 }
] as const
export const MARKOV_MARK_EYE_WIDTH = 10
export const MARKOV_MARK_EYE_HEIGHT = 19
