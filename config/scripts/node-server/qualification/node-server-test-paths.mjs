/** Mirrors MARKOV_REQUIRED_TEST_INPUTS_ENV in src/main/markovd/markovd-node-slot-fixture.ts. */
export const REQUIRED_TEST_INPUTS_ENV = 'MARKOV_REQUIRED_TEST_INPUTS'

// Need the pinned Bun and the last Bun markovd slot beside the built Node slot (design D7).
export const CROSS_RUNTIME_TEST_PATHS = [
  'src/main/persistence/profile-state/profile-state-cross-runtime.integration.test.ts'
]

// Need the built desktop server template; CI runs them by path after build-markovd-template.mjs.
export const TEMPLATE_TEST_PATHS = [
  'src/main/markovd/markovd-packaged-structured-chat.integration.test.ts'
]

export function nodeServerTestPaths({
  artifact = false,
  crossRuntime = false,
  template = false
} = {}) {
  return [
    'src/main/persistence/profile-state',
    'src/main/persistence/loading-store/profile-state',
    'src/main/sqlite',
    'src/main/markovd/markovd-entry.test.ts',
    // The markovd server's identity and stop path, which Windows SSH hosts rely on (W2).
    'src/main/markovd/markovd-instance-lock.test.ts',
    'src/main/markovd/markovd-process-start-time.test.ts',
    'src/main/markovd/markovd-stop-request-listener.test.ts',
    'src/main/markovd/markovd-managed-stop.test.ts',
    'src/main/markovd/markovd-managed-stop-cancellation.test.ts',
    // The directory, not a prefix: its siblings are POSIX-host unit tests pr.yml already runs.
    'src/main/daemon/pty-subprocess/conpty-startup-input-reader.ts',
    'src/main/daemon/pty-subprocess/daemon-pty-physical-owner.ts',
    'src/main/daemon/pty-subprocess/foreground-fallback-process.ts',
    'src/main/daemon/pty-subprocess/foreground-process-tracker.ts',
    'src/main/daemon/pty-subprocess/native-pty-spawn-windows.test.ts',
    'src/main/daemon/pty-subprocess/native-pty-spawn.ts',
    'src/main/daemon/pty-subprocess/pre-listener-events.ts',
    'src/main/daemon/pty-subprocess/pty-shell-foreground-confirmation.ts',
    'src/main/daemon/pty-subprocess/shell-launch-plan.ts',
    'src/main/daemon/pty-subprocess/spawn-environment.ts',
    'src/main/daemon/pty-subprocess/spawn-file-child-processes.ts',
    'src/main/daemon/pty-subprocess/spawn-file-foreground-process.ts',
    'src/main/daemon/pty-subprocess/spawn-file-foreground-rejected-agents.test.ts',
    'src/main/daemon/pty-subprocess/spawn-preflight.ts',
    'src/main/daemon/pty-subprocess/subprocess-handle.ts',
    'src/main/daemon/pty-subprocess/testing/pty-subprocess-spawn-file-foreground.test.ts',
    'src/main/daemon/pty-subprocess/testing/pty-subprocess-io-failure-native.test.ts',
    ...(artifact
      ? [
          'tests/e2e/daemon-running-work-probe.unit.test.ts',
          'src/shared/terminal/pty/lifecycle/pty-running-work-probe.test.ts',
          'src/main/markovd/markovd-packaged-node-pty.integration.test.ts',
          'src/main/providers/agent-foreground-process-git-bash.win32.test.ts',
          'src/main/markovd/markovd-cli-launcher.integration.test.ts',
          'src/main/markovd/markovd-cli-orchestration.integration.test.ts',
          'src/main/markovd/markovd-launcher-isolation.integration.test.ts',
          'src/main/markovd/markovd-stop-request-shutdown.integration.test.ts',
          'src/main/markovd/markovd-windows-conpty-breakaway.integration.test.ts',
          'src/main/markovd/markovd-serve-parity.integration.test.ts',
          'config/scripts/archives/platform-command/zip-extractor-command.test.mjs'
        ]
      : []),
    ...(crossRuntime ? CROSS_RUNTIME_TEST_PATHS : []),
    ...(template ? TEMPLATE_TEST_PATHS : [])
  ]
}
