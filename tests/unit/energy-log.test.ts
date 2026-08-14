// Unit tests for the fuel and charging schemas, enforcing the physical bounds in FR-036.

import { describe, expect, it } from 'vitest'
import { energyLogSchema, FUEL_GRADES, CHARGE_LOCATIONS } from '@/lib/validation/energy-log'

const BASE = {
  id: '018f0000-0000-7000-8000-000000000001',
  entryId: '018f0000-0000-7000-8000-000000000002',
  vehicleId: '018f0000-0000-7000-8000-000000000003',
  clientCreatedAt: '2026-06-12T10:00:00Z',
  occurredAt: '2026-06-12T10:00:00Z',
  odometer: 112_450,
}

describe('fuel entries', () => {
  it('accepts a full fill', () => {
    expect(energyLogSchema.safeParse({ ...BASE, mode: 'fuel', volumeGallons: 20 }).success).toBe(
      true,
    )
  })

  it('rejects zero volume, which is a mis-entry rather than a fill', () => {
    expect(energyLogSchema.safeParse({ ...BASE, mode: 'fuel', volumeGallons: 0 }).success).toBe(
      false,
    )
  })

  it('rejects a negative volume', () => {
    expect(energyLogSchema.safeParse({ ...BASE, mode: 'fuel', volumeGallons: -5 }).success).toBe(
      false,
    )
  })

  it('offers diesel and E85 alongside octane ratings', () => {
    expect(FUEL_GRADES).toContain('E85')
    expect(FUEL_GRADES).toContain('diesel')
  })
})

describe('charging sessions', () => {
  const CHARGE = { ...BASE, mode: 'charge' as const, socStartPct: 20, socEndPct: 80, energyKwh: 50 }

  it('accepts a well-formed session', () => {
    expect(energyLogSchema.safeParse(CHARGE).success).toBe(true)
  })

  it('rejects an ending charge below the starting charge', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, socStartPct: 80, socEndPct: 20 }).success).toBe(
      false,
    )
  })

  it('accepts a session that added nothing, which a stalled charger produces', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, socStartPct: 50, socEndPct: 50 }).success).toBe(
      true,
    )
  })

  it('rejects a state of charge above 100 percent', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, socEndPct: 120 }).success).toBe(false)
  })

  it('rejects a negative state of charge', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, socStartPct: -5 }).success).toBe(false)
  })

  it('rejects zero energy delivered', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, energyKwh: 0 }).success).toBe(false)
  })

  it('rejects an unknown charging location', () => {
    expect(energyLogSchema.safeParse({ ...CHARGE, chargeLocation: 'marina' }).success).toBe(false)
  })

  it('offers the three location types that drive cost comparison', () => {
    expect(CHARGE_LOCATIONS.map((entry) => entry.value)).toEqual(['home', 'work', 'public_fast'])
  })
})

describe('mode discrimination', () => {
  it('rejects an entry with no mode', () => {
    expect(energyLogSchema.safeParse({ ...BASE, volumeGallons: 20 }).success).toBe(false)
  })

  it('rejects an unknown mode', () => {
    expect(energyLogSchema.safeParse({ ...BASE, mode: 'hydrogen' }).success).toBe(false)
  })
})
