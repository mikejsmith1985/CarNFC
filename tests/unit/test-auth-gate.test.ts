// Unit tests for the gate on the test-only sign-in route — the one door that must never open on a deployed site.

import { describe, expect, it } from 'vitest'
import { isTestAuthAllowed, isLoopbackHost } from '@/lib/test-support/test-auth-gate'

const LOOPBACK = 'localhost:3102'
const TUNNEL = 'original-dice-athens-demonstrate.trycloudflare.com'

describe('isTestAuthAllowed', () => {
  it('opens in development, where it always has', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'development', enableTestAuth: undefined, requestHost: TUNNEL }),
    ).toBe(true)
  })

  it('opens in test runs', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'test', enableTestAuth: undefined, requestHost: LOOPBACK }),
    ).toBe(true)
  })

  it('stays shut for a production build by default', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'production', enableTestAuth: undefined, requestHost: LOOPBACK }),
    ).toBe(false)
  })

  it('opens for a production build reached on this machine, when asked explicitly', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'production', enableTestAuth: '1', requestHost: LOOPBACK }),
    ).toBe(true)
  })

  // The whole point of the second question: the flag alone is not enough.
  it('stays shut for a request that arrived through a tunnel, flag or no flag', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'production', enableTestAuth: '1', requestHost: TUNNEL }),
    ).toBe(false)
  })

  it('stays shut for a request with no host to judge', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'production', enableTestAuth: '1', requestHost: null }),
    ).toBe(false)
  })

  it('is not satisfied by a truthy-looking flag that is not the flag', () => {
    expect(
      isTestAuthAllowed({ nodeEnv: 'production', enableTestAuth: 'true', requestHost: LOOPBACK }),
    ).toBe(false)
  })
})

describe('isLoopbackHost', () => {
  it.each(['localhost', 'localhost:3102', '127.0.0.1', '127.0.0.1:3000', '[::1]', '[::1]:3102'])(
    'recognises %s as this machine',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true)
    },
  )

  it('ignores case, since a Host header is not case sensitive', () => {
    expect(isLoopbackHost('LocalHost:3102')).toBe(true)
  })

  it('rejects a tunnel', () => {
    expect(isLoopbackHost(TUNNEL)).toBe(false)
  })

  it('rejects a host that merely starts with a loopback name', () => {
    expect(isLoopbackHost('localhost.attacker.example')).toBe(false)
  })

  it('rejects a host that merely ends with one', () => {
    expect(isLoopbackHost('not-localhost')).toBe(false)
  })

  it('rejects an address that only looks loopback-ish', () => {
    expect(isLoopbackHost('127.0.0.1.attacker.example')).toBe(false)
  })

  it('rejects nothing at all', () => {
    expect(isLoopbackHost(undefined)).toBe(false)
  })
})
