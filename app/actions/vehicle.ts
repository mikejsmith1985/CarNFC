// Server Actions for managing a vehicle after it exists: editing its identity, and removing it entirely.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  isDeletionConfirmed,
  vehicleUpdateSchema,
  type VehicleUpdateInput,
} from '@/lib/validation/vehicle'
import type { ActionResult } from '@/app/actions/claim'

export type { VehicleUpdateInput }

/**
 * Edits a vehicle's identity — year, make, model, trim, nickname, power source.
 *
 * The readable address is left alone on purpose. It is printed on nothing, but
 * it is bookmarked, shared, and reached from a tag, so renaming a vehicle must
 * not break a link somebody already has (FR-001b).
 */
export async function updateVehicle(input: VehicleUpdateInput): Promise<ActionResult> {
  const parsed = vehicleUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the vehicle details.' }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to edit this vehicle.' }

  const { data, error } = await supabase
    .from('vehicles')
    .update({
      year: parsed.data.year,
      make: parsed.data.make,
      model: parsed.data.model,
      trim: parsed.data.trim,
      nickname: parsed.data.nickname,
      power_source: parsed.data.powerSource,
      current_odometer: parsed.data.currentOdometer,
    })
    // Row Level Security already limits this to the owner. Matching on the owner
    // as well turns a policy miss into zero rows rather than a silent success.
    .eq('id', parsed.data.vehicleId)
    .eq('owner_id', user.id)
    .select('slug')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not save that change.' }

  revalidatePath('/garage')
  revalidatePath(`/v/${data.slug as string}`)

  return { ok: true }
}

/**
 * Deletes a vehicle, and with it every component, tag binding and entry.
 *
 * Guarded by retyping the vehicle's name. Nothing here is recoverable: the
 * history is the product, and a mis-tap on a phone held in one hand would
 * destroy years of it. The tags themselves survive as unclaimed hardware, so the
 * physical labels can be reused rather than thrown away.
 */
export async function deleteVehicle(
  vehicleId: string,
  confirmationText: string,
  expectedText: string,
): Promise<ActionResult> {
  if (!isDeletionConfirmed(confirmationText, expectedText)) {
    return { ok: false, error: `Type ${expectedText} exactly to confirm.` }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to delete this vehicle.' }

  // Released before the vehicle goes, so the physical tags become claimable
  // again instead of pointing at something that no longer exists.
  const { error: tagError } = await supabase
    .from('tags')
    .update({ vehicle_id: null, component_id: null, claimed_by: null, claimed_at: null })
    .eq('vehicle_id', vehicleId)
    .eq('claimed_by', user.id)

  if (tagError) return { ok: false, error: tagError.message }

  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/garage')

  return { ok: true }
}
