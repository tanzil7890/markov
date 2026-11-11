let listener: (environmentId: string) => void | Promise<void> = () => {}

export function setManagedMarkovdPairingRepairedListener(
  next: (environmentId: string) => void | Promise<void>
): void {
  listener = next
}

export function notifyManagedMarkovdPairingRepaired(environmentId: string): void | Promise<void> {
  return listener(environmentId)
}
