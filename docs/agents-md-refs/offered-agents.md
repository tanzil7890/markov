# Offered agents

Markov supports 45 agent CLIs in code but offers only 9 of them in the app. The other 36 are
withheld: their launch config, hooks, status parsing, icons and translations are all still in the
tree, so bringing one back is a one-line change.

The source of truth is `TUI_AGENT_OFFERED` in
[`src/shared/agent-launch/catalog/offered-tui-agents.ts`](../../src/shared/agent-launch/catalog/offered-tui-agents.ts).
This page is the human-readable copy of that record; update both together.

## Restore or withhold an agent

1. In `offered-tui-agents.ts`, flip the agent's value (`false` → `true` to restore, `true` → `false`
   to withhold).
2. Move its row between the two tables below.
3. Run `pnpm tc` and `pnpm test:changed --maxWorkers=2`.

TypeScript requires every `TuiAgent` id to have an entry, so a newly added agent cannot be left
out of the record.

## Offered (9)

| Agent              | Id                   | CLI       |
| ------------------ | -------------------- | --------- |
| Claude             | `claude`             | `claude`  |
| Claude Agent Teams | `claude-agent-teams` | `claude`  |
| Codex              | `codex`              | `codex`   |
| GitHub Copilot     | `copilot`            | `copilot` |
| Grok               | `grok`               | `grok`    |
| Pi                 | `pi`                 | `pi`      |
| Gemini             | `gemini`             | `gemini`  |
| Devin              | `devin`              | `devin`   |
| DeepSeek Harness   | `dsh`                | `dsh-tui` |

## Withheld (36)

All withheld on 2026-11-11.

| Agent           | Id             | CLI                |
| --------------- | -------------- | ------------------ |
| Antigravity     | `antigravity`  | `agy`              |
| Continue        | `continue`     | `cn`               |
| OpenClaude      | `openclaude`   | `openclaude`       |
| OpenCode 2      | `opencode2`    | `opencode2`        |
| OpenCode        | `opencode`     | `opencode`         |
| MiMo Code       | `mimo-code`    | `mimo`             |
| Ante            | `ante`         | `ante`             |
| Trae            | `trae`         | `traecli`          |
| Muse            | `muse`         | `muse`             |
| Qoder CLI       | `qoder`        | `qodercli`         |
| Qoder CLI China | `qoder-cn`     | `qoderclicn`       |
| ZCode           | `zcode`        | `zcode`            |
| OMP             | `omp`          | `omp`              |
| Prime Agent     | `prime-agent`  | `prime-agent`      |
| Aider           | `aider`        | `aider`            |
| Goose           | `goose`        | `goose`            |
| Amp             | `amp`          | `amp`              |
| Kilocode        | `kilo`         | `kilo`             |
| Kiro            | `kiro`         | `kiro-cli`         |
| Charm           | `crush`        | `crush`            |
| Auggie          | `aug`          | `auggie`           |
| Autohand Code   | `autohand`     | `autohand`         |
| Cline           | `cline`        | `cline`            |
| Codebuff        | `codebuff`     | `codebuff`         |
| Freebuff        | `freebuff`     | `freebuff`         |
| Command Code    | `command-code` | `command-code`     |
| Cursor          | `cursor`       | `cursor-agent`     |
| Droid           | `droid`        | `droid`            |
| Kimi            | `kimi`         | `kimi`             |
| Mistral Vibe    | `mistral-vibe` | `vibe`             |
| Qwen Code       | `qwen-code`    | `qwen`             |
| Rovo Dev        | `rovo`         | `acli rovodev run` |
| Hermes          | `hermes`       | `hermes`           |
| OpenClaw        | `openclaw`     | `openclaw`         |
| CodeBuddy       | `codebuddy`    | `codebuddy`        |
| Jcode           | `jcode`        | `jcode`            |

## What withholding does

A withheld agent is:

- never probed during installed-agent detection, so it never appears as installed on any host;
- absent from Settings → Agents, onboarding, the new-tab menu, workspace and automation agent
  pickers, and the mobile agent list;
- never auto-picked, even when it is the saved default agent;
- without a "New … tab" shortcut in Settings → Shortcuts;
- without its section in Settings → Accounts (Antigravity, OpenCode, Cursor, ZCode);
- without its usage meter: none in the status bar, no entry in the status bar's show/hide menu, no
  toggle or search result in Settings → Appearance, and no background refresh, so sign-in found
  on the machine for it is never read or sent (OpenCode Go, Cursor, Kimi, ZCode, Antigravity).

Where each of those is enforced:

| Surface                                  | File                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Detection                                | `src/shared/agent-launch/catalog/tui-agent-detection-commands.ts`     |
| Pick order, auto-pick, mobile agent list | `src/shared/agent-launch/catalog/tui-agent-selection.ts`              |
| Desktop catalog (settings, pickers)      | `src/renderer/src/lib/agent-catalog-entries.ts`                       |
| Per-agent tab shortcuts                  | `src/shared/keybindings/definitions.ts`                               |
| Bound tab shortcuts                      | `src/renderer/src/lib/agent-tab-shortcuts.ts`                         |
| Chat permission rows                     | `src/renderer/src/components/settings/chat/ChatPermissionSetting.tsx` |
| Account sections and their search        | `src/renderer/src/components/settings/accounts/`                      |
| Which agent each usage meter follows     | `src/shared/agent-launch/catalog/offered-usage-trackers.ts`           |
| Usage meter, menu entry and toggles      | `src/renderer/src/components/status-bar/status-bar-agent-gating.ts`   |
| Usage background refresh                 | `src/main/rate-limits/service/service-fetch-targets.ts`               |

## What withholding does not do

- It does not delete user settings. Saved arguments, permissions and disabled state for a withheld
  agent stay on disk and apply again when it is restored.
- It does not hide history. Past sessions from a withheld agent still appear in AI Vault, and a
  withheld CLI started by hand in a terminal still runs.

## Usage trackers without an agent

A usage meter follows its agent: OpenCode Go follows `opencode`, Cursor follows `cursor`, and so on.
A tracker that has no agent cannot be withheld that way. Those have their own record,
`AGENTLESS_USAGE_TRACKER_OFFERED` in
[`src/shared/agent-launch/catalog/offered-usage-trackers.ts`](../../src/shared/agent-launch/catalog/offered-usage-trackers.ts).

| Tracker | Id        | Offered | Since      |
| ------- | --------- | ------- | ---------- |
| MiniMax | `minimax` | no      | 2026-11-12 |

A withheld tracker is:

- absent from Settings → Accounts and from Settings search;
- absent from the status bar, from the status bar's show/hide menu and from the status bar
  toggles in Settings → Appearance;
- never refreshed, so a key or cookie saved before it was withheld is not sent anywhere.

Its fetcher, credential storage, saved settings and translations stay in the tree. To restore it,
flip its value to `true`.

The account section is the one place that asks about MiniMax by name; everything else goes
through the same rule as the agents' meters, listed in the table above.
