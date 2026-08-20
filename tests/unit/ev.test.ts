// Unit tests for EV efficiency arithmetic, checked against hand calculation (SC-006).

import { describe, expect, it } from 'vitest'
import {
  calculateAverageMilesPerKwh,
  calculateChargeSession,
  calculateChargeTrend,
  estimateUsablePackKwh,
  type ChargeEntryInput,
} from '@/lib/calc/ev'

function session(overrides: Partial<ChargeEntryInput> = {}): ChargeEntryInput {
  return {
    odometer: 0,
    socStartPct: 20,
    socEndPct: 80,
    energyKwh: 60,
    sessionCost: 9,
    ...overrides,
  }
}

describe('calculateChargeSession', () => {
  it('computes miles per kWh from the distance since the previous energy entry', () => {
    // 200 miles on 50 kWh = 4.00 mi/kWh
    const result = calculateChargeSession(session({ odometer: 15_200, energyKwh: 50 }), 15_000)
    expect(result.milesCovered).toBe(200)
    expect(result.milesPerKwh).toBe(4)
  })

  it('reports Wh/mi as the inverse figure most EV dashboards show', () => {
    // 50 kWh over 200 miles = 250 Wh/mi
    const result = calculateChargeSession(session({ odometer: 15_200, energyKwh: 50 }), 15_000)
    expect(result.wattHoursPerMile).toBe(250)
  })

  it('computes cost per kWh, which is how charging sources actually compare', () => {
    const result = calculateChargeSession(session({ energyKwh: 50, sessionCost: 7.5 }), null)
    expect(result.costPerKwh).toBe(0.15)
  })

  it('computes cost per mile', () => {
    const result = calculateChargeSession(
      session({ odometer: 15_200, energyKwh: 50, sessionCost: 7.5 }),
      15_000,
    )
    expect(result.costPerMile).toBeCloseTo(0.038, 3)
  })

  it('reports charge added as percentage points', () => {
    expect(
      calculateChargeSession(session({ socStartPct: 22, socEndPct: 81 }), null).socGainedPct,
    ).toBe(59)
  })

  it('omits efficiency on the first entry rather than inventing a baseline', () => {
    const result = calculateChargeSession(session(), null)
    expect(result.milesPerKwh).toBeNull()
    expect(result.wattHoursPerMile).toBeNull()
  })

  it('refuses to divide when the odometer did not advance', () => {
    const result = calculateChargeSession(session({ odometer: 15_000 }), 15_000)
    expect(result.milesPerKwh).toBeNull()
  })

  it('still reports cost per kWh when no distance was covered', () => {
    const result = calculateChargeSession(
      session({ odometer: 15_000, energyKwh: 50, sessionCost: 7.5 }),
      15_000,
    )
    expect(result.costPerKwh).toBe(0.15)
  })

  it('omits cost figures when the session cost was left blank', () => {
    const result = calculateChargeSession(session({ odometer: 15_200, sessionCost: null }), 15_000)
    expect(result.costPerKwh).toBeNull()
    expect(result.costPerMile).toBeNull()
  })
})

describe('trend and averages', () => {
  const sessions = [
    session({ odometer: 15_000 }),
    session({ odometer: 15_200, energyKwh: 50 }),
    session({ odometer: 15_400, energyKwh: 40 }),
  ]

  it('returns one point per session', () => {
    expect(calculateChargeTrend(sessions)).toHaveLength(3)
  })

  it('averages only the sessions that produced a figure', () => {
    // 200/50 = 4.0 and 200/40 = 5.0; the first session contributes nothing.
    expect(calculateAverageMilesPerKwh(sessions)).toBe(4.5)
  })
})

describe('estimateUsablePackKwh', () => {
  it('extrapolates pack capacity from the fraction the session filled', () => {
    // 60 kWh added over 60 percentage points implies a 100 kWh usable pack.
    expect(estimateUsablePackKwh(session({ socStartPct: 20, socEndPct: 80, energyKwh: 60 }))).toBe(
      100,
    )
  })

  it('returns null when no charge was added, rather than dividing by zero', () => {
    expect(estimateUsablePackKwh(session({ socStartPct: 50, socEndPct: 50 }))).toBeNull()
  })
})
