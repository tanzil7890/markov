import { basename, win32 as pathWin32 } from 'node:path'

export const POSIX_SHELL_STARTUP_COMMAND_ENV = 'MARKOV_POSIX_SHELL_STARTUP_COMMAND'

export function supportsPosixShellStartupCommand(shellPath: string): boolean {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()
  return shellName === 'bash' || shellName === 'zsh' || shellName === 'fish'
}

export function getBashStartupCommandPromptBlock(): string {
  return `if [[ \${${POSIX_SHELL_STARTUP_COMMAND_ENV}+present} == present ]]; then
  __markov_remove_startup_command_prompt_hook() {
    local __markov_item
    local -a __markov_remaining=()
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
      for __markov_item in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
        [[ "$__markov_item" == "__markov_run_startup_command" ]] || __markov_remaining+=("$__markov_item")
      done
      PROMPT_COMMAND=("\${__markov_remaining[@]+"\${__markov_remaining[@]}"}")
    else
      for __markov_item in "\${__markov_prompt_command_suffix[@]+"\${__markov_prompt_command_suffix[@]}"}"; do
        [[ "$__markov_item" == "__markov_run_startup_command" ]] || __markov_remaining+=("$__markov_item")
      done
      __markov_prompt_command_suffix=("\${__markov_remaining[@]+"\${__markov_remaining[@]}"}")
    fi
  }
  __markov_run_startup_command() {
    local __markov_command="$${POSIX_SHELL_STARTUP_COMMAND_ENV}" __markov_status
    unset ${POSIX_SHELL_STARTUP_COMMAND_ENV}
    __markov_remove_startup_command_prompt_hook
    unset -f __markov_remove_startup_command_prompt_hook
    builtin history -s "$__markov_command" 2>/dev/null || true
    builtin printf '%s\n' "$__markov_command"
    eval "$__markov_command"
    __markov_status=$?
    unset -f __markov_run_startup_command
    return "$__markov_status"
  }
  __markov_append_prompt_command "__markov_run_startup_command"
fi`
}
