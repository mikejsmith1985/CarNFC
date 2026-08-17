// Unit tests for vehicle and component-spec validation.

import { describe, expect, it } from 'vitest'
import {
  vehicleSchema,
  saveSpecsSchema,
  vehicleUpdateSchema,
  isDeletionConfirmed,
} from '@/lib/validation/vehicle'

const VEHICLE = {
  year: 2014,
  make: 'Ford',
  model: 'F-150',
  trim: 'Raptor',
  nickname: 'Raptor',
  powerSource: 'gasoline' as const,
}

describe('vehicleSchema', () => {
  it('accepts a fully described vehicle', () => {
    expect(vehicleSchema.safeParse(VEHICLE).success).toBe(true)
  })

  it('accepts a vehicle described only by nickname', () => {
    const result = vehicleSchema.safeParse({
      year: null,
      make: null,
      model: null,
      trim: null,
      nickname: 'Project truck',
      powerSource: 'both',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an implausible year', () => {
    expect(vehicleSchema.safeParse({ ...VEHICLE, year: 1492 }).success).toBe(false)
  })

  it('rejects an unknown power source', () => {
    // This decides which energy loggers the vehicle can ever open.
    expect(vehicleSchema.safeParse({ ...VEHICLE, powerSource: 'steam' }).success).toBe(false)
  })

  it('accepts each supported power source', () => {
    for (const powerSource of ['gasoline', 'electric', 'both']) {
      expect(vehicleSchema.safeParse({ ...VEHICLE, powerSource }).success).toBe(true)
    }
  })
})

describe('saveSpecsSchema', () => {
  const INPUT = {
    componentId: '018f0000-0000-7000-8000-000000000001',
    vehicleSlug: 'raptor',
    specs: [
      {
        specKey: 'drain_torque',
        kind: 'torque' as const,
        label: 'Drain torque',
        value: '24',
        unit: 'ft-lbs',
      },
    ],
  }

  it('accepts a well-formed specification set', () => {
    expect(saveSpecsSchema.safeParse(INPUT).success).toBe(true)
  })

  it('rejects an empty label, which would render as a blank HUD row', () => {
    const result = saveSpecsSchema.safeParse({
      ...INPUT,
      specs: [{ ...INPUT.specs[0]!, label: '' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty value', () => {
    const result = saveSpecsSchema.safeParse({
      ...INPUT,
      specs: [{ ...INPUT.specs[0]!, value: '' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown spec kind', () => {
    const result = saveSpecsSchema.safeParse({
      ...INPUT,
      specs: [{ ...INPUT.specs[0]!, kind: 'colour' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a component with no specs at all', () => {
    expect(saveSpecsSchema.safeParse({ ...INPUT, specs: [] }).success).toBe(true)
  })
})

describe('vehicleUpdateSchema', () => {
  const validUpdate = {
    vehicleId: '018f8f7e-6a3e-7c2b-9f1a-2b3c4d5e6f70',
    year: 2014,
    make: 'Ford',
    model: 'F-150',
    trim: 'Raptor',
    nickname: 'Raptor',
    powerSource: 'gasoline' as const,
  }

  it('accepts an edit to an existing vehicle', () => {
    expect(vehicleUpdateSchema.safeParse(validUpdate).success).toBe(true)
  })

  it('refuses an edit that names no vehicle', () => {
    const { vehicleId: _omitted, ...withoutId } = validUpdate
    expect(vehicleUpdateSchema.safeParse(withoutId).success).toBe(false)
  })

  it('refuses a vehicle id that is not an id', () => {
    expect(vehicleUpdateSchema.safeParse({ ...validUpdate, vehicleId: 'raptor' }).success).toBe(
      false,
    )
  })

  it('allows every identity field to be cleared', () => {
    const cleared = {
      ...validUpdate,
      year: null,
      make: null,
      model: null,
      trim: null,
      nickname: null,
    }
    expect(vehicleUpdateSchema.safeParse(cleared).success).toBe(true)
  })

  it('has no odometer field, because the odometer is derived (FR-025)', () => {
    const parsed = vehicleUpdateSchema.safeParse({ ...validUpdate, currentOdometer: 999 })
    expect(parsed.success && 'currentOdometer' in parsed.data).toBe(false)
  })
})

describe('isDeletionConfirmed', () => {
  it('accepts the name typed back exactly', () => {
    expect(isDeletionConfirmed('Raptor', 'Raptor')).toBe(true)
  })

  it('forgives case, because a phone keyboard capitalises on its own', () => {
    expect(isDeletionConfirmed('raptor', 'Raptor')).toBe(true)
  })

  it('forgives surrounding spaces', () => {
    expect(isDeletionConfirmed('  Raptor  ', 'Raptor')).toBe(true)
  })

  it('refuses a different name', () => {
    expect(isDeletionConfirmed('Ranger', 'Raptor')).toBe(false)
  })

  it('refuses an empty confirmation', () => {
    expect(isDeletionConfirmed('', 'Raptor')).toBe(false)
  })

  it('refuses a partial match, so a half-typed name cannot delete', () => {
    expect(isDeletionConfirmed('Rap', 'Raptor')).toBe(false)
  })
})
