// Clear the launching terminal’s inherited Markov identity so test branches depend on fixture env, not which agent launched runner.
for (const name of [
  'MARKOV_AGENT_SESSION_ID',
  'MARKOV_STRUCTURED_SESSION',
  'MARKOV_WORKTREE_ID',
  'MARKOV_WORKSPACE_ID',
  'MARKOV_RUNTIME_SOURCE_ID',
  'MARKOV_RUNTIME_SOURCE_INCARNATION',
  'MARKOV_RUNTIME_SOURCE_PROFILE_PATH'
]) {
  delete process.env[name]
}
