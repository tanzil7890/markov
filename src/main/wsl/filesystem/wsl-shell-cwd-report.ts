/**
 * A WSL bridge shell reports its folder at each prompt (OSC 7), so the terminal daemon's emulator,
 * and every checkpoint, follows `cd` without a guest probe. Bridge bash and zsh send none
 * themselves. Only inside WSL. The path is encoded only when it changes, and re-sent every
 * prompt so a foreign report (an ssh session that set its own) cannot stick. Bytes outside the
 * URI's unreserved set are percent-encoded as UTF-8, masked for bash 3.2's signed chars.
 */
export const BASH_WSL_CWD_REPORT_BLOCK = `__markov_wsl_cwd_report() {
  [[ -n "\${WSL_DISTRO_NAME:-}" ]] || return 0
  if [[ "$PWD" != "\${__markov_wsl_cwd_reported-}" ]]; then
    __markov_wsl_cwd_reported=$PWD
    local LC_ALL=C __markov_e= __markov_c __markov_i
    for (( __markov_i = 0; __markov_i < \${#PWD}; __markov_i++ )); do
      __markov_c=\${PWD:__markov_i:1}
      case $__markov_c in
        [A-Za-z0-9/._~-]) __markov_e+=$__markov_c ;;
        *) printf -v __markov_c '%d' "'$__markov_c"; printf -v __markov_c '%%%02X' $(( __markov_c & 255 )); __markov_e+=$__markov_c ;;
      esac
    done
    __markov_wsl_cwd_encoded=$__markov_e
  fi
  printf '\\033]7;file://%s\\007' "\${__markov_wsl_cwd_encoded-}"
}`

export const ZSH_WSL_CWD_REPORT_BLOCK = `__markov_wsl_cwd_report() {
  builtin emulate -L zsh
  builtin setopt no_multibyte
  [[ -n \${WSL_DISTRO_NAME:-} ]] || return 0
  if [[ $PWD != \${__markov_wsl_cwd_reported-} ]]; then
    builtin typeset -g __markov_wsl_cwd_reported=$PWD
    local __markov_e= __markov_c __markov_i
    for (( __markov_i = 1; __markov_i <= $#PWD; __markov_i++ )); do
      __markov_c=$PWD[__markov_i]
      case $__markov_c in
        ([A-Za-z0-9/._~-]) __markov_e+=$__markov_c ;;
        (*) builtin printf -v __markov_c '%d' "'$__markov_c"; builtin printf -v __markov_c '%%%02X' $(( __markov_c & 255 )); __markov_e+=$__markov_c ;;
      esac
    done
    builtin typeset -g __markov_wsl_cwd_encoded=$__markov_e
  fi
  builtin printf '\\033]7;file://%s\\007' "\${__markov_wsl_cwd_encoded-}"
}`

/**
 * A WSL bridge sh/dash/ash pane's ENV file (read once, by interactive shells only, after the login
 * profile). It first hands ENV back to the user's own value, so children see theirs, and sources it.
 * Then, inside WSL, it prefixes PS1 with the folder report; dash has no prompt hook, so the report
 * runs in a command substitution and re-encodes $PWD byte by byte every prompt. bash and busybox
 * ash (fancy prompt, on in Alpine's and Debian's builds) get it inside \\[ \\] so the invisible bytes
 * do not count toward the prompt's width; dash has no line editor to miscount, and would print \\[.
 */
export const SH_WSL_ENV_FILE = `# Markov WSL bridge sh ENV: restore the user's ENV, then report the folder (OSC 7) at each prompt.
if [ -n "\${MARKOV_WSL_USER_ENV:-}" ]; then
  ENV=$MARKOV_WSL_USER_ENV
  unset MARKOV_WSL_USER_ENV
  # The shell expands ENV's value before reading it; a here-document does the same without
  # parsing the user's quotes as shell syntax.
  eval "IFS= read -r __markov_user_env <<__MARKOV_USER_ENV_EOF
$ENV
__MARKOV_USER_ENV_EOF
"
  if [ -r "$__markov_user_env" ]; then
    . "$__markov_user_env"
  fi
  unset __markov_user_env
else
  unset ENV MARKOV_WSL_USER_ENV
fi
if [ -n "\${WSL_DISTRO_NAME:-}" ]; then
  __markov_wsl_cwd_report() {
    LC_ALL=C
    __markov_p=$PWD
    __markov_e=
    while [ -n "$__markov_p" ]; do
      __markov_r=\${__markov_p#?}
      __markov_c=\${__markov_p%"$__markov_r"}
      __markov_p=$__markov_r
      case $__markov_c in
        [A-Za-z0-9/._~-]) __markov_e=$__markov_e$__markov_c ;;
        *) __markov_e=$__markov_e$(printf '%%%02X' $(( $(printf '%d' "'$__markov_c") & 255 ))) ;;
      esac
    done
    printf '\\033]7;file://%s\\007' "$__markov_e"
  }
  case $PS1 in
    *__markov_wsl_cwd_report*) ;;
    *)
      if [ -n "\${BASH_VERSION:-}" ] || [ -n "\${BB_ASH_VERSION:-}" ]; then
        PS1='\\[$(__markov_wsl_cwd_report)\\]'"$PS1"
      else
        PS1='$(__markov_wsl_cwd_report)'"$PS1"
      fi
      ;;
  esac
fi
`
