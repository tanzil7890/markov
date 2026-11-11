import { useAppStore } from '../../store'

export function registerMarkovProfileAuthIpcBridge(unsubs: (() => void)[]): void {
  const api = window.api.markovProfiles
  if (typeof api?.onAuthStatusChanged === 'function') {
    unsubs.push(
      api.onAuthStatusChanged(() => {
        void useAppStore.getState().fetchMarkovProfileAuthStatus()
      })
    )
  }
  if (typeof api?.onSignInProgressChanged === 'function') {
    // Why: a sign-in can already be in flight when this window loads; a later event or teardown wins.
    let ignoreSnapshot = false
    const unsubscribe = api.onSignInProgressChanged((progress) => {
      ignoreSnapshot = true
      useAppStore.setState({ markovProfileSignInProgress: progress })
    })
    unsubs.push(() => {
      ignoreSnapshot = true
      unsubscribe()
    })
    void Promise.resolve()
      .then(() => api.signInProgress())
      .then((progress) => {
        if (!ignoreSnapshot) {
          useAppStore.setState({ markovProfileSignInProgress: progress ?? null })
        }
      })
      .catch(() => {})
  }
}
