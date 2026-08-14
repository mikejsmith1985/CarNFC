// Server Action for recording a fuel-up or charging session.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { energyLogSchema } from '@/lib/validation/energy-log'
import type { EnergyMode } from '@/types/servicecard'

interface SubmitEnergyInput {
  revisionId: string
  entryId: string
  vehicleId: string
  vehicleSlug: string
  mode: EnergyMode
  payload: Record<string, unknown>
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

/**
 * Records one energy entry against the vehicle.
 *
 * Entries are vehicle-scoped rather than component-scoped so a plug-in hybrid's
 * fuel and charge sessions interleave on one continuous odometer axis, which is
 * what makes economy comparable across both tag types (FR-037).
 */
export async function submitEnergyRevision(input: SubmitEnergyInput): Promise<SubmitResult> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to record this entry.' }

  const parsed = energyLogSchema.safeParse({
    id: input.revisionId,
    entryId: input.entryId,
    vehicleId: input.vehicleId,
    clientCreatedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    mode: input.mode,
    ...input.payload,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { ok: false, error: firstIssue?.message ?? 'That entry could not be saved.' }
  }

  const { error: entryError } = await supabase
    .from('energy_entries')
    .upsert(
      { id: input.entryId, vehicle_id: input.vehicleId, created_by: user.id },
      { onConflict: 'id', ignoreDuplicates: true },
    )

  if (entryError) return { ok: false, error: entryError.message }

  const { error: revisionError } = await supabase
    .from('energy_entry_revisions')
    .upsert(toEnergyRevisionRow(input, user.id), { onConflict: 'id', ignoreDuplicates: true })

  if (revisionError) return { ok: false, error: revisionError.message }

  revalidatePath(`/v/${input.vehicleSlug}`, 'layout')

  return { ok: true }
}

/** Maps the validated payload onto the revision table's mode-exclusive columns. */
function toEnergyRevisionRow(input: SubmitEnergyInput, authorId: string): Record<string, unknown> {
  const { payload } = input

  const base = {
    id: input.revisionId,
    entry_id: input.entryId,
    supersedes_revision_id: null,
    is_tombstone: false,
    author_id: authorId,
    client_created_at: new Date().toISOString(),
    occurred_at: new Date().toISOString(),
    mode: input.mode,
    odometer: payload.odometer as number,
  }

  if (input.mode === 'fuel') {
    return {
      ...base,
      volume_gallons: payload.volumeGallons ?? null,
      price_per_gallon: payload.pricePerGallon ?? null,
      total_cost: payload.totalCost ?? null,
      fuel_grade: payload.fuelGrade ?? null,
      is_full_fill: payload.isFullFill ?? true,
      missed_fill_before: payload.missedFillBefore ?? false,
    }
  }

  return {
    ...base,
    soc_start_pct: payload.socStartPct ?? null,
    soc_end_pct: payload.socEndPct ?? null,
    energy_kwh: payload.energyKwh ?? null,
    charge_location: payload.chargeLocation ?? null,
    location_label: payload.locationLabel ?? null,
    session_cost: payload.sessionCost ?? null,
  }
}
