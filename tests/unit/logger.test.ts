// Unit tests for structured logging redaction. The passport redacts costs in SQL; leaking them through a log would defeat that.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  logAuthorizationDenied,
  logCardRender,
  logFailure,
  logSyncDrain,
} from '@/lib/observability/logger'

let emitted: string[] = []

beforeEach(() => {
  emitted = []
  vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
    emitted.push(String(line))
  })
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    emitted.push(String(line))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('log shape', () => {
  it('emits one JSON object per call', () => {
    logCardRender({ accountId: 'acct-1', durationMs: 120 })
    expect(emitted).toHaveLength(1)
    expect(() => JSON.parse(emitted[0]!)).not.toThrow()
  })

  it('names the event and stamps the time', () => {
    logCardRender({ accountId: 'acct-1' })
    const record = JSON.parse(emitted[0]!)
    expect(record.event).toBe('card.render')
    expect(record.at).toBeTruthy()
  })

  it('carries the identifiers that make a line actionable', () => {
    logCardRender({ accountId: 'acct-1', vehicleId: 'veh-1', durationMs: 419 })
    const record = JSON.parse(emitted[0]!)
    expect(record.accountId).toBe('acct-1')
    expect(record.durationMs).toBe(419)
  })

  it('omits fields that were not supplied', () => {
    logCardRender({ accountId: 'acct-1' })
    expect(emitted[0]).not.toContain('vehicleId')
  })
})

describe('redaction', () => {
  it('drops private fields even when a caster forces them past the type', () => {
    // The type already excludes these; a cast at a call site would slip past
    // the compiler and must not slip past this.
    logCardRender({
      accountId: 'acct-1',
      email: 'owner@example.com',
      cost: 249.99,
      notes: 'Replaced pads',
      locationLabel: 'Home',
      token: 'live-share-token',
    } as never)

    const line = emitted[0]!
    expect(line).not.toContain('owner@example.com')
    expect(line).not.toContain('249.99')
    expect(line).not.toContain('Replaced pads')
    expect(line).not.toContain('Home')
    expect(line).not.toContain('live-share-token')
  })

  it('keeps the identifiers alongside the redacted fields', () => {
    logCardRender({ accountId: 'acct-1', cost: 100 } as never)
    expect(JSON.parse(emitted[0]!).accountId).toBe('acct-1')
  })
})

describe('levels', () => {
  it('raises a drain carrying stuck records to a warning', () => {
    logSyncDrain({ delivered: 3, stuck: 2 })
    expect(JSON.parse(emitted[0]!).level).toBe('warn')
  })

  it('leaves a clean drain at info', () => {
    logSyncDrain({ delivered: 3, stuck: 0 })
    expect(JSON.parse(emitted[0]!).level).toBe('info')
  })

  it('marks an authorization refusal as denied, which is a security signal', () => {
    logAuthorizationDenied('resolve_tag', { accountId: 'acct-1' })
    const record = JSON.parse(emitted[0]!)
    expect(record.event).toBe('authz.denied.resolve_tag')
    expect(record.outcome).toBe('denied')
  })

  it('marks a failure as an error', () => {
    logFailure('card.load', { vehicleId: 'veh-1' })
    const record = JSON.parse(emitted[0]!)
    expect(record.level).toBe('error')
    expect(record.outcome).toBe('error')
  })
})
