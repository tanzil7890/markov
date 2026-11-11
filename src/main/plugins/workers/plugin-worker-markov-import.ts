// No `node:module` import here: `markov plugin test` loads this on Node 20.6, which has no registerHooks.

export const isMarkovSpecifier = (specifier: string): boolean =>
  specifier === 'markov' || specifier.startsWith('markov/')

/** Why a worker cannot import `markov` at run time; `markov plugin test` says the same. */
export function pluginWorkerMarkovImportMessage(specifier: string): string {
  return `cannot import "${specifier}" at run time: it only provides types. Write \`import type { MarkovWorkerApi } from 'markov/worker'\` and use the \`markov\` object passed to activate(markov).`
}
