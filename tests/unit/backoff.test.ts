// Unit tests for outbox retry pacing and failure classification.

import { describe, expect, it } from 'vitest'
import {
  classifyFailure,
  computeBackoffDelayMs,
  isReadyToRetry,
  isStuck,
} from '@/lib/offline/backoff'
import { SYNC_BACKOFF_MAX_MS, SYNC_STUCK_AFTER_ATTEMPTS } from '@/lib/constants'

describe('computeBackoffDelayMs', () => {
  it('does not wait before the first attempt', () => {
    expect(computeBackoffDelayMs(0)).toBe(0)
  })

  it('doubles with each failed attempt', () => {
    expect(computeBackoffDelayMs(1)).toBe(1_000)
    expect(computeBackoffDelayMs(2)).toBe(2_000)
    expect(computeBackoffDelayMs(3)).toBe(4_000)
    expect(computeBackoffDelayMs(4)).toBe(8_000)
  })

  it('caps at the ceiling so a long dead zone still retries promptly', () => {
    // Uncapped, 20 attempts would push the next try days out.
    expect(computeBackoffDelayMs(20)).toBe(SYNC_BACKOFF_MAX_MS)
  })

  it('never returns a negative delay for nonsense input', () => {
    expect(computeBackoffDelayMs(-3)).toBe(0)
  })
})

describe('isReadyToRetry', () => {
  it('is ready immediately when nothing has been attempted', () => {
    expect(isReadyToRetry(0, null, 1_000)).toBe(true)
  })

  it('waits out the backoff window', () => {
    // One failure means a 1s wait; 500ms is not enough.
    expect(isReadyToRetry(1, 10_000, 10_500)).toBe(false)
  })

  it('is ready once the window has elapsed', () => {
    expect(isReadyToRetry(1, 10_000, 11_000)).toBe(true)
  })

  it('treats a missing timestamp as ready rather than blocking forever', () => {
    expect(isReadyToRetry(5, null, 10_000)).toBe(true)
  })
})

describe('isStuck', () => {
  it('is not stuck below the threshold', () => {
    expect(isStuck(SYNC_STUCK_AFTER_ATTEMPTS - 1)).toBe(false)
  })

  it('is stuck at the threshold', () => {
    expect(isStuck(SYNC_STUCK_AFTER_ATTEMPTS)).toBe(true)
  })
})

describe('classifyFailure', () => {
  it('treats a thrown error as transient, because the request got no answer', () => {
    expect(classifyFailure({ threw: true })).toBe('transient')
  })

  it('treats a returned rejection as permanent, because retrying cannot change it', () => {
    expect(classifyFailure({ threw: false })).toBe('permanent')
  })
})
