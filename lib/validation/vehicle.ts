// Validation for vehicle creation and for correcting a component's factory specifications.

import { z } from 'zod'

/** Beyond any odometer ever fitted; a larger figure is a typo, not a vehicle. */
const MAX_PLAUSIBLE_ODOMETER = 2_000_000

export const vehicleSchema = z.object({
  year: z.number().int().min(1900).max(2100).nullable(),
  make: z.string().max(60).nullable(),
  model: z.string().max(60).nullable(),
  trim: z.string().max(60).nullable(),
  nickname: z.string().max(60).nullable(),
  /** Decides which energy loggers this vehicle can ever open (FR-029). */
  powerSource: z.enum(['gasoline', 'electric', 'both']),
  /**
   * What the dashboard reads today.
   *
   * A new vehicle has no entries to derive a reading from, so without a
   * starting figure it sits at zero until something is logged — a truck bought
   * at 112,450 miles insisting it has never been driven. Entries only ever
   * raise it from here (FR-025).
   */
  currentOdometer: z.number().int().min(0).max(MAX_PLAUSIBLE_ODOMETER),
})

export type VehicleInput = z.infer<typeof vehicleSchema>

/**
 * Editing an existing vehicle: the same fields, plus which vehicle.
 *
 * The odometer is editable, but only ever as a starting point or a correction:
 * entries raise it and never lower it, so a logged reading always wins over a
 * typed one (FR-025).
 */
export const vehicleUpdateSchema = vehicleSchema.extend({
  vehicleId: z.uuid(),
})

export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>

/**
 * Deleting a vehicle, guarded by retyping its name.
 *
 * A vehicle takes its components, its tags and its entire service history with
 * it, and none of that is recoverable. Retyping the name is the difference
 * between an intention and a mis-tap on a phone held in one hand.
 */
export const vehicleDeleteSchema = z.object({
  vehicleId: z.uuid(),
  confirmationText: z.string().min(1),
  expectedText: z.string().min(1),
})

/** Whether the retyped name matches, ignoring case and stray spaces. */
export function isDeletionConfirmed(confirmationText: string, expectedText: string): boolean {
  return confirmationText.trim().toLowerCase() === expectedText.trim().toLowerCase()
}

export const componentSpecSchema = z.object({
  specKey: z.string().min(1).max(64),
  kind: z.enum(['torque', 'capacity', 'fluid', 'tool', 'part_number', 'interval']),
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(200),
  unit: z.string().max(20),
})

export const saveSpecsSchema = z.object({
  componentId: z.uuid(),
  vehicleSlug: z.string().min(1),
  specs: z.array(componentSpecSchema).max(40),
})

export type SaveSpecsInput = z.infer<typeof saveSpecsSchema>
