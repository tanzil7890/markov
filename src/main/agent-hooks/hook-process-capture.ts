/** Capture before Markov inserts its managed-script shell. */
export const HOOK_PARENT_CAPTURE =
  'MARKOV_HOOK_AGENT_PID="${PPID:-}"; export MARKOV_HOOK_AGENT_PID; '

// Uncached, as no builtin tells a reused PID from its old process: Linux reads /proc, macOS runs only ps.
export function buildHookProcessCapture(): string[] {
  return [
    'markov_agent_process=',
    // Field 20 after the command name is the start time in clock ticks since boot.
    'markov_agent_start_ticks() { markov_agent_start=${20-}; }',
    '[ -z "${MARKOV_PANE_KEY:-}" ] || case "${MARKOV_HOOK_AGENT_PID:-}" in ""|*[!0-9]*) ;; *)',
    '  if [ -r "/proc/$MARKOV_HOOK_AGENT_PID/stat" ]; then',
    '    markov_agent_stat= markov_agent_line= markov_agent_boot= markov_agent_start=',
    // Read to EOF: a command name may contain a newline, and the strip below takes the last ") ".
    '    while IFS= read -r markov_agent_line || [ -n "$markov_agent_line" ]; do markov_agent_stat="$markov_agent_stat$markov_agent_line "; markov_agent_line=; done 2>/dev/null < "/proc/$MARKOV_HOOK_AGENT_PID/stat"',
    '    IFS= read -r markov_agent_boot 2>/dev/null < /proc/sys/kernel/random/boot_id',
    '    markov_agent_start_ticks ${markov_agent_stat##*) }',
    '    case "$markov_agent_start" in ""|*[!0-9]*) ;; *)',
    '      [ -z "$markov_agent_boot" ] || markov_agent_process="{\\"pid\\":$MARKOV_HOOK_AGENT_PID,\\"platform\\":\\"linux\\",\\"startTime\\":\\"$markov_agent_boot:$markov_agent_start\\"}" ;; esac',
    // Bash sets OSTYPE on macOS; other shells still ask uname.
    '  elif case "${OSTYPE-}" in darwin*) ;; *) [ "$(uname -s 2>/dev/null)" = Darwin ] ;; esac; then',
    // Match the host probe's timezone when comparing local-time lstart strings.
    '    markov_agent_start=$(TZ=UTC0 LC_ALL=C exec /bin/ps -p "$MARKOV_HOOK_AGENT_PID" -o lstart= 2>/dev/null)',
    '    markov_agent_start=${markov_agent_start#"${markov_agent_start%%[! ]*}"}',
    '    markov_agent_start=${markov_agent_start%"${markov_agent_start##*[! ]}"}',
    '    [ -z "$markov_agent_start" ] || markov_agent_process="{\\"pid\\":$MARKOV_HOOK_AGENT_PID,\\"platform\\":\\"darwin\\",\\"startTime\\":\\"$markov_agent_start\\"}"',
    '  fi ;;',
    'esac',
    // A tmux pane's own server, socket and pane id; only a lookup hint for the host's attachment check.
    'markov_tmux_pane=',
    'case "${TMUX_PANE:-}" in %[0-9]*) [ -z "${TMUX:-}" ] || markov_tmux_pane="$TMUX_PANE ${TMUX%,*,*}" ;; esac'
  ]
}
