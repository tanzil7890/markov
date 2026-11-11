export const MARKOVD_PAIRING_REPAIR_FAILED_CODE = 'markovd_pairing_repair_failed'

export class MarkovdManagedPairingRepairFailedError extends Error {
  readonly code = MARKOVD_PAIRING_REPAIR_FAILED_CODE
  constructor(reason: string) {
    super(
      `${MARKOVD_PAIRING_REPAIR_FAILED_CODE}: the Markov server on this host no longer accepts this ` +
        `computer, and Markov couldn't pair with it again over SSH: ${reason}. Nothing on the host ` +
        `was stopped; its terminals can't be verified until Markov pairs again. Connect again to retry.`
    )
    this.name = 'MarkovdManagedPairingRepairFailedError'
  }
}
