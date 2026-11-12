import { useSyncExternalStore } from 'react'

const elementByKey = new Map<string, HTMLElement>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Registers a mounted element under a key so a component elsewhere in the tree can portal into it. */
export function setPortalSlot(key: string, element: HTMLElement | null): void {
  if (element) {
    elementByKey.set(key, element)
  } else {
    elementByKey.delete(key)
  }
  for (const listener of listeners) {
    listener()
  }
}

export function usePortalSlot(key: string): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => elementByKey.get(key) ?? null,
    () => null
  )
}
