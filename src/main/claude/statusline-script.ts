import {
  WINDOWS_CLAUDE_BACKGROUND_JOB_GUARD,
  buildPosixClaudeBackgroundJobGuardLines
} from '../agent-hooks/claude-background-job-guard'
import { posixCurlCommand } from '../agent-hooks/hook-post-command'
import { WINDOWS_HOOK_STDIN_READER } from '../agent-hooks/hook-stdin-contract'
import {
  CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS,
  CLAUDE_STATUSLINE_PATHNAME
} from '../../shared/claude-statusline-rate-limits'
import { wrapWindowsDirectCmdHookCommand } from '../agent-hooks/windows-direct-cmd-hook-command'
import { getManagedCommand } from './hook-settings'

const STATUSLINE_CLEANUP_LABEL = 'markov_statusline_cleanup'
const STATUSLINE_PROBE_LABEL = 'markov_statusline_probe'

// PowerShell needs a bare safe path; unsafe paths keep runtime HOME to avoid per-tick PowerShell spawns.
export function getManagedStatusLineCommand(scriptPath: string): string {
  return (
    (process.platform === 'win32' ? wrapWindowsDirectCmdHookCommand(scriptPath) : null) ??
    getManagedCommand(scriptPath)
  )
}

// Forward live usage without OAuth polling; emit no stdout to preserve the terminal statusline.
export function getManagedStatusLineScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      WINDOWS_CLAUDE_BACKGROUND_JOB_GUARD,
      // Endpoint refresh never sets the pane key, so this guard can precede stdin capture.
      'if "%MARKOV_PANE_KEY%"=="" exit /b 0',
      // UUID suffixes and sanitized legacy delimiters keep filenames safe.
      'set "MARKOV_STATUSLINE_PANE_ID=%MARKOV_PANE_KEY:~-36%"',
      'set "MARKOV_STATUSLINE_PANE_ID=%MARKOV_STATUSLINE_PANE_ID::=_%"',
      // Buffer before spawning curl; per-pane names avoid same-second %RANDOM% collisions.
      'set "MARKOV_STATUSLINE_PAYLOAD_FILE=%TEMP%\\markov-claude-statusline-%MARKOV_STATUSLINE_PANE_ID%.tmp"',
      `${WINDOWS_HOOK_STDIN_READER} >"%MARKOV_STATUSLINE_PAYLOAD_FILE%" 2>nul`,
      // Builtin throttling avoids findstr and curl spawns on streaming ticks.
      'set "MARKOV_STATUSLINE_STAMP_FILE=%TEMP%\\markov-claude-statusline-last-%MARKOV_STATUSLINE_PANE_ID%.tmp"',
      'set "MARKOV_STATUSLINE_NOW="',
      'set "MARKOV_STATUSLINE_TIME=%TIME: =0%"',
      'for /f "tokens=1-3 delims=:.," %%a in ("%MARKOV_STATUSLINE_TIME%") do set /a "MARKOV_STATUSLINE_NOW=(1%%a %% 100)*3600+(1%%b %% 100)*60+(1%%c %% 100)" 2>nul',
      'set "MARKOV_STATUSLINE_LAST="',
      'set "MARKOV_STATUSLINE_ELAPSED="',
      'if exist "%MARKOV_STATUSLINE_STAMP_FILE%" set /p MARKOV_STATUSLINE_LAST=<"%MARKOV_STATUSLINE_STAMP_FILE%"',
      'if defined MARKOV_STATUSLINE_LAST for /f "delims=0123456789" %%d in ("%MARKOV_STATUSLINE_LAST%") do set "MARKOV_STATUSLINE_LAST="',
      'if defined MARKOV_STATUSLINE_NOW if defined MARKOV_STATUSLINE_LAST set /a "MARKOV_STATUSLINE_ELAPSED=MARKOV_STATUSLINE_NOW-MARKOV_STATUSLINE_LAST" 2>nul',
      `if not defined MARKOV_STATUSLINE_ELAPSED goto :${STATUSLINE_PROBE_LABEL}`,
      `if %MARKOV_STATUSLINE_ELAPSED% GEQ 0 if %MARKOV_STATUSLINE_ELAPSED% LSS ${CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS} goto :${STATUSLINE_CLEANUP_LABEL}`,
      `:${STATUSLINE_PROBE_LABEL}`,
      // Non-subscriber payloads lack rate_limits; skip their endpoint lookup and curl spawn.
      // Escaped quotes match the JSON key, avoiding false matches in paths.
      '"%SystemRoot%\\System32\\findstr.exe" /c:\\"rate_limits\\" "%MARKOV_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul',
      `if errorlevel 1 goto :${STATUSLINE_CLEANUP_LABEL}`,
      // Refresh stale endpoint coordinates after Markov restarts, falling back to PTY env.
      'if defined MARKOV_AGENT_HOOK_ENDPOINT if exist "%MARKOV_AGENT_HOOK_ENDPOINT%" call "%MARKOV_AGENT_HOOK_ENDPOINT%" 2>nul',
      `if "%MARKOV_AGENT_HOOK_PORT%"=="" goto :${STATUSLINE_CLEANUP_LABEL}`,
      `if "%MARKOV_AGENT_HOOK_TOKEN%"=="" goto :${STATUSLINE_CLEANUP_LABEL}`,
      // Stamp only eligible posts so skipped ticks never postpone the next post.
      'if defined MARKOV_STATUSLINE_NOW (>"%MARKOV_STATUSLINE_STAMP_FILE%" echo %MARKOV_STATUSLINE_NOW%)',
      // An always-defined field posts empty configDir when unset, rather than a literal %VAR%.
      'set "MARKOV_STATUSLINE_CONFIG_DIR_FIELD=configDir="',
      'if defined CLAUDE_CONFIG_DIR set "MARKOV_STATUSLINE_CONFIG_DIR_FIELD=configDir=%CLAUDE_CONFIG_DIR%"',
      [
        '"%SystemRoot%\\System32\\curl.exe" -sS -X POST',
        `"http://127.0.0.1:%MARKOV_AGENT_HOOK_PORT%${CLAUDE_STATUSLINE_PATHNAME}"`,
        '--connect-timeout 0.5 --max-time 1.5',
        '-H "Content-Type: application/x-www-form-urlencoded"',
        '-H "X-Markov-Agent-Hook-Token: %MARKOV_AGENT_HOOK_TOKEN%"',
        '--data-urlencode "paneKey=%MARKOV_PANE_KEY%"',
        '--data-urlencode "%MARKOV_STATUSLINE_CONFIG_DIR_FIELD%"',
        '--data-urlencode "env=%MARKOV_AGENT_HOOK_ENV%"',
        '--data-urlencode "version=%MARKOV_AGENT_HOOK_VERSION%"',
        '--data-urlencode "payload@%MARKOV_STATUSLINE_PAYLOAD_FILE%"',
        '>nul 2>&1'
      ].join(' '),
      `:${STATUSLINE_CLEANUP_LABEL}`,
      'del "%MARKOV_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    // Builtin capture avoids per-tick cat spawns.
    'payload=',
    'while IFS= read -r markov_statusline_line || [ -n "$markov_statusline_line" ]; do',
    '  payload="${payload}${markov_statusline_line}\n"',
    'done',
    'payload=${payload%?}',
    'if [ -z "$payload" ]; then',
    '  exit 0',
    'fi',
    ...buildPosixClaudeBackgroundJobGuardLines(),
    // Non-subscriber payloads lack rate_limits; avoid spawning curl for them.
    'case "$payload" in',
    '  *\'"rate_limits"\'*) ;;',
    '  *) exit 0 ;;',
    'esac',
    'if [ -n "$MARKOV_AGENT_HOOK_ENDPOINT" ] && [ -r "$MARKOV_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$MARKOV_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$MARKOV_AGENT_HOOK_PORT" ] || [ -z "$MARKOV_AGENT_HOOK_TOKEN" ] || [ -z "$MARKOV_PANE_KEY" ]; then',
    '  exit 0',
    'fi',
    // The stable leaf UUID excludes path-unsafe and overlong tab IDs.
    'markov_statusline_pane_id=${MARKOV_PANE_KEY##*:}',
    // Legacy numeric leaf IDs were tab-local; include a safe tab ID to isolate their stamps.
    'case "$markov_statusline_pane_id" in',
    "  ''|*[!0-9]*) ;;",
    '  *)',
    '    markov_statusline_tab_id=${MARKOV_PANE_KEY%:*}',
    '    case "$markov_statusline_tab_id" in',
    "      ''|*[!A-Za-z0-9._-]*) ;;",
    '      *) markov_statusline_pane_id="${markov_statusline_tab_id}_${markov_statusline_pane_id}" ;;',
    '    esac',
    '    ;;',
    'esac',
    'markov_statusline_stamp="${TMPDIR:-/tmp}/markov-claude-statusline-last-${markov_statusline_pane_id}"',
    // Use the payload clock to avoid per-tick date spawns; fall back if the schema changes.
    'markov_statusline_now=',
    'case "$payload" in',
    '  *\'"total_duration_ms"\'*)',
    '    markov_statusline_duration=${payload#*\'"total_duration_ms"\'}',
    '    markov_statusline_duration=${markov_statusline_duration#*:}',
    '    markov_statusline_duration=${markov_statusline_duration#"${markov_statusline_duration%%[![:space:]]*}"}',
    '    markov_statusline_duration=${markov_statusline_duration%%[!0-9]*}',
    '    case "$markov_statusline_duration" in',
    '      0|[1-9]|[1-9][0-9]*)',
    '        if [ "${#markov_statusline_duration}" -le 15 ]; then',
    '          markov_statusline_now=$((markov_statusline_duration / 1000))',
    '        fi',
    '        ;;',
    '    esac',
    '    ;;',
    'esac',
    'if [ -z "$markov_statusline_now" ]; then',
    '  markov_statusline_now=$(date +%s 2>/dev/null) || markov_statusline_now=',
    'fi',
    // Canonical decimals avoid fatal dash octal errors (008); malformed stamps must fail open.
    'case "$markov_statusline_now" in 0|[1-9]|[1-9][0-9]*) ;; *) markov_statusline_now= ;; esac',
    'if [ -n "$markov_statusline_now" ] && [ -f "$markov_statusline_stamp" ]; then',
    '  markov_statusline_last=',
    '  IFS= read -r markov_statusline_last <"$markov_statusline_stamp" 2>/dev/null || :',
    '  case "$markov_statusline_last" in 0|[1-9]|[1-9][0-9]*) ;; *) markov_statusline_last= ;; esac',
    '  if [ "${#markov_statusline_last}" -gt 15 ]; then markov_statusline_last=; fi',
    '  if [ -n "$markov_statusline_last" ]; then',
    '    markov_statusline_elapsed=$((markov_statusline_now - markov_statusline_last))',
    `    if [ "$markov_statusline_elapsed" -ge 0 ] && [ "$markov_statusline_elapsed" -lt ${CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS} ]; then`,
    '      exit 0',
    '    fi',
    '  fi',
    'fi',
    'if [ -n "$markov_statusline_now" ]; then',
    '  printf \'%s\' "$markov_statusline_now" >"$markov_statusline_stamp" 2>/dev/null || :',
    'fi',
    `printf '%s' "$payload" | ${posixCurlCommand()} -sS -X POST "http://127.0.0.1:\${MARKOV_AGENT_HOOK_PORT}${CLAUDE_STATUSLINE_PATHNAME}" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Markov-Agent-Hook-Token: ${MARKOV_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${MARKOV_PANE_KEY}" \\',
    '  --data-urlencode "configDir=${CLAUDE_CONFIG_DIR}" \\',
    '  --data-urlencode "env=${MARKOV_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${MARKOV_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || true',
    'exit 0',
    ''
  ].join('\n')
}
