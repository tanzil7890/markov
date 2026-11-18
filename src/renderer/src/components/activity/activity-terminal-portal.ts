import { useCallback, useSyncExternalStore } from 'react'

export type ActivityTerminalPortalTarget = {
  slotId: string
  requestToken: string
  target: HTMLElement
  worktreeId: string
  tabId: string
  // Carry the durable leaf paneKey; TerminalPane resolves its current numeric handle immediately before isolation. Null shows the whole tab.
  paneKey: string | null
  forceUnavailable?: boolean
  active: boolean
}

/** Activity shows one agent's pane; the right sidebar shows its own terminal tabs. */
export type TerminalPortalOwner = 'activity' | 'right-sidebar'

const targetsByOwner: Record<TerminalPortalOwner, ActivityTerminalPortalTarget[]> = {
  activity: [],
  'right-sidebar': []
}
let publication = 0
const combinedCache = new Map<
  boolean,
  { publication: number; targets: ActivityTerminalPortalTarget[] }
>()
const emptyTargets: ActivityTerminalPortalTarget[] = []
const subscribers = new Set<() => void>()

type ActivityTerminalPortalFieldEquals = (
  left: ActivityTerminalPortalTarget,
  right: ActivityTerminalPortalTarget
) => boolean

// Require every descriptor field in this keyed record; omitted equality checks would suppress publication and strand Terminal on stale routing.
const ACTIVITY_TERMINAL_PORTAL_FIELD_EQUALS: readonly ActivityTerminalPortalFieldEquals[] =
  Object.values({
    slotId: (left, right) => left.slotId === right.slotId,
    requestToken: (left, right) => left.requestToken === right.requestToken,
    target: (left, right) => left.target === right.target,
    worktreeId: (left, right) => left.worktreeId === right.worktreeId,
    tabId: (left, right) => left.tabId === right.tabId,
    paneKey: (left, right) => left.paneKey === right.paneKey,
    forceUnavailable: (left, right) => left.forceUnavailable === right.forceUnavailable,
    active: (left, right) => left.active === right.active
  } satisfies Record<keyof ActivityTerminalPortalTarget, ActivityTerminalPortalFieldEquals>)

function haveSameActivityTerminalPortals(
  left: readonly ActivityTerminalPortalTarget[],
  right: readonly ActivityTerminalPortalTarget[]
): boolean {
  return (
    left.length === right.length &&
    left.every((target, index) => {
      const candidate = right[index]
      return (
        candidate !== undefined &&
        ACTIVITY_TERMINAL_PORTAL_FIELD_EQUALS.every((isEqual) => isEqual(target, candidate))
      )
    })
  )
}

export function setTerminalPortalTargets(
  owner: TerminalPortalOwner,
  targets: ActivityTerminalPortalTarget[]
): void {
  const current = targetsByOwner[owner]
  // Why: semantic no-ops must not synchronously bounce through Terminal and back into the publisher.
  if (current === targets || haveSameActivityTerminalPortals(current, targets)) {
    return
  }
  targetsByOwner[owner] = targets
  publication++
  for (const subscriber of subscribers) {
    subscriber()
  }
}

// Publish worktree/tab routing with the target; deriving it from global active state briefly portaled the wrong terminal when activation writes arrived separately.
export function setActivityTerminalPortals(targets: ActivityTerminalPortalTarget[]): void {
  setTerminalPortalTargets('activity', targets)
}

function combinedTargets(includeActivity: boolean): ActivityTerminalPortalTarget[] {
  const cached = combinedCache.get(includeActivity)
  if (cached?.publication === publication) {
    return cached.targets
  }
  const activity = includeActivity ? targetsByOwner.activity : emptyTargets
  // A tab Activity is showing stays there; two portals cannot hold one pane.
  const sidebar = targetsByOwner['right-sidebar'].filter(
    (target) =>
      !activity.some(
        (claimed) => claimed.worktreeId === target.worktreeId && claimed.tabId === target.tabId
      )
  )
  const targets =
    activity.length === 0 && sidebar.length === 0 ? emptyTargets : [...activity, ...sidebar]
  combinedCache.set(includeActivity, { publication, targets })
  return targets
}

function subscribeActivityTerminalPortals(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

/** Activity's targets while its page is shown, plus the right sidebar's at all times. */
export function useActivityTerminalPortals(activityShown: boolean): ActivityTerminalPortalTarget[] {
  // Subscribe directly to module state so Terminal can consume targets without app-store routing.
  const getSnapshot = useCallback(() => combinedTargets(activityShown), [activityShown])
  return useSyncExternalStore(subscribeActivityTerminalPortals, getSnapshot, getSnapshot)
}

export function findActivityTerminalPortal(
  targets: ActivityTerminalPortalTarget[],
  query: {
    worktreeId: string
    tabId: string
    slotId?: string
    paneKey?: string
    requestToken?: string
  }
): ActivityTerminalPortalTarget | null {
  const matchingTab = targets.filter(
    (target) => target.worktreeId === query.worktreeId && target.tabId === query.tabId
  )
  if (
    query.slotId !== undefined ||
    query.paneKey !== undefined ||
    query.requestToken !== undefined
  ) {
    const exact = matchingTab.find(
      (target) =>
        (query.slotId === undefined || target.slotId === query.slotId) &&
        (query.paneKey === undefined || target.paneKey === query.paneKey) &&
        (query.requestToken === undefined || target.requestToken === query.requestToken)
    )
    if (exact) {
      return exact
    }
  }
  return (
    matchingTab.find((target) => target.active) ??
    (matchingTab.length === 1 ? matchingTab[0] : null) ??
    null
  )
}
