/** Detect address used as a noun for Markov session identity; exclude verbs and distinct run:/dispatch:/group mailboxes. */
export const MARKOV_SESSION_ID_AS_ADDRESS =
  /\b(?:orchestration|session|Markov|coordinator's|your(?: own)?) address\b|caller\.address|naming its address/i
