// Validation for vehicle creation and for correcting a component's factory specifications.

import { z } from 'zod'

export const vehicleSchema = z.object({
  year: z.number().int().min(1900).max(2100).nullable(),
  make: z.string().max(60).nullable(),
  model: z.string().max(60).nullable(),
  trim: z.string().max(60).nullable(),
  nickname: z.string().max(60).nullable(),
  /** Decides which energy loggers this vehicle can ever open (FR-029). */
  powerSource: z.enum(['gasoline', 'electric', 'both']),
})

export type VehicleInput = z.infer<typeof vehicleSchema>

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
