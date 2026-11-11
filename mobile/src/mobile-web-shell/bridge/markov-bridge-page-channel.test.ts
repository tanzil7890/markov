import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMarkovBridgePageTransport,
  readMarkovBridgePageChannel,
  type MarkovBridgePageChannel
} from './markov-bridge-page-channel'

function installChannel(channel: unknown): void {
  Object.defineProperty(globalThis, 'markovBridge', { value: channel, configurable: true })
}

function createChannel(): MarkovBridgePageChannel {
  return { postMessage: vi.fn(), onmessage: null }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'markovBridge')
})

describe('the page channel the shell installs', () => {
  it('is absent in a browser, which is a page the bundle still has to open', () => {
    expect(readMarkovBridgePageChannel()).toBeNull()
  })

  it('refuses a global of another shape rather than posting into it', () => {
    installChannel({ postMessage: 'not a function', onmessage: null })
    expect(readMarkovBridgePageChannel()).toBeNull()
  })

  it('reads the installed object itself, so the page posts through the real sink', () => {
    const channel = createChannel()
    installChannel(channel)
    expect(readMarkovBridgePageChannel()).toBe(channel)
  })
})

describe('the page channel as a client transport', () => {
  it('posts what the client sends', () => {
    const channel = createChannel()
    createMarkovBridgePageTransport(channel).send('{"v":1}')
    expect(channel.postMessage).toHaveBeenCalledWith('{"v":1}')
  })

  it('hands the client the frame off the event, and gives the slot back', () => {
    const channel = createChannel()
    const handler = vi.fn()
    const release = createMarkovBridgePageTransport(channel).onMessage(handler)
    channel.onmessage?.({ data: '{"v":1,"type":"init"}' })
    expect(handler).toHaveBeenCalledWith('{"v":1,"type":"init"}')
    release()
    expect(channel.onmessage).toBeNull()
  })
})
