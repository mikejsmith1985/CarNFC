// Unit tests for the pending sign-in record that survives leaving the page to fetch a code.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingSignIn,
  formatRemaining,
  getPendingSignInSnapshot,
  getServerPendingSignInSnapshot,
  parsePendingSignIn,
  readPendingSignIn,
  rememberPendingSignIn,
  secondsRemaining,
  SIGN_IN_CODE_TTL_SECONDS,
  subscribeToPendingSignIn,
} from '@/lib/auth/pending-sign-in'

const NOW = 1_700_000_000_000

beforeEach(() => {
  localStorage.clear()
})

describe('rememberPendingSignIn / readPendingSignIn', () => {
  it('survives a round trip, which is the whole point', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    expect(readPendingSignIn(NOW)?.email).toBe('owner@example.com')
  })

  it('returns null when no code has been sent', () => {
    expect(readPendingSignIn(NOW)).toBeNull()
  })

  it('still resolves just before the code expires', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    const justInside = NOW + (SIGN_IN_CODE_TTL_SECONDS - 1) * 1000
    expect(readPendingSignIn(justInside)).not.toBeNull()
  })

  it('returns null once the code has expired', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    const past = NOW + (SIGN_IN_CODE_TTL_SECONDS + 1) * 1000
    expect(readPendingSignIn(past)).toBeNull()
  })

  it('clears an expired record rather than leaving it to be re-read', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    readPendingSignIn(NOW + (SIGN_IN_CODE_TTL_SECONDS + 1) * 1000)
    expect(localStorage.getItem('servicecard.pending-sign-in')).toBeNull()
  })

  it('discards a corrupted record instead of throwing', () => {
    localStorage.setItem('servicecard.pending-sign-in', 'not json')
    expect(readPendingSignIn(NOW)).toBeNull()
  })

  it('discards a record missing its fields', () => {
    localStorage.setItem('servicecard.pending-sign-in', JSON.stringify({ email: 'a@b.c' }))
    expect(readPendingSignIn(NOW)).toBeNull()
  })

  it('forgets the record on request', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    clearPendingSignIn()
    expect(readPendingSignIn(NOW)).toBeNull()
  })

  it('replaces an earlier record when a new code is requested', () => {
    rememberPendingSignIn('first@example.com', NOW)
    rememberPendingSignIn('second@example.com', NOW + 5000)
    expect(readPendingSignIn(NOW + 5000)?.email).toBe('second@example.com')
  })
})

describe('secondsRemaining', () => {
  it('reports the full lifetime the moment a code is sent', () => {
    expect(secondsRemaining({ email: 'a@b.c', sentAtMs: NOW }, NOW)).toBe(SIGN_IN_CODE_TTL_SECONDS)
  })

  it('counts down as time passes', () => {
    expect(secondsRemaining({ email: 'a@b.c', sentAtMs: NOW }, NOW + 60_000)).toBe(
      SIGN_IN_CODE_TTL_SECONDS - 60,
    )
  })

  it('never goes negative', () => {
    const wellPast = NOW + (SIGN_IN_CODE_TTL_SECONDS + 500) * 1000
    expect(secondsRemaining({ email: 'a@b.c', sentAtMs: NOW }, wellPast)).toBe(0)
  })

  it('does not trust a clock that has gone backwards', () => {
    expect(secondsRemaining({ email: 'a@b.c', sentAtMs: NOW }, NOW - 60_000)).toBe(
      SIGN_IN_CODE_TTL_SECONDS,
    )
  })
})

describe('the subscribable store the form reads', () => {
  it('reports nothing on the server, so the first client render matches the HTML', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    expect(getServerPendingSignInSnapshot()).toBeNull()
  })

  it('hands back the same snapshot reference while nothing changes', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    // React compares snapshots by identity; an unstable one re-renders forever.
    expect(getPendingSignInSnapshot()).toBe(getPendingSignInSnapshot())
  })

  it('tells a subscriber when a code is sent', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToPendingSignIn(onStoreChange)
    rememberPendingSignIn('owner@example.com', NOW)
    unsubscribe()
    expect(onStoreChange).toHaveBeenCalled()
  })

  it('tells a subscriber when the record is cleared', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToPendingSignIn(onStoreChange)
    clearPendingSignIn()
    unsubscribe()
    expect(onStoreChange).toHaveBeenCalled()
  })

  it('stops telling a subscriber once it has unsubscribed', () => {
    const onStoreChange = vi.fn()
    subscribeToPendingSignIn(onStoreChange)()
    rememberPendingSignIn('owner@example.com', NOW)
    expect(onStoreChange).not.toHaveBeenCalled()
  })

  it('follows a code sent in another tab', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToPendingSignIn(onStoreChange)
    window.dispatchEvent(new StorageEvent('storage', { key: 'servicecard.pending-sign-in' }))
    unsubscribe()
    expect(onStoreChange).toHaveBeenCalled()
  })

  it('ignores an unrelated key changing in another tab', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToPendingSignIn(onStoreChange)
    window.dispatchEvent(new StorageEvent('storage', { key: 'something.else' }))
    unsubscribe()
    expect(onStoreChange).not.toHaveBeenCalled()
  })
})

describe('parsePendingSignIn', () => {
  it('leaves an expired record in place, because rendering must not have side effects', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    const raw = getPendingSignInSnapshot()
    const past = NOW + (SIGN_IN_CODE_TTL_SECONDS + 1) * 1000

    expect(parsePendingSignIn(raw, past)).toBeNull()
    expect(getPendingSignInSnapshot()).toBe(raw)
  })

  it('returns null for an absent record', () => {
    expect(parsePendingSignIn(null, NOW)).toBeNull()
  })

  it('returns null for a corrupted record', () => {
    expect(parsePendingSignIn('not json', NOW)).toBeNull()
  })

  it('reads a live record', () => {
    rememberPendingSignIn('owner@example.com', NOW)
    expect(parsePendingSignIn(getPendingSignInSnapshot(), NOW)?.email).toBe('owner@example.com')
  })
})

describe('formatRemaining', () => {
  it('pads seconds so the countdown does not jitter in width', () => {
    expect(formatRemaining(65)).toBe('1:05')
  })

  it('formats a whole minute', () => {
    expect(formatRemaining(120)).toBe('2:00')
  })

  it('formats under a minute', () => {
    expect(formatRemaining(9)).toBe('0:09')
  })

  it('formats zero', () => {
    expect(formatRemaining(0)).toBe('0:00')
  })
})
