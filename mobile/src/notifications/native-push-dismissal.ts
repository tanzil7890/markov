import type { MarkovPushPayload } from './push-payload'

export type NativeDismissal = {
  rememberAll(payloads: readonly MarkovPushPayload[]): Promise<void>
  wasDismissed(payload: MarkovPushPayload): Promise<boolean>
}
// Android and web use JavaScript storage; iOS requires the native ledger.
export const nativePushDismissal: NativeDismissal | null = null
