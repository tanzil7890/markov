import { describe, expect, it } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/test-runtime/environment/vitest-host-ports-setup'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './agent-launch/catalog/tui-agent-config'

const agentTeams = TUI_AGENT_CONFIG['claude-agent-teams']

describe('Claude Agent Teams launch name on the launching host', () => {
  it('uses plain markov on a headless Linux server, whose PATH has no markov-ide (#33920)', () => {
    installFakeAppEnvironment({ getCliLauncherPath: () => '/home/u/.markov/cli/bin/markov' })
    expect(getTuiAgentLaunchCommand(agentTeams, 'linux')).toBe('markov claude-teams')
  })

  it('keeps the markov-ide rename for WSL under a Windows server', () => {
    installFakeAppEnvironment({
      getCliLauncherPath: () => 'C:\\Users\\u\\.markov\\cli\\bin\\markov.exe'
    })
    expect(getTuiAgentLaunchCommand(agentTeams, 'linux')).toBe('markov-ide claude-teams')
  })
})
