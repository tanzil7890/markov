import { machineKeyString, type MachineKey } from './machine-store.js'

// Held polls wait here; new deliveries or a newer hello wake them. One process only: running several
// connector instances needs a shared wake-up (PostgreSQL LISTEN/NOTIFY) before scaling out.
export class PollWaiters {
  private readonly waiting = new Map<string, Set<() => void>>()

  wait(key: MachineKey, ms: number, signal: AbortSignal): Promise<void> {
    const id = machineKeyString(key)
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        this.waiting.get(id)?.delete(done)
        resolve()
      }
      const timer = setTimeout(done, Math.max(0, ms))
      signal.addEventListener('abort', done, { once: true })
      let set = this.waiting.get(id)
      if (!set) {
        set = new Set()
        this.waiting.set(id, set)
      }
      set.add(done)
    })
  }

  wake(key: MachineKey): void {
    const id = machineKeyString(key)
    const set = this.waiting.get(id)
    if (!set) return
    this.waiting.delete(id)
    for (const done of set) done()
  }

  isWaiting(key: MachineKey): boolean {
    return (this.waiting.get(machineKeyString(key))?.size ?? 0) > 0
  }
}
