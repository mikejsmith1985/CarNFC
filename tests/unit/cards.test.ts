// Unit tests for the staleness stamp shown over cached cards (FR-038).

import { describe, expect, it } from 'vitest'
import { cardCacheKey, computeStalenessMinutes, describeStaleness } from '@/lib/offline/cards'

const NOW = new Date('2026-08-13T12:00:00Z').getTime()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function agoIso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString()
}

describe('cardCacheKey', () => {
  it('matches the readable address, which is already unique per owner', () => {
    expect(cardCacheKey('raptor', 'front-diff')).toBe('raptor/front-diff')
  })
})

describe('computeStalenessMinutes', () => {
  it('reports zero for a payload just fetched', () => {
    expect(computeStalenessMinutes(agoIso(0), NOW)).toBe(0)
  })

  it('floors to whole minutes', () => {
    expect(computeStalenessMinutes(agoIso(90_000), NOW)).toBe(1)
  })

  it('never reports negative age when a device clock runs behind', () => {
    // The clock may be wrong; "-3 min ago" would be worse than "just now".
    expect(computeStalenessMinutes(agoIso(-5 * MINUTE), NOW)).toBe(0)
  })

  it('returns zero rather than NaN for an unparseable stamp', () => {
    expect(computeStalenessMinutes('not-a-date', NOW)).toBe(0)
  })
})

describe('describeStaleness', () => {
  it('says "just now" under a minute', () => {
    expect(describeStaleness(agoIso(30_000), NOW)).toBe('just now')
  })

  it('counts minutes within the hour', () => {
    expect(describeStaleness(agoIso(20 * MINUTE), NOW)).toBe('20 min ago')
  })

  it('switches to hours past sixty minutes', () => {
    expect(describeStaleness(agoIso(3 * HOUR), NOW)).toBe('3 hr ago')
  })

  it('switches to days past twenty-four hours', () => {
    expect(describeStaleness(agoIso(2 * DAY), NOW)).toBe('2 days ago')
  })

  it('says one day in the singular', () => {
    expect(describeStaleness(agoIso(DAY), NOW)).toBe('1 day ago')
  })

  it('stays legible for a card left untouched for months', () => {
    // A torque figure read 90 days ago may well be out of date.
    expect(describeStaleness(agoIso(90 * DAY), NOW)).toBe('90 days ago')
  })
})
