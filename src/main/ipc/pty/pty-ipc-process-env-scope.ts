// Split suites rewrite platform and agent-home environment; capture and restore the host values.
export function createPtyIpcProcessEnvScope() {
  const savedOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR
  const savedMarkovOpenCodeConfigDir = process.env.MARKOV_OPENCODE_CONFIG_DIR
  const savedMarkovOpenCodeSourceConfigDir = process.env.MARKOV_OPENCODE_SOURCE_CONFIG_DIR
  const savedPiAgentDir = process.env.PI_CODING_AGENT_DIR
  const savedMarkovPiAgentDir = process.env.MARKOV_PI_CODING_AGENT_DIR
  const savedMarkovPiSourceAgentDir = process.env.MARKOV_PI_SOURCE_AGENT_DIR
  const savedMarkovCodexHome = process.env.MARKOV_CODEX_HOME
  const savedMarkovOmpAgentDir = process.env.MARKOV_OMP_CODING_AGENT_DIR
  const savedMarkovOmpSourceAgentDir = process.env.MARKOV_OMP_SOURCE_AGENT_DIR
  const savedMarkovOmpStatusExtension = process.env.MARKOV_OMP_STATUS_EXTENSION
  const savedPrimeAgentDir = process.env.PRIME_AGENT_CODING_AGENT_DIR
  const savedMarkovPrimeAgentSourceDir = process.env.MARKOV_PRIME_AGENT_SOURCE_AGENT_DIR
  const savedMarkovPrimeAgentStatusExtension = process.env.MARKOV_PRIME_AGENT_STATUS_EXTENSION
  const savedMarkovClaudeAgentStatusSettings = process.env.MARKOV_CLAUDE_AGENT_STATUS_SETTINGS
  const savedProcessPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const savedDisableMacosLoginShell = process.env.MARKOV_DISABLE_MACOS_LOGIN_SHELL
  const savedMarkovUserDataPath = process.env.MARKOV_USER_DATA_PATH

  function applyTestEnvDefaults() {
    // POSIX is the default fixture; Windows cases explicitly opt in.
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'darwin'
    })
    // Disable the TCC argv wrapper except in its dedicated tests.
    process.env.MARKOV_DISABLE_MACOS_LOGIN_SHELL = '1'
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.MARKOV_OPENCODE_SOURCE_CONFIG_DIR
    delete process.env.MARKOV_OPENCODE_CONFIG_DIR
    delete process.env.MARKOV_AGENT_HOOK_ENDPOINT
    delete process.env.MARKOV_CLAUDE_AGENT_STATUS_SETTINGS
    delete process.env.PI_CODING_AGENT_DIR
    delete process.env.MARKOV_PI_SOURCE_AGENT_DIR
    delete process.env.MARKOV_PI_CODING_AGENT_DIR
    delete process.env.MARKOV_CODEX_HOME
    delete process.env.MARKOV_OMP_SOURCE_AGENT_DIR
    delete process.env.MARKOV_OMP_CODING_AGENT_DIR
    delete process.env.MARKOV_OMP_STATUS_EXTENSION
    delete process.env.PRIME_AGENT_CODING_AGENT_DIR
    delete process.env.MARKOV_PRIME_AGENT_SOURCE_AGENT_DIR
    delete process.env.MARKOV_PRIME_AGENT_STATUS_EXTENSION
  }

  function restoreProcessEnv() {
    if (savedProcessPlatform) {
      Object.defineProperty(process, 'platform', savedProcessPlatform)
    }
    if (savedDisableMacosLoginShell !== undefined) {
      process.env.MARKOV_DISABLE_MACOS_LOGIN_SHELL = savedDisableMacosLoginShell
    } else {
      delete process.env.MARKOV_DISABLE_MACOS_LOGIN_SHELL
    }
    if (savedMarkovUserDataPath !== undefined) {
      process.env.MARKOV_USER_DATA_PATH = savedMarkovUserDataPath
    } else {
      delete process.env.MARKOV_USER_DATA_PATH
    }
    if (savedOpenCodeConfigDir !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = savedOpenCodeConfigDir
    } else {
      delete process.env.OPENCODE_CONFIG_DIR
    }
    if (savedMarkovOpenCodeConfigDir !== undefined) {
      process.env.MARKOV_OPENCODE_CONFIG_DIR = savedMarkovOpenCodeConfigDir
    } else {
      delete process.env.MARKOV_OPENCODE_CONFIG_DIR
    }
    if (savedMarkovOpenCodeSourceConfigDir !== undefined) {
      process.env.MARKOV_OPENCODE_SOURCE_CONFIG_DIR = savedMarkovOpenCodeSourceConfigDir
    } else {
      delete process.env.MARKOV_OPENCODE_SOURCE_CONFIG_DIR
    }
    if (savedPiAgentDir !== undefined) {
      process.env.PI_CODING_AGENT_DIR = savedPiAgentDir
    } else {
      delete process.env.PI_CODING_AGENT_DIR
    }
    if (savedMarkovPiAgentDir !== undefined) {
      process.env.MARKOV_PI_CODING_AGENT_DIR = savedMarkovPiAgentDir
    } else {
      delete process.env.MARKOV_PI_CODING_AGENT_DIR
    }
    if (savedMarkovPiSourceAgentDir === undefined) {
      delete process.env.MARKOV_PI_SOURCE_AGENT_DIR
    } else {
      process.env.MARKOV_PI_SOURCE_AGENT_DIR = savedMarkovPiSourceAgentDir
    }
    if (savedMarkovCodexHome === undefined) {
      delete process.env.MARKOV_CODEX_HOME
    } else {
      process.env.MARKOV_CODEX_HOME = savedMarkovCodexHome
    }
    if (savedMarkovOmpAgentDir !== undefined) {
      process.env.MARKOV_OMP_CODING_AGENT_DIR = savedMarkovOmpAgentDir
    } else {
      delete process.env.MARKOV_OMP_CODING_AGENT_DIR
    }
    if (savedMarkovOmpSourceAgentDir !== undefined) {
      process.env.MARKOV_OMP_SOURCE_AGENT_DIR = savedMarkovOmpSourceAgentDir
    } else {
      delete process.env.MARKOV_OMP_SOURCE_AGENT_DIR
    }
    if (savedMarkovOmpStatusExtension !== undefined) {
      process.env.MARKOV_OMP_STATUS_EXTENSION = savedMarkovOmpStatusExtension
    } else {
      delete process.env.MARKOV_OMP_STATUS_EXTENSION
    }
    if (savedPrimeAgentDir !== undefined) {
      process.env.PRIME_AGENT_CODING_AGENT_DIR = savedPrimeAgentDir
    } else {
      delete process.env.PRIME_AGENT_CODING_AGENT_DIR
    }
    if (savedMarkovPrimeAgentSourceDir !== undefined) {
      process.env.MARKOV_PRIME_AGENT_SOURCE_AGENT_DIR = savedMarkovPrimeAgentSourceDir
    } else {
      delete process.env.MARKOV_PRIME_AGENT_SOURCE_AGENT_DIR
    }
    if (savedMarkovPrimeAgentStatusExtension !== undefined) {
      process.env.MARKOV_PRIME_AGENT_STATUS_EXTENSION = savedMarkovPrimeAgentStatusExtension
    } else {
      delete process.env.MARKOV_PRIME_AGENT_STATUS_EXTENSION
    }
    if (savedMarkovClaudeAgentStatusSettings === undefined) {
      delete process.env.MARKOV_CLAUDE_AGENT_STATUS_SETTINGS
    } else {
      process.env.MARKOV_CLAUDE_AGENT_STATUS_SETTINGS = savedMarkovClaudeAgentStatusSettings
    }
  }

  return { applyTestEnvDefaults, restoreProcessEnv }
}
