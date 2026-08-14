// Unit tests for odometer plausibility checks (FR-024, SC-012).

import { describe, expect, it } from 'vitest'
import { checkOdometer, describeOdometerWarning, suggestOdometer } from '@/lib/calc/odometer'
import { ODOMETER_IMPLAUSIBLE_JUMP_MILES } from '@/lib/constants'

describe('checkOdometer', () => {
  it('accepts a reading above the last known value', () => {
    const result = checkOdometer(112_500, 112_450)
    expect(result.isAcceptable).toBe(true)
    expect(result.warning).toBeNull()
  })

  it('accepts a reading equal to the last known value', () => {
    // Two service events on the same day at the same reading is ordinary.
    expect(checkOdometer(112_450, 112_450).isAcceptable).toBe(true)
  })

  it('warns when the reading is below the last known value', () => {
    const result = checkOdometer(112_000, 112_450)
    expect(result.isAcceptable).toBe(false)
    expect(result.warning).toBe('below_last_known')
    expect(result.difference).toBe(-450)
  })

  it('warns on an implausible jump, which is how an extra digit shows up', () => {
    const result = checkOdometer(1_124_500, 112_450)
    expect(result.isAcceptable).toBe(false)
    expect(result.warning).toBe('implausible_jump')
  })

  it('accepts a large but plausible gap between taps', () => {
    const result = checkOdometer(112_450 + ODOMETER_IMPLAUSIBLE_JUMP_MILES, 112_450)
    expect(result.isAcceptable).toBe(true)
  })

  it('accepts anything when there is no prior reading to compare against', () => {
    expect(checkOdometer(112_450, null).isAcceptable).toBe(true)
  })
})

describe('describeOdometerWarning', () => {
  it('names the last recorded reading when the value went backwards', () => {
    const message = describeOdometerWarning(checkOdometer(112_000, 112_450))
    expect(message).toContain('112,450')
  })

  it('names the size of the jump so an extra digit is obvious', () => {
    const message = describeOdometerWarning(checkOdometer(1_124_500, 112_450))
    expect(message).toContain('1,012,050')
  })

  it('returns nothing when there is no warning to describe', () => {
    expect(describeOdometerWarning(checkOdometer(112_500, 112_450))).toBeNull()
  })
})

describe('suggestOdometer', () => {
  const AVERAGE_MILES_PER_DAY = 30

  it('projects forward from the last reading', () => {
    const lastEntry = new Date('2026-08-03T00:00:00Z')
    const today = new Date('2026-08-13T00:00:00Z')
    expect(suggestOdometer(112_450, lastEntry, AVERAGE_MILES_PER_DAY, today)).toBe(112_750)
  })

  it('caps the projection at 30 days so a stored vehicle does not drift', () => {
    const lastEntry = new Date('2026-01-01T00:00:00Z')
    const today = new Date('2026-08-13T00:00:00Z')
    expect(suggestOdometer(112_450, lastEntry, AVERAGE_MILES_PER_DAY, today)).toBe(113_350)
  })

  it('returns the last reading unchanged when there is no entry date', () => {
    expect(suggestOdometer(112_450, null, AVERAGE_MILES_PER_DAY, new Date())).toBe(112_450)
  })

  it('returns null when nothing is known', () => {
    expect(suggestOdometer(null, null, AVERAGE_MILES_PER_DAY, new Date())).toBeNull()
  })
})
