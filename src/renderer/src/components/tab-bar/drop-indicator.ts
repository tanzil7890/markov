export type DropIndicator = 'left' | 'right' | null

// Use a visible blue insertion cue above tab borders without changing layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

// The active tab is marked by its lifted surface and border, so the bar stays out of the layout.
export const ACTIVE_TAB_INDICATOR_CLASSES = 'hidden'

export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'rounded-t-md border-border bg-tab-active font-medium text-tab-active-foreground'
    : 'border-transparent bg-transparent text-tab-inactive-foreground hover:text-tab-active-foreground'
}

// Why widths only: every tab reserves the same border so activating one never shifts its neighbours.
export function getTabStripBorderClasses(
  _hasTabsToRight: boolean,
  options?: { includeTopBorder?: boolean }
): string {
  return (options?.includeTopBorder ?? true) ? 'border-x border-t' : 'border-x'
}
