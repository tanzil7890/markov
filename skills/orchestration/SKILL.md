---
name: orchestration
description: >-
  Run work in separate Markov worker agents and get their results back. Use when
  the user asks for Markov workers or supervision (monitor, task DAGs, ask/reply,
  decision gates), or when the work needs something your own subagents cannot
  give: a different agent (such as Codex from Claude) or its own Markov workspace.
  "Have Codex (or Claude) review this and report back" means a Markov worker of
  that agent, even when you have your own model subagents.
  Also use when you are a dispatched worker (a prompt with Task and Dispatch
  IDs: ask, worker_done). Otherwise prefer your own subagents,
  including for long or parallel work. Use `markov-cli` to hand work off with
  nothing expected back ("hand off", "handover", "give this to another agent",
  "another worktree"), and for terminal control, shell commands, worktree
  management, and reading or waiting on terminals.
---

# Markov Orchestration

This discovery stub loads the version-matched guide from the Markov executable used for this session.

Never substitute a non-Markov subagent tool when the user asked for Markov orchestration.

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
MARKOV skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop and dispatched-worker
obligations. For a conditional action gate such as remote placement, uncertain release
recovery, or expanded DAG work, load only the reference that gate names with
`MARKOV skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`MARKOV skills get orchestration --full` and read the named bundled reference before acting.

Use the selected executable's `--help` for commands or flags the guide does not cover. If a
command reports that Markov is not running, start it with `MARKOV open --json` and retry. If it
fails with `runtime_access_denied`, your sandbox blocked the connection: re-run it with
escalated permissions, and do not run `MARKOV open` or restart Markov. If `skills get` is unknown,
explain that updating Markov restores the guide; use `--help` for read-only discovery and do not
guess unsupported commands.
