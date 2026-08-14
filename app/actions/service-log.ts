// Server Action for recording a service entry. Re-validates everything the client sent, then inserts idempotently.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { serviceLogSchema, type ServiceLogDraft } from '@/lib/validation/service-log'
import type { LogCategory, SpecKind } from '@/types/servicecard'

interface SubmitInput {
  revisionId: string
  entryId: string
  componentId: string
  vehicleSlug: string
  category: LogCategory
  draft: ServiceLogDraft
  specOverrides: Array<{
    specKey: string
    kind: SpecKind
    label: string
    newValue: string
    unit: string
    supersededValue: string | null
  }>
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * Records one service entry.
 *
 * The client already validated with the same Zod schema, and it is re-validated
 * here anyway: a device that has been offline for days cannot be trusted to have
 * run the current version of that check.
 */
export async function submitServiceRevision(input: SubmitInput): Promise<SubmitResult> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to record this entry.' }

  const candidate = buildCandidate(input)
  const parsed = serviceLogSchema.safeParse(candidate)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { ok: false, error: firstIssue?.message ?? 'That entry could not be saved.' }
  }

  // The entry identity row. `ON CONFLICT DO NOTHING` makes a replayed submission
  // — the same record retried after an ambiguous failure — a no-op (FR-041).
  const { error: entryError } = await supabase
    .from('service_entries')
    .upsert(
      { id: input.entryId, component_id: input.componentId, created_by: user.id },
      { onConflict: 'id', ignoreDuplicates: true },
    )

  if (entryError) return { ok: false, error: entryError.message }

  const { error: revisionError } = await supabase
    .from('service_entry_revisions')
    .upsert(toRevisionRow(input, user.id), { onConflict: 'id', ignoreDuplicates: true })

  if (revisionError) return { ok: false, error: revisionError.message }

  if (input.category === 'upgrade' && input.specOverrides.length > 0) {
    const { error: overrideError } = await supabase.from('spec_overrides').insert(
      input.specOverrides
        .filter((override) => override.specKey !== '' && override.newValue !== '')
        .map((override) => ({
          revision_id: input.revisionId,
          component_id: input.componentId,
          spec_key: override.specKey,
          kind: override.kind,
          label: override.label,
          new_value: override.newValue,
          unit: override.unit || null,
          superseded_value: override.supersededValue,
        })),
    )
    if (overrideError) return { ok: false, error: overrideError.message }
  }

  // Reminders and next-due indicators are derived, so they are rebuilt rather
  // than patched. Idempotent, so a retried sync is safe (FR-027c).
  await supabase.rpc('recompute_component_derived', { p_component_id: input.componentId })

  revalidatePath(`/v/${input.vehicleSlug}`, 'layout')

  return { ok: true }
}

/** Shapes the raw form strings into the discriminated union the schema expects. */
function buildCandidate(input: SubmitInput): Record<string, unknown> {
  const { draft, category } = input

  const shared = {
    id: input.revisionId,
    entryId: input.entryId,
    componentId: input.componentId,
    clientCreatedAt: new Date().toISOString(),
    performedOn: draft.performedOn,
    odometer: toNumber(draft.odometer) ?? 0,
    notes: emptyToNull(draft.notes),
    category,
  }

  switch (category) {
    case 'maintenance':
      return {
        ...shared,
        fluidType: emptyToNull(draft.fluidType),
        quantity: toNumber(draft.quantity),
        quantityUnit: emptyToNull(draft.quantityUnit),
        filterPartNumber: emptyToNull(draft.filterPartNumber),
        appliedTorque: emptyToNull(draft.appliedTorque),
        nextIntervalMiles: toNumber(draft.nextIntervalMiles),
        nextIntervalDays: toNumber(draft.nextIntervalDays),
      }
    case 'repair':
      return {
        ...shared,
        symptom: emptyToNull(draft.symptom),
        diagnosis: emptyToNull(draft.diagnosis),
        actionTaken: emptyToNull(draft.actionTaken),
        recheckMiles: toNumber(draft.recheckMiles),
        recheckDays: toNumber(draft.recheckDays),
      }
    case 'replace':
      return {
        ...shared,
        oldPartNumber: emptyToNull(draft.oldPartNumber),
        newPartNumber: emptyToNull(draft.newPartNumber),
        brand: emptyToNull(draft.brand),
        supplier: emptyToNull(draft.supplier),
        cost: toNumber(draft.cost),
        warrantyExpiresOn: emptyToNull(draft.warrantyExpiresOn),
      }
    case 'upgrade':
      return {
        ...shared,
        upgradeBrand: emptyToNull(draft.upgradeBrand),
        productName: emptyToNull(draft.productName),
        installNotes: emptyToNull(draft.installNotes),
        referenceUrl: emptyToNull(draft.referenceUrl),
        specOverrides: input.specOverrides.map((override) => ({
          specKey: override.specKey,
          kind: override.kind,
          label: override.label,
          newValue: override.newValue,
          unit: override.unit || null,
          supersededValue: override.supersededValue,
        })),
      }
  }
}

/** Maps the validated draft onto the revision table's snake_case columns. */
function toRevisionRow(input: SubmitInput, authorId: string): Record<string, unknown> {
  const { draft, category } = input

  const base = {
    id: input.revisionId,
    entry_id: input.entryId,
    supersedes_revision_id: null,
    is_tombstone: false,
    author_id: authorId,
    client_created_at: new Date().toISOString(),
    category,
    performed_on: draft.performedOn,
    odometer: toNumber(draft.odometer),
    notes: emptyToNull(draft.notes),
  }

  // Only the selected category's columns are populated. The database CHECK
  // constraint rejects the row outright if anything else slips through.
  switch (category) {
    case 'maintenance':
      return {
        ...base,
        fluid_type: emptyToNull(draft.fluidType),
        quantity: toNumber(draft.quantity),
        quantity_unit: emptyToNull(draft.quantityUnit),
        filter_part_number: emptyToNull(draft.filterPartNumber),
        applied_torque: emptyToNull(draft.appliedTorque),
        next_interval_miles: toNumber(draft.nextIntervalMiles),
        next_interval_days: toNumber(draft.nextIntervalDays),
      }
    case 'repair':
      return {
        ...base,
        symptom: emptyToNull(draft.symptom),
        diagnosis: emptyToNull(draft.diagnosis),
        action_taken: emptyToNull(draft.actionTaken),
        recheck_miles: toNumber(draft.recheckMiles),
        recheck_days: toNumber(draft.recheckDays),
      }
    case 'replace':
      return {
        ...base,
        old_part_number: emptyToNull(draft.oldPartNumber),
        new_part_number: emptyToNull(draft.newPartNumber),
        brand: emptyToNull(draft.brand),
        supplier: emptyToNull(draft.supplier),
        cost: toNumber(draft.cost),
        warranty_expires_on: emptyToNull(draft.warrantyExpiresOn),
      }
    case 'upgrade':
      return {
        ...base,
        upgrade_brand: emptyToNull(draft.upgradeBrand),
        product_name: emptyToNull(draft.productName),
        install_notes: emptyToNull(draft.installNotes),
        reference_url: emptyToNull(draft.referenceUrl),
      }
  }
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyToNull(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null
  return raw
}
