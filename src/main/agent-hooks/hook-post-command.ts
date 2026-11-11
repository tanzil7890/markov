import type { AgentHookSource } from '../../shared/agent-hook-listener/transport/agent-hook-relay'
import { MARKOV_HOOK_RAW_JSON_TRANSPORT } from '../../shared/agent-hook-listener/configuration/agent-hook-types'
import { AGENT_HOOK_METADATA_CACHE_DIR } from '../../shared/agent-hook-listener/transport/agent-hook-spool'

// Older curl needs C numeric parsing; keep the parent script's UTF-8 locale unchanged.
export function posixCurlCommand(curlCommand = 'curl'): string {
  return `LC_ALL= LC_NUMERIC=C ${curlCommand}`
}

const PACK_HOOK_METADATA = `printf '%s\\037%s\\037%s\\037%s\\037%s\\037%s' "$MARKOV_PANE_KEY" "$MARKOV_TAB_ID" "$MARKOV_AGENT_LAUNCH_TOKEN" "$MARKOV_WORKTREE_ID" "$MARKOV_AGENT_HOOK_ENV" "$MARKOV_AGENT_HOOK_VERSION" | base64 | tr -d '\\n'`

/** Defines `markov_hook_pack_metadata`, which reuses a pane's packed header while every input matches. */
export function buildPosixHookMetadataCacheLines(): string[] {
  return [
    'markov_hook_pack_metadata() {',
    // Length prefixes keep different inputs from forming the same key.
    '  markov_hook_meta_key="${#MARKOV_PANE_KEY}:$MARKOV_PANE_KEY ${#MARKOV_TAB_ID}:$MARKOV_TAB_ID ${#MARKOV_AGENT_LAUNCH_TOKEN}:$MARKOV_AGENT_LAUNCH_TOKEN ${#MARKOV_WORKTREE_ID}:$MARKOV_WORKTREE_ID ${#MARKOV_AGENT_HOOK_ENV}:$MARKOV_AGENT_HOOK_ENV ${#MARKOV_AGENT_HOOK_VERSION}:$MARKOV_AGENT_HOOK_VERSION"',
    '  markov_hook_meta_file=',
    // A stale variable must not create state for an absent Markov installation.
    '  if [ -r "${MARKOV_AGENT_HOOK_ENDPOINT:-}" ]; then',
    '    markov_hook_meta_id=$MARKOV_PANE_KEY',
    // Name it like the spool file, which may sit on a Windows drive under WSL.
    '    while :; do case "$markov_hook_meta_id" in *[/:]*) markov_hook_meta_id="${markov_hook_meta_id%%[/:]*}_${markov_hook_meta_id#*[/:]}" ;; *) break ;; esac; done',
    `    markov_hook_meta_file="\${MARKOV_AGENT_HOOK_ENDPOINT%/*}/${AGENT_HOOK_METADATA_CACHE_DIR}/pane-$markov_hook_meta_id"`,
    '    markov_hook_meta_line=',
    '    IFS= read -r markov_hook_meta_line 2>/dev/null < "$markov_hook_meta_file"',
    '    markov_hook_metadata=${markov_hook_meta_line%% *}',
    '    [ -z "$markov_hook_metadata" ] || [ "${markov_hook_meta_line#* }" != "$markov_hook_meta_key" ] || return 0',
    '  fi',
    `  markov_hook_metadata=$(${PACK_HOOK_METADATA}) && [ -n "$markov_hook_metadata" ] || return 1`,
    '  [ -n "$markov_hook_meta_file" ] || return 0',
    '  [ -d "${markov_hook_meta_file%/*}" ] || mkdir -m 700 "${markov_hook_meta_file%/*}" 2>/dev/null || return 0',
    // Rename so a concurrent event never reads half a line.
    `  printf '%s %s\\n' "$markov_hook_metadata" "$markov_hook_meta_key" 2>/dev/null > "$markov_hook_meta_file.$$" && mv -f "$markov_hook_meta_file.$$" "$markov_hook_meta_file" 2>/dev/null`,
    '  return 0',
    '}'
  ]
}

type PosixAgentHookPostOptions = {
  curlCommand?: string
  indent?: string
  decisionHeaderVar?: string
  /** Take the header from `buildPosixHookMetadataCacheLines` instead of packing it every event. */
  cachedMetadata?: boolean
}

export function buildPosixAgentHookPostCommand(
  source: AgentHookSource,
  options: PosixAgentHookPostOptions = {}
): string[] {
  const curlCommand = posixCurlCommand(options.curlCommand ?? 'curl')
  const indent = options.indent ?? '  '
  // Only Claude's capture sets this; the host checks the attachment itself before trusting it.
  const tmux = source === 'claude'
  // Names the decision format the script prints; absent, Markov never waits on plugins.
  const decision = options.decisionHeaderVar
    ? [`  ${indent}-H "X-Markov-Hook-Decision: \${${options.decisionHeaderVar}:-}" \\`]
    : []
  const url = `"http://127.0.0.1:\${MARKOV_AGENT_HOOK_PORT}/hook/${source}"`
  const packMetadata = options.cachedMetadata
    ? ['  markov_hook_pack_metadata && \\']
    : [
        `  markov_hook_metadata=$(${PACK_HOOK_METADATA}) && \\`,
        '  [ -n "$markov_hook_metadata" ] && \\'
      ]
  return [
    `if [ "\${MARKOV_AGENT_HOOK_TRANSPORT:-}" = "${MARKOV_HOOK_RAW_JSON_TRANSPORT}" ] && command -v base64 >/dev/null 2>&1 && command -v tr >/dev/null 2>&1; then`,
    ...packMetadata,
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST ${url} \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/json" \\`,
    `  ${indent}-H "X-Markov-Agent-Hook-Token: \${MARKOV_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}-H "X-Markov-Agent-Hook-Meta-Encoding: base64" \\`,
    `  ${indent}-H "X-Markov-Agent-Hook-Meta: \${markov_hook_metadata}" \\`,
    `  ${indent}-H "X-Markov-Agent-Process: \${markov_agent_process:-}" \\`,
    ...(tmux ? [`  ${indent}-H "X-Markov-Tmux-Pane: \${markov_tmux_pane:-}" \\`] : []),
    ...decision,
    `  ${indent}--data-binary @-`,
    'else',
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST ${url} \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/x-www-form-urlencoded" \\`,
    `  ${indent}-H "X-Markov-Agent-Hook-Token: \${MARKOV_AGENT_HOOK_TOKEN}" \\`,
    ...decision,
    `  ${indent}--data-urlencode "paneKey=\${MARKOV_PANE_KEY}" \\`,
    `  ${indent}--data-urlencode "tabId=\${MARKOV_TAB_ID}" \\`,
    `  ${indent}--data-urlencode "launchToken=\${MARKOV_AGENT_LAUNCH_TOKEN}" \\`,
    `  ${indent}--data-urlencode "worktreeId=\${MARKOV_WORKTREE_ID}" \\`,
    `  ${indent}--data-urlencode "env=\${MARKOV_AGENT_HOOK_ENV}" \\`,
    `  ${indent}--data-urlencode "version=\${MARKOV_AGENT_HOOK_VERSION}" \\`,
    `  ${indent}--data-urlencode "agentProcess=\${markov_agent_process:-}" \\`,
    ...(tmux ? [`  ${indent}--data-urlencode "tmuxPane=\${markov_tmux_pane:-}" \\`] : []),
    `  ${indent}--data-urlencode "payload@-"`,
    'fi'
  ]
}
