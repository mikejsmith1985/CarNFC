// Zod schemas for fuel-ups and charging sessions, enforcing the physical bounds in FR-036.

import { z } from 'zod'
import { SOC_MAX_PCT, SOC_MIN_PCT } from '@/lib/constants'

const isoTimestamp = z.iso.datetime({ offset: true })
const uuid = z.uuid()

const energyLogBase = z.object({
  id: uuid,
  entryId: uuid,
  vehicleId: uuid,
  supersedesRevisionId: uuid.nullable().default(null),
  clientCreatedAt: isoTimestamp,
  occurredAt: isoTimestamp,
  odometer: z.number().int().min(0),
  notes: z.string().max(2000).nullable().default(null),
})

export const fuelLogSchema = energyLogBase.extend({
  mode: z.literal('fuel'),
  volumeGallons: z.number().positive('Volume dispensed must be greater than zero'),
  pricePerGallon: z.number().nonnegative().nullable().default(null),
  totalCost: z.number().nonnegative().nullable().default(null),
  fuelGrade: z.string().max(20).nullable().default(null),
  /** Only a full fill closes an economy interval (FR-033). */
  isFullFill: z.boolean().default(true),
  missedFillBefore: z.boolean().default(false),
})

export const evChargeLogSchema = energyLogBase
  .extend({
    mode: z.literal('charge'),
    socStartPct: z.number().min(SOC_MIN_PCT).max(SOC_MAX_PCT),
    socEndPct: z.number().min(SOC_MIN_PCT).max(SOC_MAX_PCT),
    energyKwh: z.number().positive('Energy delivered must be greater than zero'),
    chargeLocation: z.enum(['home', 'work', 'public_fast']).nullable().default(null),
    locationLabel: z.string().max(120).nullable().default(null),
    sessionCost: z.number().nonnegative().nullable().default(null),
  })
  // A session cannot end with less charge than it started with (FR-036).
  .refine((session) => session.socEndPct >= session.socStartPct, {
    message: 'Ending charge cannot be lower than starting charge',
    path: ['socEndPct'],
  })

export const energyLogSchema = z.discriminatedUnion('mode', [fuelLogSchema, evChargeLogSchema])

export type FuelLogInput = z.infer<typeof fuelLogSchema>
export type EVChargeLogInput = z.infer<typeof evChargeLogSchema>
export type EnergyLogInput = z.infer<typeof energyLogSchema>

/** Fuel grades offered in the picker. E85 and diesel sit alongside octane ratings. */
export const FUEL_GRADES = ['87', '89', '91', '93', 'E85', 'diesel'] as const

/** Charging location types, which drive the cost-per-mile comparison across sources. */
export const CHARGE_LOCATIONS = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'public_fast', label: 'Public DC Fast' },
] as const
