import { getPosixOmpShellWrapper } from '../../pty/shell-startup/omp-shell-wrapper'
import { MARKOV_CLI_POSIX_PATH_RESTORE } from '../../../shared/markov-cli-shell-path'
import { MANAGED_DATA_ACCOUNT_POSIX_RESTORE } from '../../../shared/managed-data-account-shell'
import { getPosixCodexShellLaunchPreflight } from '../../../shared/codex-shell-function'
import { getPosixClaudeShellFunction } from '../../../shared/claude-shell-function'
import { BASH_PROMPT_COMMAND_COMPOSITION_BLOCK } from '../../pty/shell-startup/bash-prompt-command-composition'
import {
  BASH_FEATURE_CHANNEL_BLOCK,
  SHELL_STARTUP_IDENTITY_MARKER_BLOCK
} from '../../pty/shell-startup/shell-templates'

export function getDaemonBashShellReadyRcfileContent(): string {
  return `# Markov daemon bash shell-ready wrapper
${BASH_FEATURE_CHANNEL_BLOCK}
${SHELL_STARTUP_IDENTITY_MARKER_BLOCK}
# Consume the feature channel before profiles so child processes cannot inherit the selection.
__markov_ready_marker=""
__markov_has_feature ready && __markov_ready_marker=1
unset _markov_shell_features
unset -f __markov_has_feature
# A system bashrc may already run ble.sh; it never exports this state, so exported copies are inherited.
for __markov_ble_var in _ble_attached _ble_decode_bind_state; do
  [[ -n "\${!__markov_ble_var+set}" ]] || continue
  case "$(declare -p "$__markov_ble_var" 2>/dev/null)" in "declare -x"*) unset "$__markov_ble_var" ;; esac
done
unset __markov_ble_var
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Force bracketed paste on older readline so multiline startup prompts remain one literal paste.
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
__markov_restore_agent_teams_path() {
  [[ -n "\${MARKOV_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${MARKOV_AGENT_TEAMS_SHIM_DIR}"|"\${MARKOV_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${MARKOV_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__markov_restore_agent_teams_path
${MARKOV_CLI_POSIX_PATH_RESTORE}
# Restore the managed OpenCode config after user profiles may have replaced it.
[[ -n "\${MARKOV_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${MARKOV_OPENCODE_CONFIG_DIR}"
${MANAGED_DATA_ACCOUNT_POSIX_RESTORE}
[[ -n "\${MARKOV_MIMOCODE_CONFIG_DIR:-}" ]] && export MIMOCODE_CONFIG_DIR="\${MARKOV_MIMOCODE_CONFIG_DIR}"
${getPosixOmpShellWrapper()}
# Preserve the managed CODEX_HOME after user profiles.
[[ -n "\${MARKOV_CODEX_HOME:-}" ]] && export CODEX_HOME="\${MARKOV_CODEX_HOME}"
${getPosixCodexShellLaunchPreflight() + getPosixClaudeShellFunction()}
# OSC 133 C/D clears stale agent status when a CLI exits without a stop hook.
__markov_initializing_wrapper=1
__markov_osc133_precmd() {
  local exit_code=$?
  __markov_in_prompt_command=1
  if [[ -n "\${__markov_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __markov_in_command
  fi
  printf "\\033]133;A\\007"
  return "$exit_code"
}
__markov_osc133_preexec() {
  if [[ -n "\${__markov_prompt_status_capture_command:-}" && "$BASH_COMMAND" == "$__markov_prompt_status_capture_command" ]]; then
    unset __markov_initial_prompt
    __markov_in_legacy_prompt_wrapper=1
    return 0
  fi
  if [[ -n "\${__markov_initializing_wrapper:-}\${__markov_in_debug_capture:-}\${__markov_initial_prompt:-}\${__markov_in_prompt_dispatch:-}\${__markov_in_legacy_prompt_wrapper:-}\${__markov_in_prompt_command:-}" ]]; then
    [[ -z "\${__markov_initializing_wrapper:-}\${__markov_in_debug_capture:-}" ]] || return 0
    if [[ -n "\${__markov_initial_prompt:-}" && "$BASH_COMMAND" == "__markov_osc133_precmd" ]]; then
      unset __markov_initial_prompt; return 0
    fi
    if [[ -n "\${__markov_in_prompt_dispatch:-}" ]]; then
      [[ -n "\${__markov_dispatching_user_prompt_command:-}" ]] || return 0
      if [[ "\${FUNCNAME[1]:-}" == "__markov_run_prompt_command_array" ]]; then
        case "$BASH_COMMAND" in
          '(( __markov_exit_code == 0 ))'|'__markov_restore_prompt_status "$__markov_exit_code"'|'eval "$__markov_prompt_part"'|'eval "$__markov_final_prompt_command"'|__markov_dispatching_user_prompt_command=*|__markov_osc133_precmd|__markov_osc133_epilogue) return 0 ;;
        esac
      fi
    elif [[ "\${FUNCNAME[1]:-}" == "__markov_run_prompt_command_array" || "$BASH_COMMAND" == "__markov_run_prompt_command_array" ]]; then
      return 0
    fi
    [[ -z "\${__markov_in_legacy_prompt_wrapper:-}" || -n "\${__markov_dispatching_user_prompt_command:-}" ]] || return 0
    if [[ -n "\${__markov_in_prompt_command:-}" && "$BASH_COMMAND" == "__markov_in_debug_capture=1" ]]; then
      return 0
    fi
  fi
  case "\${FUNCNAME[1]:-}" in
    __markov_osc133_*|__markov_restore_prompt_status|__bp_*) return 0 ;;
  esac
  case "$BASH_COMMAND" in
    __markov_osc133_precmd|__markov_osc133_epilogue) return 0 ;;
    # The prefix is only special while bash-preexec prompt hooks run.
    __bp_*) [[ -n "\${__markov_in_prompt_command:-}" ]] && return 0 ;;
  esac
  __markov_run_user_debug_trap
  # Chain the framework trap captured before each prompt's lifecycle re-arm.
  if [[ -n "\${__markov_chained_debug_trap:-}" ]]; then
    eval "$__markov_chained_debug_trap" || true
  fi
  [[ -z "\${__markov_in_prompt_command:-}" ]] || return 0
  # Emit C once per foreground command, excluding prompt hooks and repeated chained-trap calls.
  [[ -z "\${__markov_in_command:-}" ]] || return 0
  printf "\\033]133;C\\007"
  __markov_in_command=1
}
# Adopt the latest user trap before reclaiming lifecycle ownership.
__markov_osc133_epilogue() {
  unset __markov_in_prompt_command
  __markov_adopt_outer_debug_trap
  trap '__markov_osc133_preexec' DEBUG
  # Readline renders PS1 after entering raw mode; prompt hooks still run in cooked mode.
  if [[ -n "$__markov_ready_marker" ]]; then
    # Attached ble.sh (0.3+) discards Bash's own prompt output and owns the TTY, so print directly.
    if [[ -n "\${_ble_attached-}" ]]; then
      # Its first render runs this before the key decoder attaches; wait for a later prompt.
      if [[ "\${_ble_decode_bind_state:-none}" != none ]]; then
        printf "\\033]777;markov-shell-ready\\007"
        __markov_ready_marker=""
      fi
    else
      PS1="\${PS1-}"'\\[\\e]777;markov-shell-ready\\a\\]'
      __markov_ready_marker=""
    fi
  fi
}
${BASH_PROMPT_COMMAND_COMPOSITION_BLOCK}
__markov_prepend_prompt_command "__markov_osc133_precmd"
__markov_append_prompt_command '__markov_in_debug_capture=1; __markov_prompt_had_functrace=""; if [[ -o functrace ]]; then __markov_prompt_had_functrace=1; set +T; fi; __markov_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__markov_prompt_had_functrace" ]] || set -T; unset __markov_prompt_had_functrace __markov_in_debug_capture'
__markov_append_prompt_command "__markov_osc133_epilogue"
__markov_had_functrace=""
[[ -o functrace ]] && __markov_had_functrace=1
set +T
__markov_debug_trap_spec="$(trap -p DEBUG)"
[[ -z "$__markov_had_functrace" ]] || set -T
if [[ -n "$__markov_debug_trap_spec" && "$__markov_debug_trap_spec" != "trap -- '__markov_osc133_preexec' DEBUG" ]]; then
  __markov_debug_trap_command="\${__markov_debug_trap_spec#trap -- }"
  __markov_debug_trap_command="\${__markov_debug_trap_command% DEBUG}"
  eval "__markov_user_debug_trap=$__markov_debug_trap_command"
fi
unset __markov_debug_trap_spec __markov_debug_trap_command __markov_had_functrace
unset -f __markov_normalize_prompt_command_part __markov_normalize_prompt_command __markov_prepend_prompt_command __markov_append_prompt_command
unset __markov_prompt_command_normalized
# Arm DEBUG after setup so rcfile commands cannot emit a fake lifecycle before the first prompt.
__markov_initial_prompt=1
trap '__markov_osc133_preexec' DEBUG
unset __markov_initializing_wrapper
`
}
