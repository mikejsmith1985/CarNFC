// Unit tests for next-due and overdue computation (FR-013).

import { describe, expect, it } from 'vitest'
import { computeNextDue, isReminderOverdue } from '@/lib/calc/reminders'

const TODAY = new Date('2026-08-13T00:00:00Z')

describe('computeNextDue', () => {
  it('projects the next service from the interval and the last one performed', () => {
    const result = computeNextDue({
      lastServiceOdometer: 110_000,
      lastServiceDate: '2026-06-12',
      intervalMiles: 30_000,
      intervalDays: null,
    })
    expect(result.dueOdometer).toBe(140_000)
    expect(result.dueOn).toBeNull()
  })

  it('projects a date interval', () => {
    const result = computeNextDue({
      lastServiceOdometer: 110_000,
      lastServiceDate: '2026-06-12',
      intervalMiles: null,
      intervalDays: 180,
    })
    expect(result.dueOn).toBe('2026-12-09')
  })

  it('projects both when both intervals are defined', () => {
    const result = computeNextDue({
      lastServiceOdometer: 110_000,
      lastServiceDate: '2026-06-12',
      intervalMiles: 5_000,
      intervalDays: 180,
    })
    expect(result.dueOdometer).toBe(115_000)
    expect(result.dueOn).toBe('2026-12-09')
  })

  it('produces nothing when the component has no interval', () => {
    const result = computeNextDue({
      lastServiceOdometer: 110_000,
      lastServiceDate: '2026-06-12',
      intervalMiles: null,
      intervalDays: null,
    })
    expect(result.dueOdometer).toBeNull()
    expect(result.dueOn).toBeNull()
  })

  it('produces nothing when the component has never been serviced', () => {
    const result = computeNextDue({
      lastServiceOdometer: null,
      lastServiceDate: null,
      intervalMiles: 30_000,
      intervalDays: null,
    })
    expect(result.dueOdometer).toBeNull()
  })
})

describe('isReminderOverdue', () => {
  it('is not overdue before either threshold', () => {
    expect(isReminderOverdue({ dueOdometer: 140_000, dueOn: null }, 120_000, TODAY)).toBe(false)
  })

  it('is overdue once the odometer passes the threshold', () => {
    expect(isReminderOverdue({ dueOdometer: 140_000, dueOn: null }, 141_000, TODAY)).toBe(true)
  })

  it('is overdue exactly at the threshold', () => {
    expect(isReminderOverdue({ dueOdometer: 140_000, dueOn: null }, 140_000, TODAY)).toBe(true)
  })

  it('is overdue once the date passes', () => {
    expect(isReminderOverdue({ dueOdometer: null, dueOn: '2026-08-01' }, 0, TODAY)).toBe(true)
  })

  it('is not overdue before the date', () => {
    expect(isReminderOverdue({ dueOdometer: null, dueOn: '2026-12-01' }, 0, TODAY)).toBe(false)
  })

  it('is overdue when either threshold is passed, not only both', () => {
    // Whichever comes first: an oil change is due at 5,000 miles OR six months.
    expect(isReminderOverdue({ dueOdometer: 140_000, dueOn: '2026-08-01' }, 120_000, TODAY)).toBe(
      true,
    )
  })

  it('is never overdue when it has no threshold at all', () => {
    expect(isReminderOverdue({ dueOdometer: null, dueOn: null }, 999_999, TODAY)).toBe(false)
  })
})
