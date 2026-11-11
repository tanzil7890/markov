---
name: markov-cli
description: >-
  Operate Markov-managed worktrees, folder contexts, terminals, repos, automations, worktree
  comments, and Markov's embedded browser through the `markov` CLI. Use when the user says
  "$markov-cli", "Markov worktree", "child worktree", "spawn codex/claude in a worktree",
  "read/wait/send Markov terminal", "handoff" / "handover" / "give this to another agent", or
  "Markov browser". Prefer it over raw git worktree, ad hoc PTYs, or Computer Use when Markov
  state is involved. Use Computer Use only when a visible window needs GUI control that a
  CLI, filesystem, or API cannot do.
---

# Markov CLI

This discovery stub loads the version-matched guide from the Markov executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `MARKOV_CLI_COMMAND` environment variable is set, use its value. Markov exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `MARKOV_DEV_REPO_ROOT`, use `markov-dev`.
- Otherwise, on Linux outside a Markov-managed terminal, use `markov-ide`, the name the Linux
  CLI installs under.
- Otherwise, use `markov`.

Below, `MARKOV` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `MARKOV` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Markov build.

## Load the version-matched guide before running Markov commands

```text
MARKOV skills get markov-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Markov is not running, start it with `MARKOV open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `MARKOV open` or restart Markov. If
`skills get` is unknown, explain that updating Markov restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
