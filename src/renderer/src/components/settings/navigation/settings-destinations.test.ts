import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import {
  isSingleSectionDestination,
  locateSettingsSection,
  resolveSettingsDestinations
} from './settings-destinations'
import { resolveSplitSettingsSection } from './settings-split-section-targets'

describe('settings destinations', () => {
  it('gives every settings section a place in the sidebar', () => {
    const sectionIds = buildSettingsNavigationMetadata({
      isMac: true,
      isWindows: false,
      isWebClient: false,
      isDev: true,
      isLinearConnected: true,
      repos: []
    }).map((section) => section.id)
    const destinations = resolveSettingsDestinations(new Set(sectionIds))

    expect(sectionIds.filter((id) => locateSettingsSection(destinations, id) === null)).toEqual([])
  })

  it('drops tabs and entries whose sections this client does not have', () => {
    const destinations = resolveSettingsDestinations(new Set(['servers', 'privacy']))

    expect(destinations.map((destination) => destination.id)).toEqual(['devices', 'privacy'])
    expect(destinations[0].tabs.map((tab) => tab.sectionIds)).toEqual([['servers']])
    expect(isSingleSectionDestination(destinations[0])).toBe(true)
  })

  it('stacks the sections that share a page', () => {
    const destinations = resolveSettingsDestinations(new Set(['developer-permissions', 'privacy']))

    expect(locateSettingsSection(destinations, 'privacy')?.tab.sectionIds).toEqual([
      'developer-permissions',
      'privacy'
    ])
  })
})

describe('links written for panes that were split', () => {
  it('lands on the section that now holds the setting', () => {
    expect(resolveSplitSettingsSection('general', 'cli')).toBe('cli')
    expect(resolveSplitSettingsSection('git', 'source-control-ai-settings')).toBe('git-ai')
    expect(resolveSplitSettingsSection('appearance', 'usage-percentage-display')).toBe(
      'appearance-window'
    )
  })

  it('leaves other links where they pointed', () => {
    expect(resolveSplitSettingsSection('general', 'general-open-in-apps')).toBe('general')
    expect(resolveSplitSettingsSection('git', undefined)).toBe('git')
  })
})
