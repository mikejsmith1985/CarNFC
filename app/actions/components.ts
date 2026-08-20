// Server Actions for putting parts on a vehicle without a tag for each one.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/app/actions/claim'

/** Guards a single request from creating an unbounded number of components. */
const MAX_PARTS_PER_REQUEST = 40

/**
 * Creates the named library parts on a vehicle, skipping any it already has.
 *
 * This is what lets a zone badge mean anything on a fresh vehicle. Before it,
 * a part only existed if a tag had been claimed on it, so a badge covering the
 * engine bay of a vehicle with no per-part tags opened to nothing at all.
 */
export async function addPartsFromLibrary(
  vehicleId: string,
  templateKeys: string[],
): Promise<ActionResult<{ vehicleSlug: string; createdCount: number }>> {
  if (templateKeys.length === 0) return { ok: false, error: 'Pick at least one part to add.' }
  if (templateKeys.length > MAX_PARTS_PER_REQUEST) {
    return { ok: false, error: 'That is more parts than one vehicle has. Add them in batches.' }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to add parts.' }

  const { data, error } = await supabase.rpc('add_components_from_templates', {
    p_vehicle_id: vehicleId,
    p_template_keys: templateKeys,
  })

  if (error) return { ok: false, error: translatePartError(error.message) }

  const payload = data as { vehicle_slug: string; created_slugs: string[] } | null
  if (!payload) return { ok: false, error: 'Could not add those parts.' }

  revalidateVehicle(payload.vehicle_slug)

  return {
    ok: true,
    data: { vehicleSlug: payload.vehicle_slug, createdCount: payload.created_slugs.length },
  }
}

/**
 * Creates one part the seeded library does not cover, named by the owner.
 *
 * It carries no template, so nothing can infer where on the vehicle it sits.
 * When it is named from a zone badge the zone comes with it — otherwise the
 * badge that just created the part would not be able to show it.
 */
export async function addCustomPart(
  vehicleId: string,
  displayName: string,
  zoneKey: string | null = null,
): Promise<ActionResult<{ vehicleSlug: string; componentSlug: string }>> {
  if (displayName.trim() === '') return { ok: false, error: 'Give this part a name.' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to add a part.' }

  const { data, error } = await supabase.rpc('add_custom_component', {
    p_vehicle_id: vehicleId,
    p_display_name: displayName.trim(),
    p_zone_key: zoneKey,
  })

  if (error) return { ok: false, error: translatePartError(error.message) }

  const payload = data as { vehicle_slug: string; component_slug: string } | null
  if (!payload) return { ok: false, error: 'Could not add that part.' }

  revalidateVehicle(payload.vehicle_slug)

  return {
    ok: true,
    data: { vehicleSlug: payload.vehicle_slug, componentSlug: payload.component_slug },
  }
}

/** Refreshes every cached view a new part should appear on. */
function revalidateVehicle(vehicleSlug: string): void {
  revalidatePath('/garage')
  revalidatePath(`/v/${vehicleSlug}`)
  revalidatePath(`/v/${vehicleSlug}/z/[zone_key]`, 'page')
}

/** Turns a raised Postgres exception into something an owner can act on. */
function translatePartError(raw: string): string {
  if (raw.includes('vehicle_not_owned')) return 'That vehicle is not yours.'
  if (raw.includes('unknown_template')) return 'That part is not in the library.'
  if (raw.includes('name_required')) return 'Give this part a name.'
  return raw
}
