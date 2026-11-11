export const MARKOV_RUNTIME_RPC_FEATURE_INTERACTION_SOURCE_KEY = '__markovFeatureInteractionSource'

export const MARKOV_RUNTIME_RPC_BROWSER_UI_SOURCE = 'browser-pane-ui'

export function withBrowserPaneUiRuntimeRpcSource(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      [MARKOV_RUNTIME_RPC_FEATURE_INTERACTION_SOURCE_KEY]: MARKOV_RUNTIME_RPC_BROWSER_UI_SOURCE
    }
  }
  return {
    ...value,
    [MARKOV_RUNTIME_RPC_FEATURE_INTERACTION_SOURCE_KEY]: MARKOV_RUNTIME_RPC_BROWSER_UI_SOURCE
  }
}

export function isBrowserPaneUiRuntimeRpcParams(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)[MARKOV_RUNTIME_RPC_FEATURE_INTERACTION_SOURCE_KEY] ===
      MARKOV_RUNTIME_RPC_BROWSER_UI_SOURCE
  )
}
