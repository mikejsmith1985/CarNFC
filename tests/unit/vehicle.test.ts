// Unit tests for vehicle and component-spec validation.

import { describe, expect, it } from 'vitest'
import { vehicleSchema, saveSpecsSchema } from '@/lib/validation/vehicle'

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
