import type { PersistedState } from '../../../shared/persisted-state-types'
import type {
  MarkovdMigrationClientStatePayload,
  MarkovdMigrationUiRoutingState
} from '../../../shared/markovd-migration/markovd-migration-client-state'
import { serializeMarkovdMigrationValue } from '../../../shared/markovd-migration/markovd-migration-manifest'

export type PreparedMarkovdMigrationClientState = {
  incoming: MarkovdMigrationClientStatePayload | undefined
  mobileSelections: NonNullable<
    MarkovdMigrationClientStatePayload['mobileClientTabSelectionsByDeviceId']
  >
  uiRouting: MarkovdMigrationUiRoutingState | undefined
}

export function prepareMarkovdMigrationClientState(
  incoming: MarkovdMigrationClientStatePayload | undefined,
  state: PersistedState
): PreparedMarkovdMigrationClientState {
  const mobileSelections = prepareMobileSelections(
    incoming?.mobileClientTabSelectionsByDeviceId,
    state
  )
  const uiRouting = incoming?.uiRouting ? structuredClone(incoming.uiRouting) : undefined
  return {
    incoming,
    mobileSelections,
    uiRouting
  }
}

export function applyPreparedMarkovdMigrationClientState(
  prepared: PreparedMarkovdMigrationClientState,
  state: PersistedState
): void {
  if (Object.keys(prepared.mobileSelections).length > 0) {
    state.mobileClientTabSelectionsByDeviceId = { ...state.mobileClientTabSelectionsByDeviceId }
    for (const [deviceId, selections] of Object.entries(prepared.mobileSelections)) {
      state.mobileClientTabSelectionsByDeviceId[deviceId] = {
        ...state.mobileClientTabSelectionsByDeviceId[deviceId],
        ...selections
      }
    }
  }
  if (prepared.uiRouting) {
    applyUiRouting(prepared.uiRouting, state)
  }
}

function prepareMobileSelections(
  incoming: MarkovdMigrationClientStatePayload['mobileClientTabSelectionsByDeviceId'],
  state: PersistedState
): NonNullable<MarkovdMigrationClientStatePayload['mobileClientTabSelectionsByDeviceId']> {
  const result: NonNullable<
    MarkovdMigrationClientStatePayload['mobileClientTabSelectionsByDeviceId']
  > = {}
  const current = state.mobileClientTabSelectionsByDeviceId ?? {}
  for (const [deviceId, selections] of Object.entries(incoming ?? {})) {
    for (const [worktreeId, selection] of Object.entries(selections)) {
      const existing = current[deviceId]?.[worktreeId]
      if (
        existing &&
        serializeMarkovdMigrationValue(existing) !== serializeMarkovdMigrationValue(selection)
      ) {
        throw new Error(`markovd_migration_client_state_conflict:mobile:${deviceId}:${worktreeId}`)
      }
      const deviceSelections = (result[deviceId] ??= {})
      deviceSelections[worktreeId] = structuredClone(selection)
    }
  }
  return result
}

type UiRoutingKey = keyof MarkovdMigrationUiRoutingState
type UiRoutingFieldMerge<K extends UiRoutingKey> =
  /** Per-window filters stay on the desktop. */
  | 'desktop-only'
  /** Preserve the server's existing value. */
  | ((ui: PersistedState['ui'], value: NonNullable<MarkovdMigrationUiRoutingState[K]>) => void)

// View state cannot block a move: preserve server values and merge acknowledgements by latest time.
export const MARKOVD_MIGRATION_UI_ROUTING_MERGE: {
  readonly [K in UiRoutingKey]: UiRoutingFieldMerge<K>
} = {
  lastActiveRepoId: (ui, value) => {
    ui.lastActiveRepoId ??= value
  },
  lastActiveWorktreeId: (ui, value) => {
    ui.lastActiveWorktreeId ??= value
  },
  manualRepoOrder: (ui, value) => {
    if (!ui.manualRepoOrder?.length) {
      ui.manualRepoOrder = structuredClone(value)
    }
  },
  showDotfilesByWorktree: (ui, value) => {
    ui.showDotfilesByWorktree = { ...structuredClone(value), ...ui.showDotfilesByWorktree }
  },
  acknowledgedAgentsByPaneKey: (ui, value) => {
    // A retry must not revive an already-acknowledged unread mark.
    const merged = { ...ui.acknowledgedAgentsByPaneKey }
    for (const [paneKey, at] of Object.entries(value)) {
      merged[paneKey] = Math.max(merged[paneKey] ?? 0, at)
    }
    ui.acknowledgedAgentsByPaneKey = merged
  },
  setupScriptPromptDismissedRepoIds: (ui, value) => {
    ui.setupScriptPromptDismissedRepoIds = [
      ...new Set([...(ui.setupScriptPromptDismissedRepoIds ?? []), ...value])
    ]
  },
  filterRepoIds: 'desktop-only',
  workspaceHostScope: 'desktop-only',
  visibleWorkspaceHostIds: 'desktop-only',
  workspaceHostOrder: 'desktop-only',
  automationHostFilter: 'desktop-only'
}

const UI_ROUTING_KEYS = Object.keys(MARKOVD_MIGRATION_UI_ROUTING_MERGE).filter(isUiRoutingKey)

function isUiRoutingKey(key: string): key is UiRoutingKey {
  return Object.hasOwn(MARKOVD_MIGRATION_UI_ROUTING_MERGE, key)
}

function applyUiRouting(route: MarkovdMigrationUiRoutingState, state: PersistedState): void {
  for (const key of UI_ROUTING_KEYS) {
    mergeUiRoutingField(key, route, state.ui)
  }
}

function mergeUiRoutingField<K extends UiRoutingKey>(
  key: K,
  route: MarkovdMigrationUiRoutingState,
  ui: PersistedState['ui']
): void {
  const merge = MARKOVD_MIGRATION_UI_ROUTING_MERGE[key]
  const value = route[key]
  if (merge !== 'desktop-only' && value !== undefined && value !== null) {
    merge(ui, value)
  }
}
