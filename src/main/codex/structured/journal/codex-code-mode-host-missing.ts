const MISSING_HOST = /failed to spawn code-mode host (.+?): host executable was not found/

/** Codex's warning that its command helper is absent, said as what it costs the user. Null for any other text. */
export function codexCodeModeHostMissingWords(message: string | null): string | null {
  const host = message ? MISSING_HOST.exec(message)?.[1] : undefined
  return host
    ? `Codex cannot run commands on this computer: its helper program is missing at ${host}. ` +
        'Reinstall Codex from its official package (for example `npm install -g @openai/codex`) so the helper is installed next to `codex`. ' +
        'Until then Codex may turn to other tools, such as Computer Use, to read your project.'
    : null
}
