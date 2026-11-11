import type { MarkovCloudSignInProgress } from '../../shared/markov-profiles'

type ProgressListener = (progress: MarkovCloudSignInProgress | null) => void

// Only the newest attempt owns progress; late updates from older attempts are ignored.
let current: { attempt: number; link: string | null; cancel: () => void } | null = null
const listeners = new Set<ProgressListener>()

function snapshot(): MarkovCloudSignInProgress | null {
  return current ? { link: current.link } : null
}

function update(next: typeof current): void {
  current = next
  const progress = snapshot()
  for (const listener of listeners) {
    try {
      listener(progress)
    } catch (error) {
      console.warn('[markov-profiles] Sign-in progress listener failed:', error)
    }
  }
}

export function getMarkovCloudSignInProgress(): MarkovCloudSignInProgress | null {
  return snapshot()
}

export function onMarkovCloudSignInProgressChanged(listener: ProgressListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function startMarkovCloudSignInProgress(attempt: number, cancel: () => void): void {
  update({ attempt, link: null, cancel })
}

export function setMarkovCloudSignInLink(attempt: number, link: string | null): void {
  if (current?.attempt === attempt && current.link !== link) {
    update({ ...current, link })
  }
}

export function endMarkovCloudSignInProgress(attempt?: number): void {
  if (current && (attempt === undefined || current.attempt === attempt)) {
    update(null)
  }
}

export function cancelMarkovCloudSignIn(): void {
  current?.cancel()
}
