// Zod schemas for the four service log categories — one definition shared by the client form and the server action.
//
// A device that has been offline for days cannot be trusted to have validated
// correctly, so the server re-validates with exactly these schemas rather than a
// parallel set that could drift from them.

import { z } from 'zod'

const isoDate = z.iso.date()
const isoTimestamp = z.iso.datetime({ offset: true })
const uuid = z.uuid()

/** Fields every service log carries, whatever its category. */
const serviceLogBase = z.object({
  id: uuid,
  entryId: uuid,
  componentId: uuid,
  supersedesRevisionId: uuid.nullable().default(null),
  clientCreatedAt: isoTimestamp,
  performedOn: isoDate,
  odometer: z.number().int().min(0),
  notes: z.string().max(4000).nullable().default(null),
})

/** A specification an upgrade supersedes on its component (FR-009). */
export const specOverrideSchema = z.object({
  specKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Spec keys are lowercase, digits and underscores only'),
  kind: z.enum(['torque', 'capacity', 'fluid', 'tool', 'part_number', 'interval']),
  label: z.string().min(1).max(120),
  newValue: z.string().min(1).max(200),
  unit: z.string().max(20).nullable().default(null),
  supersededValue: z.string().max(200).nullable().default(null),
})

export const maintenanceLogSchema = serviceLogBase.extend({
  category: z.literal('maintenance'),
  fluidType: z.string().max(120).nullable().default(null),
  quantity: z.number().positive().nullable().default(null),
  quantityUnit: z.string().max(20).nullable().default(null),
  filterPartNumber: z.string().max(80).nullable().default(null),
  appliedTorque: z.string().max(80).nullable().default(null),
  nextIntervalMiles: z.number().int().positive().nullable().default(null),
  nextIntervalDays: z.number().int().positive().nullable().default(null),
})

export const repairLogSchema = serviceLogBase.extend({
  category: z.literal('repair'),
  symptom: z.string().max(2000).nullable().default(null),
  diagnosis: z.string().max(2000).nullable().default(null),
  actionTaken: z.string().max(2000).nullable().default(null),
  recheckMiles: z.number().int().positive().nullable().default(null),
  recheckDays: z.number().int().positive().nullable().default(null),
})

export const replaceLogSchema = serviceLogBase.extend({
  category: z.literal('replace'),
  oldPartNumber: z.string().max(80).nullable().default(null),
  newPartNumber: z.string().max(80).nullable().default(null),
  brand: z.string().max(120).nullable().default(null),
  supplier: z.string().max(120).nullable().default(null),
  cost: z.number().nonnegative().nullable().default(null),
  warrantyExpiresOn: isoDate.nullable().default(null),
})

export const upgradeLogSchema = serviceLogBase.extend({
  category: z.literal('upgrade'),
  upgradeBrand: z.string().max(120).nullable().default(null),
  productName: z.string().max(200).nullable().default(null),
  installNotes: z.string().max(4000).nullable().default(null),
  referenceUrl: z.url().max(500).nullable().default(null),
  specOverrides: z.array(specOverrideSchema).max(20).default([]),
})

/**
 * A service log is exactly one of four categories (FR-016).
 * Discriminating on `category` means a Repair carrying a warranty date fails
 * here, and again at the database CHECK constraint if it somehow gets past.
 */
export const serviceLogSchema = z.discriminatedUnion('category', [
  maintenanceLogSchema,
  repairLogSchema,
  replaceLogSchema,
  upgradeLogSchema,
])

/** A deletion: a tombstone revision carrying no content, only the fact of deletion. */
export const serviceTombstoneSchema = z.object({
  id: uuid,
  entryId: uuid,
  componentId: uuid,
  supersedesRevisionId: uuid,
  clientCreatedAt: isoTimestamp,
  isTombstone: z.literal(true),
})

export type ServiceLogInput = z.infer<typeof serviceLogSchema>
export type SpecOverrideInput = z.infer<typeof specOverrideSchema>
export type ServiceTombstoneInput = z.infer<typeof serviceTombstoneSchema>

/** Field names shared by every category, which survive a category switch in the form (FR-017). */
export const SHARED_LOG_FIELDS = ['performedOn', 'odometer', 'notes'] as const

/**
 * Every field the log form can hold, across all four categories, as raw strings.
 *
 * The form holds strings because that is what inputs produce; coercion and
 * validation happen once, at the boundary, against the schemas above. Shared by
 * the modal and the Server Action so the two cannot disagree about the shape.
 */
export interface ServiceLogDraft {
  performedOn: string
  odometer: string
  notes: string
  // Maintenance
  fluidType: string
  quantity: string
  quantityUnit: string
  filterPartNumber: string
  appliedTorque: string
  nextIntervalMiles: string
  nextIntervalDays: string
  // Repair
  symptom: string
  diagnosis: string
  actionTaken: string
  recheckMiles: string
  recheckDays: string
  // Replace
  oldPartNumber: string
  newPartNumber: string
  brand: string
  supplier: string
  cost: string
  warrantyExpiresOn: string
  // Upgrade
  upgradeBrand: string
  productName: string
  installNotes: string
  referenceUrl: string
}
