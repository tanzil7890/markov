import type { FloatingTerminalTriggerLocation } from './ui-chrome-types'

export type FloatingTerminalTriggerSettings = {
  /** Where the Floating Workspace toggle is shown; defaults to the sidebar footer, beside Reveal active workspace. */
  floatingTerminalTriggerLocation: FloatingTerminalTriggerLocation
  /** One-shot marker: the old top-bar default moved to the sidebar once; a later top-bar choice sticks. */
  floatingTerminalTriggerMovedToSidebar?: boolean
}

export const DEFAULT_FLOATING_TERMINAL_TRIGGER_LOCATION: FloatingTerminalTriggerLocation = 'sidebar'

const FLOATING_TERMINAL_TRIGGER_LOCATIONS: readonly FloatingTerminalTriggerLocation[] = [
  'sidebar',
  'top-bar',
  'floating-button',
  'status-bar'
]

function isFloatingTerminalTriggerLocation(
  value: unknown
): value is FloatingTerminalTriggerLocation {
  return FLOATING_TERMINAL_TRIGGER_LOCATIONS.includes(value as FloatingTerminalTriggerLocation)
}

export function resolveFloatingTerminalTriggerLocation(
  settings: { floatingTerminalTriggerLocation?: FloatingTerminalTriggerLocation } | null | undefined
): FloatingTerminalTriggerLocation {
  return settings?.floatingTerminalTriggerLocation ?? DEFAULT_FLOATING_TERMINAL_TRIGGER_LOCATION
}

/** Moves the retired top-bar default to the sidebar once; a top-bar choice made afterwards sticks. */
export function migrateFloatingTerminalTriggerLocation(
  stored:
    | { floatingTerminalTriggerLocation?: unknown; floatingTerminalTriggerMovedToSidebar?: unknown }
    | undefined
): FloatingTerminalTriggerLocation {
  const location = stored?.floatingTerminalTriggerLocation
  if (!isFloatingTerminalTriggerLocation(location)) {
    return DEFAULT_FLOATING_TERMINAL_TRIGGER_LOCATION
  }
  if (location === 'top-bar' && stored?.floatingTerminalTriggerMovedToSidebar !== true) {
    return 'sidebar'
  }
  return location
}
