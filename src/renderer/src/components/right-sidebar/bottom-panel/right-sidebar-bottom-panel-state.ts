import { create } from 'zustand'

export type RightSidebarBottomView = 'terminal' | 'commands'

/** Share of the sidebar body the top half takes; each half keeps a usable minimum. */
export const RIGHT_SIDEBAR_TOP_SHARE_MIN = 0.2
export const RIGHT_SIDEBAR_TOP_SHARE_MAX = 0.8
const DEFAULT_TOP_SHARE = 0.55
const STORAGE_KEY = 'markov.right-sidebar-bottom-panel.v1'

type StoredBottomPanel = {
  view: RightSidebarBottomView
  folded: boolean
  topShare: number
}

type RightSidebarBottomPanelState = StoredBottomPanel & {
  /** Bumped to ask the Commands view to take focus. */
  commandsFocusRequest: number
  setView: (view: RightSidebarBottomView) => void
  setFolded: (folded: boolean) => void
  setTopShare: (share: number) => void
  showCommands: () => void
}

export function clampRightSidebarTopShare(share: number): number {
  if (!Number.isFinite(share)) {
    return DEFAULT_TOP_SHARE
  }
  return Math.min(RIGHT_SIDEBAR_TOP_SHARE_MAX, Math.max(RIGHT_SIDEBAR_TOP_SHARE_MIN, share))
}

function readStored(): StoredBottomPanel {
  const fallback: StoredBottomPanel = {
    view: 'terminal',
    folded: false,
    topShare: DEFAULT_TOP_SHARE
  }
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<StoredBottomPanel>
    return {
      view: parsed.view === 'commands' ? 'commands' : 'terminal',
      folded: parsed.folded === true,
      topShare: clampRightSidebarTopShare(Number(parsed.topShare ?? DEFAULT_TOP_SHARE))
    }
  } catch {
    return fallback
  }
}

function writeStored(state: StoredBottomPanel): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ view: state.view, folded: state.folded, topShare: state.topShare })
    )
  } catch {
    // Why: a private window or blocked storage only loses the remembered layout.
  }
}

export const useRightSidebarBottomPanel = create<RightSidebarBottomPanelState>()((set, get) => {
  const update = (patch: Partial<StoredBottomPanel>): void => {
    set(patch)
    writeStored(get())
  }
  return {
    ...readStored(),
    commandsFocusRequest: 0,
    setView: (view) => update({ view, folded: false }),
    setFolded: (folded) => update({ folded }),
    setTopShare: (share) => update({ topShare: clampRightSidebarTopShare(share) }),
    showCommands: () => {
      update({ view: 'commands', folded: false })
      set((state) => ({ commandsFocusRequest: state.commandsFocusRequest + 1 }))
    }
  }
})
