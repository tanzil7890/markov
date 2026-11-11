---
name: markov-emulator
description: >-
  iOS Simulator control from inside Markov, with the live device view in Markov's
  emulator pane. Use when driving a booted Apple Simulator on macOS: taps,
  gestures, typing, hardware buttons, rotation, and the accessibility tree, or
  when an iOS change needs simulator evidence. For an Android device or emulator
  use the Android emulator skill; build and install the app with xcodebuild or
  simctl first.
license: Apache-2.0
---

# Markov Emulator

This discovery stub loads the version-matched guide from the Markov executable used for this session.

Prefer Markov over raw `serve-sim` or direct `simctl` for simulator control inside Markov; it
handles device scoping, helper lifecycle, and worktree context.

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
MARKOV skills get markov-emulator
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Markov is not running, start it with `MARKOV open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `MARKOV open` or restart Markov. If
`skills get` is unknown, explain that updating Markov restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
