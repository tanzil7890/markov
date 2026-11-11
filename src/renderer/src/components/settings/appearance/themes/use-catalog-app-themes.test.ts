import { describe, expect, it } from 'vitest'
import type { PluginMarketplaceHostListing } from '../../../../../../preload/api/plugin-host-api'
import { catalogAppThemes } from './use-catalog-app-themes'

function themeListing(
  pluginKey: string,
  release: Partial<NonNullable<PluginMarketplaceHostListing['release']>> = {}
): PluginMarketplaceHostListing {
  return {
    marketplaceSourceId: 'official',
    marketplaceName: 'Markov Official Plugins',
    marketplaceOwner: 'tanzil7890',
    marketplaceCommit: 'abc123',
    pluginKey,
    source: { kind: 'git', url: 'https://example.invalid/plugins.git', ref: 'main' },
    categories: ['themes'],
    official: true,
    bundled: false,
    release: {
      version: '1.0.0',
      commit: 'd'.repeat(40),
      contentHash: 'e'.repeat(64),
      execution: 'data',
      minimumMarkov: '1.4.245',
      types: [],
      themePreview: [
        {
          label: 'Night',
          base: 'dark',
          background: '#000000',
          foreground: '#ffffff',
          accent: '#336699',
          surface: '#111111'
        },
        {
          label: 'Day',
          base: 'light',
          background: '#ffffff',
          foreground: '#000000',
          accent: '#336699',
          surface: '#eeeeee'
        }
      ],
      ...release
    }
  }
}

describe('catalogAppThemes', () => {
  it('offers only one-click themes for the slot mode that are not installed and run here', () => {
    const snapshot = {
      installed: [],
      markovVersion: '1.4.246',
      listings: [
        themeListing('tanzil7890.offered'),
        themeListing('tanzil7890.installed'),
        themeListing('tanzil7890.code', { execution: 'trusted-worker' }),
        themeListing('tanzil7890.too-new', { minimumMarkov: '9.0.0' })
      ]
    }

    const offered = catalogAppThemes(snapshot, 'dark', new Set(['tanzil7890.installed']))

    expect(offered.map((theme) => [theme.listing.pluginKey, theme.label])).toEqual([
      ['tanzil7890.offered', 'Night']
    ])
  })
})
