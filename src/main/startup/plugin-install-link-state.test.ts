import { describe, expect, it, vi } from 'vitest'
import { PluginInstallLinkState } from './skill-share-deep-link-state'
import { isRoutedMarkovDeepLink } from './markov-deep-link-url'

const LINK = 'markov://plugins/acme.dusk?catalog=community'

describe('PluginInstallLinkState', () => {
  it('queues a cold-start link until the renderer pulls it', () => {
    const state = new PluginInstallLinkState()
    expect(state.capture(['/Applications/Markov.app/Contents/MacOS/Markov', LINK])).toBe(true)
    expect(state.consume()).toBe(LINK)
    expect(state.consume()).toBeNull()
  })

  it('publishes a second-instance link and keeps malformed ones for the error toast', () => {
    const state = new PluginInstallLinkState()
    const publish = vi.fn()
    expect(state.capture(['markov.exe', 'markov://plugins/not valid'], publish)).toBe(true)
    expect(publish).toHaveBeenCalledWith('markov://plugins/not valid')
    expect(state.capture(['markov.exe', '--flag'], publish)).toBe(false)
  })

  it('drops repeats and bursts', () => {
    let now = 0
    const state = new PluginInstallLinkState(() => now)
    const publish = vi.fn()
    state.capture([LINK], publish)
    state.capture([LINK], publish)
    expect(publish).toHaveBeenCalledTimes(1)
    for (let index = 0; index < 10; index += 1) {
      state.capture([`markov://plugins/acme.p${index}`], publish)
    }
    expect(publish).toHaveBeenCalledTimes(5)
    now = 5_000
    state.capture([LINK], publish)
    expect(publish).toHaveBeenCalledTimes(6)
  })
})

describe('isRoutedMarkovDeepLink', () => {
  it('claims plugin and skill links on macOS open-url, nothing else', () => {
    expect(isRoutedMarkovDeepLink(LINK)).toBe(true)
    expect(isRoutedMarkovDeepLink('markov://plugins/bad')).toBe(true)
    expect(isRoutedMarkovDeepLink('markov://skills/share/abc_1')).toBe(true)
    expect(isRoutedMarkovDeepLink('markov://pair?code=x')).toBe(false)
    expect(isRoutedMarkovDeepLink('https://example.com/plugins/acme.dusk')).toBe(false)
  })
})
