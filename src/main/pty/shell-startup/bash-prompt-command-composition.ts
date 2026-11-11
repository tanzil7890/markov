export const BASH_PROMPT_COMMAND_COMPOSITION_BLOCK = `__markov_normalize_prompt_command_part() {
  local __markov_value="$1" __markov_output_name="$2" __markov_character __markov_chunk
  local __markov_value_length=\${#1} __markov_suffix_length=0 __markov_backslash_length=0
  local __markov_output_length __markov_scan_start
  while (( __markov_value_length - __markov_suffix_length >= 1024 )); do
    __markov_scan_start=$(( __markov_value_length - __markov_suffix_length - 1024 ))
    __markov_chunk="\${__markov_value:__markov_scan_start:1024}"
    case "$__markov_chunk" in
      *[!$' \\t\\n;']*) break ;;
      *) __markov_suffix_length=$(( __markov_suffix_length + 1024 )) ;;
    esac
  done
  while (( __markov_suffix_length < __markov_value_length )); do
    __markov_character="\${__markov_value: -__markov_suffix_length - 1:1}"
    case "$__markov_character" in
      ' '|$'\\t'|$'\\n'|';') __markov_suffix_length=$(( __markov_suffix_length + 1 )) ;;
      *) break ;;
    esac
  done
  __markov_output_length=$(( \${#__markov_value} - __markov_suffix_length ))
  while (( __markov_output_length - __markov_backslash_length >= 1024 )); do
    __markov_scan_start=$(( __markov_output_length - __markov_backslash_length - 1024 ))
    __markov_chunk="\${__markov_value:__markov_scan_start:1024}"
    case "$__markov_chunk" in
      *[!\\\\]*) break ;;
      *) __markov_backslash_length=$(( __markov_backslash_length + 1024 )) ;;
    esac
  done
  while (( __markov_backslash_length < __markov_output_length )); do
    __markov_character="\${__markov_value:__markov_output_length - __markov_backslash_length - 1:1}"
    [[ "$__markov_character" == '\\' ]] || break
    __markov_backslash_length=$(( __markov_backslash_length + 1 ))
  done
  # Preserve the first separator when an odd backslash run escapes it.
  if (( __markov_suffix_length > 0 && __markov_backslash_length % 2 == 1 )); then
    __markov_suffix_length=$(( __markov_suffix_length - 1 ))
    __markov_backslash_length=0
  fi
  __markov_output_length=$(( \${#__markov_value} - __markov_suffix_length ))
  __markov_value="\${__markov_value:0:__markov_output_length}"
  # Bash 4.4-5.0 scalar prompt evaluation preserves an odd terminal backslash.
  if (( __markov_suffix_length == 0 && ((BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] == 0)) && __markov_backslash_length % 2 == 1 )); then
    __markov_value="$__markov_value\\\\"
  fi
  printf -v "$__markov_output_name" '%s' "$__markov_value"
}
__markov_restore_prompt_status() {
  return "$1"
}
__markov_update_user_debug_trap() {
  local __markov_debug_trap_spec="$1" __markov_unchanged_debug_trap_spec="$2"
  local __markov_debug_trap_command
  [[ "$__markov_debug_trap_spec" != "$__markov_unchanged_debug_trap_spec" ]] || return 0
  [[ "$__markov_debug_trap_spec" != "trap -- '__markov_osc133_preexec' DEBUG" ]] || return 0
  if [[ -z "$__markov_debug_trap_spec" ]]; then
    __markov_user_debug_trap=""
    unset __markov_chained_debug_trap
    return 0
  fi
  __markov_debug_trap_command="\${__markov_debug_trap_spec#trap -- }"
  __markov_debug_trap_command="\${__markov_debug_trap_command% DEBUG}"
  eval "__markov_user_debug_trap=$__markov_debug_trap_command"
  unset __markov_chained_debug_trap
}
__markov_run_user_debug_trap() {
  if [[ -n "\${__markov_user_debug_trap:-}" ]]; then
    eval "$__markov_user_debug_trap" || true
  fi
}
__markov_adopt_outer_debug_trap() {
  local __markov_debug_trap_spec="\${__markov_outer_debug_trap_spec:-}"
  unset __markov_outer_debug_trap_spec
  __markov_update_user_debug_trap "$__markov_debug_trap_spec" "trap -- '__markov_osc133_preexec' DEBUG"
}
__markov_run_prompt_command_array() {
  local __markov_exit_code="\${__markov_prompt_status:-$?}" __markov_prompt_part __markov_prompt_index __markov_user_count
  local __markov_suffix_part
  local __markov_final_prompt_command
  local __markov_in_prompt_dispatch=1 __markov_dispatching_user_prompt_command=""
  unset __markov_prompt_status
  __markov_adopt_outer_debug_trap
  trap '__markov_osc133_preexec' DEBUG
  for __markov_prompt_part in "\${__markov_prompt_command_prefix[@]+"\${__markov_prompt_command_prefix[@]}"}"; do
    if (( __markov_exit_code == 0 )); then
      eval "$__markov_prompt_part"
    else
      __markov_restore_prompt_status "$__markov_exit_code" || eval "$__markov_prompt_part"
    fi
  done
  __markov_user_count=0
  for __markov_prompt_part in "\${__markov_prompt_command_array[@]+"\${__markov_prompt_command_array[@]}"}"; do
    __markov_user_count=$(( __markov_user_count + 1 ))
  done
  for (( __markov_prompt_index = 0; __markov_prompt_index + 1 < __markov_user_count; __markov_prompt_index++ )); do
    __markov_prompt_part="\${__markov_prompt_command_array[__markov_prompt_index]}"
    __markov_dispatching_user_prompt_command=1
    if (( __markov_exit_code == 0 )); then
      eval "$__markov_prompt_part"
    else
      __markov_restore_prompt_status "$__markov_exit_code" || eval "$__markov_prompt_part"
    fi
    __markov_dispatching_user_prompt_command=""
  done
  if (( __markov_user_count > 0 )); then
    __markov_prompt_part="\${__markov_prompt_command_array[__markov_user_count - 1]}"
    # Why: keep the final user hook and Markov suffixes in one status-preserving eval.
    __markov_final_prompt_command='eval "$__markov_prompt_part"'
    for __markov_suffix_part in "\${__markov_prompt_command_suffix[@]+"\${__markov_prompt_command_suffix[@]}"}"; do
      __markov_final_prompt_command+=$'\\n'"$__markov_suffix_part"
    done
    __markov_dispatching_user_prompt_command=1
    if (( __markov_exit_code == 0 )); then
      eval "$__markov_final_prompt_command"
    else
      __markov_restore_prompt_status "$__markov_exit_code" || eval "$__markov_final_prompt_command"
    fi
    __markov_dispatching_user_prompt_command=""
  else
    for __markov_prompt_part in "\${__markov_prompt_command_suffix[@]+"\${__markov_prompt_command_suffix[@]}"}"; do
      if (( __markov_exit_code == 0 )); then
        eval "$__markov_prompt_part"
      else
        __markov_restore_prompt_status "$__markov_exit_code" || eval "$__markov_prompt_part"
      fi
    done
  fi
  return "$__markov_exit_code"
}
__markov_finish_legacy_prompt_dispatch() {
  local __markov_suffix_part
  if [[ -n "\${__markov_in_prompt_command:-}" ]]; then
    for __markov_suffix_part in "\${__markov_prompt_command_suffix[@]+"\${__markov_prompt_command_suffix[@]}"}"; do
      eval "$__markov_suffix_part"
    done
  fi
}
__markov_normalize_prompt_command() {
  [[ -z "\${__markov_prompt_command_normalized:-}" ]] || return 0
  local __markov_prompt_part
  local -a __markov_normalized=()
  for __markov_prompt_part in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
    __markov_normalize_prompt_command_part "$__markov_prompt_part" __markov_prompt_part
    [[ -n "$__markov_prompt_part" ]] && __markov_normalized+=("$__markov_prompt_part")
  done
  __markov_prompt_command_normalized=1
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("\${__markov_normalized[@]+"\${__markov_normalized[@]}"}")
  else
    __markov_prompt_command_array=("\${__markov_normalized[@]+"\${__markov_normalized[@]}"}")
    __markov_prompt_command_prefix=()
    __markov_prompt_command_suffix=()
    unset PROMPT_COMMAND
    # Why: PID scope distinguishes legacy prompt dispatch from ordinary user command text.
    __markov_prompt_status_variable="__markov_prompt_status_$$"
    __markov_prompt_status_capture_command="$__markov_prompt_status_variable=\\$?"
    __markov_prompt_status_value="\\\${$__markov_prompt_status_variable}"
    # Why: a changed DEBUG trap misses the capture command, and bash <= 4.3 reverts traps set in functions.
    PROMPT_COMMAND="$__markov_prompt_status_capture_command; __markov_in_legacy_prompt_wrapper=1; __markov_prompt_status=$__markov_prompt_status_value"'; __markov_prompt_had_functrace=""; if [[ -o functrace ]]; then __markov_prompt_had_functrace=1; set +T; fi; __markov_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__markov_prompt_had_functrace" ]] || set -T; unset __markov_prompt_had_functrace; __markov_run_prompt_command_array; __markov_finish_legacy_prompt_dispatch; trap __markov_osc133_preexec DEBUG; unset __markov_in_legacy_prompt_wrapper'
  fi
}
__markov_prepend_prompt_command() {
  local command="$1"
  __markov_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("$command" "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}")
  else
    __markov_prompt_command_prefix=("$command" "\${__markov_prompt_command_prefix[@]+"\${__markov_prompt_command_prefix[@]}"}")
  fi
}
__markov_append_prompt_command() {
  local command="$1"
  __markov_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND+=("$command")
  else
    __markov_prompt_command_suffix+=("$command")
  fi
}`
