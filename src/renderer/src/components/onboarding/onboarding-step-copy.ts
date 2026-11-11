import { translate } from '@/i18n/i18n'

export const stepCopy = {
  account: {
    get title() {
      return translate('components.onboarding.flow.account.title', 'Sign in, or jump straight in')
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.account.subtitle',
        'An account puts your name on what you share and connects Markov Mobile. Everything else works without one.'
      )
    }
  },
  profile: {
    get title() {
      return translate('components.onboarding.flow.profile.title', 'What should we call you?')
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.profile.subtitle',
        'Markov uses this name to greet you. Change it any time in Settings.'
      )
    }
  },
  agent_setup: {
    get title() {
      return translate('components.onboarding.flow.agentSetup.title', 'Set up your agents')
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.agentSetup.subtitle',
        'Install an agent, then sign in with the Claude or ChatGPT plan you already have. No API key needed.'
      )
    }
  },
  agent_surface: {
    get title() {
      return translate(
        'components.onboarding.flow.agentSurface.title',
        'How do you want to work with agents?'
      )
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.agentSurface.pickWhereAgentsOpen',
        'Pick where new agents open.'
      )
    }
  },
  agent_chat: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.198b148b3c',
        'Pick your default agent'
      )
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.agentChat.subtitle',
        'Pick a Chat UI agent. Agents without chat support open in a terminal instead.'
      )
    }
  },
  agent: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.198b148b3c',
        'Pick your default agent'
      )
    },
    get subtitle() {
      return translate(
        'components.onboarding.flow.agentTerminal.subtitle',
        "Markov works with every CLI agent. Choose the one you'll reach for most."
      )
    }
  },
  theme: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.f396db9f20',
        'Make it feel like home'
      )
    },
    get subtitle() {
      return translate(
        'components.onboarding.theme.subtitle',
        'Choose light or dark, then optionally a theme. Change either any time in Settings.'
      )
    }
  },
  notifications: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.b054332836',
        'Set up notifications'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ff92d15436',
        'Markov will notify you when agents are done or need help.'
      )
    }
  },
  integrations: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ae3b00ca82',
        'Set up GitHub tasks'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.97c42cda00',
        'Install the GitHub CLI to:'
      )
    }
  },
  windows_terminal: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalTitle',
        'Set Windows terminal defaults'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalSubtitle',
        'Choose the DEFAULT Shell for new panes and how right-click behaves in the terminal.'
      )
    }
  }
} as const

export const stepTooltipLabels = {
  account: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.account', 'Account')
    }
  },
  profile: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.profile', 'About you')
    }
  },
  agent_setup: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.agentSetup', 'Agent setup')
    }
  },
  agent_surface: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.agentSurface', 'Chat or Terminal')
    }
  },
  agent: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.agent', 'Default Agent')
    }
  },
  theme: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.theme', 'Appearance')
    }
  },
  windows_terminal: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.windowsTerminal', 'Windows Terminal')
    }
  },
  notifications: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.notifications', 'Notifications')
    }
  },
  integrations: {
    get value() {
      return translate('components.onboarding.flow.stepTooltip.integrations', 'Integrations')
    }
  }
} as const
