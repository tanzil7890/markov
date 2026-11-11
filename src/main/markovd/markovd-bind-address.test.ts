import { describe, expect, it } from 'vitest'
import {
  bindHostIsNetworkExposed,
  MARKOVD_LOOPBACK_BIND_HOST,
  MarkovdBindAddressError,
  resolveMarkovdBindHost
} from './markovd-bind-address'

describe('resolveMarkovdBindHost', () => {
  it('defaults to loopback when the operator asked for nothing', () => {
    expect(resolveMarkovdBindHost()).toBe(MARKOVD_LOOPBACK_BIND_HOST)
    expect(MARKOVD_LOOPBACK_BIND_HOST).toBe('127.0.0.1')
  })

  it('accepts literal IPv4 and IPv6 addresses, including explicit wide binds', () => {
    expect(resolveMarkovdBindHost('0.0.0.0')).toBe('0.0.0.0')
    expect(resolveMarkovdBindHost('10.1.2.3')).toBe('10.1.2.3')
    expect(resolveMarkovdBindHost('::1')).toBe('::1')
    expect(resolveMarkovdBindHost('localhost')).toBe('127.0.0.1')
    expect(resolveMarkovdBindHost(' 127.0.0.1 ')).toBe('127.0.0.1')
  })

  it('refuses hostnames, because DNS would decide which interface got bound', () => {
    expect(() => resolveMarkovdBindHost('internal.example')).toThrow(MarkovdBindAddressError)
    expect(() => resolveMarkovdBindHost('')).toThrow(MarkovdBindAddressError)
    expect(() => resolveMarkovdBindHost('0.0.0.0:80')).toThrow(MarkovdBindAddressError)
  })
})

describe('bindHostIsNetworkExposed', () => {
  it('separates local-only addresses from network-reachable ones', () => {
    expect(bindHostIsNetworkExposed('127.0.0.1')).toBe(false)
    expect(bindHostIsNetworkExposed('127.5.5.5')).toBe(false)
    expect(bindHostIsNetworkExposed('::1')).toBe(false)
    expect(bindHostIsNetworkExposed('0.0.0.0')).toBe(true)
    expect(bindHostIsNetworkExposed('::')).toBe(true)
    expect(bindHostIsNetworkExposed('10.1.2.3')).toBe(true)
  })
})
