/** Leads PATH with the managed WSL CLI after startup files ran; an unusable CLI only warns. */
export const WSL_MANAGED_CLI_PATH_RESTORE = `if [ -n "\${MARKOV_WSL_CLI_DIR:-}" ]; then
  if [ -x "$MARKOV_WSL_CLI_DIR/\${MARKOV_CLI_COMMAND:-}" ]; then
    export PATH="$MARKOV_WSL_CLI_DIR\${PATH:+:$PATH}"
  else
    printf 'Markov CLI unavailable: cannot run %s. Check WSL Windows-drive mount options.\\n' "$MARKOV_WSL_CLI_DIR/\${MARKOV_CLI_COMMAND:-}" >&2
  fi
fi`
