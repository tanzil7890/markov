export const MARKOV_CLI_POSIX_PATH_RESTORE = `if [ -n "\${MARKOV_CLI_BIN_DIR:-}" ]; then
  case "\${PATH:-}" in
    "$MARKOV_CLI_BIN_DIR"|"$MARKOV_CLI_BIN_DIR":*) ;;
    *) export PATH="$MARKOV_CLI_BIN_DIR\${PATH:+:$PATH}" ;;
  esac
fi`
