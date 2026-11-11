import { describe, expect, it } from 'vitest'
import {
  isPluginFrameOriginUrl,
  parsePluginFrameUrl,
  pluginFrameKey,
  pluginFramePartition,
  pluginFrameUrl,
  readPluginFramePartitionKey
} from './plugin-frame-guest'

const KEY = pluginFrameKey('acme.charts')

describe('plugin frame guest identity', () => {
  it('round-trips the partition and refuses look-alikes', () => {
    expect(pluginFramePartition(KEY)).toBe(`persist:markov-plugin-${KEY}`)
    expect(readPluginFramePartitionKey(pluginFramePartition(KEY))).toBe(KEY)
    expect(readPluginFramePartitionKey(`persist:markov-plugin-${KEY}x`)).toBeNull()
    expect(readPluginFramePartitionKey(`markov-plugin-${KEY}`)).toBeNull()
    expect(readPluginFramePartitionKey('persist:markov-plugin-../../x')).toBeNull()
  })
})

describe('plugin frame URLs', () => {
  it('builds entry URLs from manifest paths', () => {
    expect(pluginFrameUrl(KEY, 'ui/panel.html')).toBe(`markov-plugin-frame://${KEY}/ui/panel.html`)
    expect(pluginFrameUrl(KEY, './a b/#x.html')).toBe(
      `markov-plugin-frame://${KEY}/a%20b/%23x.html`
    )
  })

  it('parses contained paths into decoded segments', () => {
    expect(parsePluginFrameUrl(`markov-plugin-frame://${KEY}/ui/app.js?v=1`)).toEqual({
      frameKey: KEY,
      segments: ['ui', 'app.js'],
      reserved: false
    })
    expect(parsePluginFrameUrl(`markov-plugin-frame://${KEY}/a%20b/x.wasm`)?.segments).toEqual([
      'a b',
      'x.wasm'
    ])
    expect(parsePluginFrameUrl(`markov-plugin-frame://${KEY}/__markov/sdk.js`)?.reserved).toBe(true)
    expect(parsePluginFrameUrl(`markov-plugin-frame://${KEY}/__MARKOV/sdk.js`)?.reserved).toBe(true)
    expect(parsePluginFrameUrl(`markov-plugin-frame://${KEY}/__Markov/sdk.js`)?.reserved).toBe(true)
  })

  it('lets URL dot segments collapse at the plugin root, never above it', () => {
    expect(
      parsePluginFrameUrl(`markov-plugin-frame://${KEY}/ui/%2e%2e/%2e%2e/../secret`)?.segments
    ).toEqual(['secret'])
  })

  it.each([
    `markov-plugin-frame://${KEY}/`,
    `markov-plugin-frame://${KEY}/..%2Fsecret`,
    `markov-plugin-frame://${KEY}/a%5C..%5Cb`,
    `markov-plugin-frame://${KEY}/a%00b`,
    `markov-plugin-frame://${KEY}/__markov./runtime.mjs`,
    `markov-plugin-frame://${KEY}/__markov%20/runtime.mjs`,
    `markov-plugin-frame://${KEY}/panel.html.`,
    `markov-plugin-frame://${KEY}/C:%5Cwindows`,
    `markov-plugin-frame://${KEY}/bad%E0%A4%A`,
    `markov-plugin-frame://${KEY}:8080/x`,
    `markov-plugin-frame://user@${KEY}/x`,
    'markov-plugin-frame://NOTAKEY/x',
    `https://${KEY}/x`
  ])('refuses %s', (url) => {
    expect(parsePluginFrameUrl(url)).toBeNull()
  })

  it('matches only the exact plugin origin', () => {
    expect(isPluginFrameOriginUrl(`markov-plugin-frame://${KEY}/x.html`, KEY)).toBe(true)
    expect(isPluginFrameOriginUrl(`markov-plugin-frame://${pluginFrameKey('a.b')}/x`, KEY)).toBe(
      false
    )
    expect(isPluginFrameOriginUrl(`blob:markov-plugin-frame://${KEY}/uuid`, KEY)).toBe(false)
    expect(isPluginFrameOriginUrl('not a url', KEY)).toBe(false)
  })
})
