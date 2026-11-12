import { useEffect, useState } from 'react'

const MODIFIER_HELD: Record<string, (event: KeyboardEvent) => boolean> = {
  '⌘': (event) => event.metaKey,
  Cmd: (event) => event.metaKey,
  Ctrl: (event) => event.ctrlKey,
  '⌃': (event) => event.ctrlKey,
  Alt: (event) => event.altKey,
  '⌥': (event) => event.altKey,
  '⇧': (event) => event.shiftKey
}

/** True while every modifier of the number-jump chord is down, so row numbers show only when usable. */
export function usePaletteDigitModifierHeld(
  visible: boolean,
  modifierKeys: readonly string[]
): boolean {
  const [held, setHeld] = useState(false)
  const modifierSignature = modifierKeys.join('+')
  useEffect(() => {
    const checks = modifierSignature
      ? modifierSignature.split('+').map((key) => MODIFIER_HELD[key])
      : []
    if (!visible || checks.length === 0 || checks.some((check) => !check)) {
      return
    }
    const update = (event: KeyboardEvent): void => {
      setHeld(checks.every((check) => check?.(event)))
    }
    const release = (): void => setHeld(false)
    window.addEventListener('keydown', update, true)
    window.addEventListener('keyup', update, true)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', update, true)
      window.removeEventListener('keyup', update, true)
      window.removeEventListener('blur', release)
      // Why: the chord's keyup can land after close; a stale true would show numbers on the next open.
      release()
    }
  }, [modifierSignature, visible])
  return visible && held
}
