// Unit tests for fuel economy arithmetic. Pure functions, no I/O — Article V requires these to run under 10ms.

import { describe, expect, it } from 'vitest'
import {
  calculateAverageMpg,
  calculateFuelInterval,
  calculateFuelTrend,
  calculateTotalFuelCost,
  deriveFuelCostFields,
  type FuelEntryInput,
} from '@/lib/calc/fuel'

function fill(overrides: Partial<FuelEntryInput> = {}): FuelEntryInput {
  return {
    odometer: 0,
    volumeGallons: 20,
    pricePerGallon: 3.5,
    totalCost: 70,
    isFullFill: true,
    missedFillBefore: false,
    ...overrides,
  }
}

describe('deriveFuelCostFields', () => {
  it('derives total cost from volume and unit price', () => {
    const result = deriveFuelCostFields({
      volumeGallons: 20,
      pricePerGallon: 3.5,
      totalCost: null,
    })
    expect(result.totalCost).toBe(70)
  })

  it('derives unit price from volume and total cost', () => {
    const result = deriveFuelCostFields({ volumeGallons: 20, pricePerGallon: null, totalCost: 70 })
    expect(result.pricePerGallon).toBe(3.5)
  })

  it('derives volume from unit price and total cost', () => {
    const result = deriveFuelCostFields({ volumeGallons: null, pricePerGallon: 3.5, totalCost: 70 })
    expect(result.volumeGallons).toBe(20)
  })

  it('never overwrites a value the owner already entered', () => {
    const result = deriveFuelCostFields({ volumeGallons: 20, pricePerGallon: 3.5, totalCost: 99 })
    expect(result.totalCost).toBe(99)
  })

  it('leaves everything null when only one value is known', () => {
    const result = deriveFuelCostFields({
      volumeGallons: 20,
      pricePerGallon: null,
      totalCost: null,
    })
    expect(result.pricePerGallon).toBeNull()
    expect(result.totalCost).toBeNull()
  })
})

describe('calculateFuelInterval', () => {
  it('computes the worked example from quickstart V4: 300 miles on 20 gallons is 15.0 mpg', () => {
    const result = calculateFuelInterval(
      fill({ odometer: 112_750, volumeGallons: 20 }),
      fill({ odometer: 112_450 }),
    )
    expect(result.milesCovered).toBe(300)
    expect(result.milesPerGallon).toBe(15)
    expect(result.gap).toBeNull()
  })

  it('computes cost per mile from the fill that closed the interval', () => {
    const result = calculateFuelInterval(
      fill({ odometer: 112_750, volumeGallons: 20, totalCost: 70 }),
      fill({ odometer: 112_450 }),
    )
    expect(result.costPerMile).toBeCloseTo(0.233, 3)
  })

  it('reports first_entry rather than a misleading zero on the first fill', () => {
    const result = calculateFuelInterval(fill({ odometer: 112_450 }), null)
    expect(result.milesPerGallon).toBeNull()
    expect(result.gap).toBe('first_entry')
  })

  it('excludes an interval opened by a partial fill, since the tank level is unknown', () => {
    const result = calculateFuelInterval(
      fill({ odometer: 112_750 }),
      fill({ odometer: 112_450, isFullFill: false }),
    )
    expect(result.milesPerGallon).toBeNull()
    expect(result.gap).toBe('partial_fill')
  })

  it('excludes an interval closed by a partial fill', () => {
    const result = calculateFuelInterval(
      fill({ odometer: 112_750, isFullFill: false }),
      fill({ odometer: 112_450 }),
    )
    expect(result.gap).toBe('partial_fill')
  })

  it('excludes an interval where a fill went unrecorded', () => {
    const result = calculateFuelInterval(
      fill({ odometer: 112_750, missedFillBefore: true }),
      fill({ odometer: 112_450 }),
    )
    expect(result.gap).toBe('missed_fill')
  })

  it('refuses to divide when the odometer did not advance', () => {
    const result = calculateFuelInterval(fill({ odometer: 112_450 }), fill({ odometer: 112_450 }))
    expect(result.milesPerGallon).toBeNull()
    expect(result.gap).toBe('no_distance')
  })

  it('handles a corrected odometer that moved backwards without producing a negative mpg', () => {
    const result = calculateFuelInterval(fill({ odometer: 112_000 }), fill({ odometer: 112_450 }))
    expect(result.milesPerGallon).toBeNull()
    expect(result.gap).toBe('no_distance')
  })
})

describe('calculateFuelTrend and averages', () => {
  const entries = [
    fill({ odometer: 112_450 }),
    fill({ odometer: 112_750, volumeGallons: 20 }),
    fill({ odometer: 113_050, volumeGallons: 15 }),
  ]

  it('returns one point per entry, oldest first', () => {
    expect(calculateFuelTrend(entries)).toHaveLength(3)
  })

  it('averages only the intervals that produced a figure', () => {
    // 300/20 = 15.0 and 300/15 = 20.0; the first entry contributes nothing.
    expect(calculateAverageMpg(entries)).toBe(17.5)
  })

  it('returns null rather than zero when nothing is measurable', () => {
    expect(calculateAverageMpg([fill({ odometer: 100 })])).toBeNull()
  })

  it('counts the cost of a partial fill even though its economy is excluded', () => {
    const withPartial = [
      fill({ odometer: 112_450, totalCost: 70 }),
      fill({ odometer: 112_600, totalCost: 30, isFullFill: false }),
    ]
    expect(calculateTotalFuelCost(withPartial)).toBe(100)
  })

  it('falls back to unit price when total cost was never entered', () => {
    expect(calculateTotalFuelCost([fill({ totalCost: null, pricePerGallon: 3.5 })])).toBe(70)
  })
})
