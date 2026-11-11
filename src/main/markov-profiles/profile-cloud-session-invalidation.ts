type MarkovCloudSessionInvalidationListener = () => void

const listeners = new Set<MarkovCloudSessionInvalidationListener>()

/** Auth-failure invalidation only; explicit sign-out returns fresh status directly. */
export function onMarkovCloudSessionInvalidated(
  listener: MarkovCloudSessionInvalidationListener
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitMarkovCloudSessionInvalidated(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.warn(
        '[markov-profiles] Cloud session invalidation listener failed:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
