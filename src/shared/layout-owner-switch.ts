// Centralize MARKOV_LAYOUT_OWNER so all branch points are searchable; main enables the dark path.
// Off in shipped builds; remove with the old path in phase F.

/** Substituted by electron.vite.config.ts; absent (off) in tests, the CLI and the web client. */
declare const MARKOV_LAYOUT_OWNER: 'window' | 'main' | undefined

export const MARKOV_LAYOUT_OWNER_IS_MAIN =
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- undeclared outside electron-vite builds; a bare read throws.
  typeof MARKOV_LAYOUT_OWNER !== 'undefined' && MARKOV_LAYOUT_OWNER === 'main'
