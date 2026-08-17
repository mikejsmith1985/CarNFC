// Server Actions for the claim flow: creating a vehicle, binding a tag to a component, and re-binding a tag that moved.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { vehicleSchema, type VehicleInput } from '@/lib/validation/vehicle'
import { buildVehicleSlug, resolveSlugCollision, toSlug } from '@/lib/claim/slug'
import { checkTemplateCompatibility } from '@/lib/claim/compatibility'
import { isZoneKey } from '@/lib/zones/zones'
import type { PowerSource } from '@/types/servicecard'

export type { VehicleInput }

export type ActionResult<PayloadType = undefined> =
  | ({ ok: true } & (PayloadType extends undefined ? object : { data: PayloadType }))
  | { ok: false; error: string }

/**
 * Creates a vehicle for the signed-in owner.
 *
 * Called from inside the claim wizard so someone claiming their first tag never
 * has to leave the flow and lose the pending tag id (US3 scenario 3).
 */
export async function createVehicle(
  input: VehicleInput,
): Promise<ActionResult<{ vehicleId: string; slug: string }>> {
  const parsed = vehicleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the vehicle details.' }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to add a vehicle.' }

  const { data: existing } = await supabase.from('vehicles').select('slug').eq('owner_id', user.id)
  const slug = resolveSlugCollision(
    buildVehicleSlug(parsed.data),
    (existing ?? []).map((row) => row.slug as string),
  )

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      owner_id: user.id,
      slug,
      year: parsed.data.year,
      make: parsed.data.make,
      model: parsed.data.model,
      trim: parsed.data.trim,
      nickname: parsed.data.nickname,
      power_source: parsed.data.powerSource,
    })
    .select('id, slug')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not add that vehicle.' }

  revalidatePath('/garage')

  return { ok: true, data: { vehicleId: data.id as string, slug: data.slug as string } }
}

interface ClaimTagInput {
  tagId: string
  vehicleId: string
  templateKey: string | null
  displayName: string
}

/**
 * Binds a tag to a new component on a vehicle.
 *
 * Slug resolution, template spec copying, and the binding itself run inside one
 * database transaction (`claim_tag`), so a failure part-way through cannot leave
 * a component with no specs or a tag pointing at nothing.
 */
export async function claimTag(
  input: ClaimTagInput,
): Promise<ActionResult<{ vehicleSlug: string; componentSlug: string }>> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to claim this tag.' }
  if (input.displayName.trim() === '') return { ok: false, error: 'Give this component a name.' }

  // Powertrain compatibility is re-checked here even though the picker already
  // filtered the library: a fuel-door tag on an electric car produces a card
  // that can never be used, and the tag would have to be peeled off again.
  const compatibilityError = await checkPowertrainFit(supabase, input)
  if (compatibilityError) return { ok: false, error: compatibilityError }

  const { data, error } = await supabase.rpc('claim_tag', {
    p_tag_id: input.tagId,
    p_vehicle_id: input.vehicleId,
    p_component_slug: toSlug(input.displayName) || 'component',
    p_template_key: input.templateKey,
    p_display_name: input.displayName.trim(),
  })

  if (error) return { ok: false, error: translateClaimError(error.message) }

  const payload = data as { vehicle_slug: string; component_slug: string } | null
  if (!payload) return { ok: false, error: 'Could not claim that tag.' }

  revalidatePath('/garage')

  return {
    ok: true,
    data: { vehicleSlug: payload.vehicle_slug, componentSlug: payload.component_slug },
  }
}

/**
 * Re-points an already-claimed tag at a different component.
 *
 * A tag that gets peeled off a differential and stuck on a transfer case keeps
 * its identifier — the physical tag cannot be reprogrammed, so only the binding
 * moves (FR-046).
 */
export async function rebindTag(
  tagId: string,
  vehicleId: string,
  componentId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to move this tag.' }

  const { error } = await supabase
    .from('tags')
    .update({ vehicle_id: vehicleId, component_id: componentId })
    .eq('id', tagId)
    .eq('claimed_by', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/garage')
  return { ok: true }
}

/** Rejects an energy-port template whose mode the vehicle's powertrain cannot use. */
async function checkPowertrainFit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: ClaimTagInput,
): Promise<string | null> {
  if (!input.templateKey) return null

  const { data: template } = await supabase
    .from('component_templates')
    .select('key, display_name, is_energy_port, energy_mode_hint')
    .eq('key', input.templateKey)
    .single()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('power_source')
    .eq('id', input.vehicleId)
    .single()

  if (!template || !vehicle) return null

  const result = checkTemplateCompatibility(
    {
      key: template.key as string,
      displayName: template.display_name as string,
      isEnergyPort: template.is_energy_port as boolean,
      energyModeHint: template.energy_mode_hint as 'fuel' | 'charge' | null,
    },
    vehicle.power_source as PowerSource,
  )

  return result.isCompatible ? null : result.message
}

/** Turns a raised Postgres exception into something an owner can act on. */
function translateClaimError(raw: string): string {
  if (raw.includes('tag_already_claimed')) {
    return 'This tag is already claimed by another account.'
  }
  if (raw.includes('vehicle_not_owned')) return 'That vehicle is not yours.'
  if (raw.includes('tag_not_found')) return 'That tag is not recognized.'
  return raw
}

/**
 * Binds a tag to a working zone rather than to a single part.
 *
 * One badge where a person already stands, covering everything they reach from
 * there. The binding is exclusive at the database level — a tag is on a part or
 * on a zone, never both — so this cannot leave a tag pointing at two things
 * (FR-045).
 */
export async function claimZoneTag(
  tagId: string,
  vehicleId: string,
  zoneKey: string,
): Promise<ActionResult<{ vehicleSlug: string; zoneKey: string }>> {
  if (!isZoneKey(zoneKey)) return { ok: false, error: 'Choose where this badge goes.' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to claim this tag.' }

  const { data, error } = await supabase.rpc('claim_zone_tag', {
    p_tag_id: tagId,
    p_vehicle_id: vehicleId,
    p_zone_key: zoneKey,
  })

  if (error) {
    // The database speaks in exception names; an owner needs a sentence.
    const message =
      error.message.includes('tag_not_found') || error.message.includes('vehicle_not_found')
        ? 'That tag could not be claimed.'
        : error.message
    return { ok: false, error: message }
  }

  revalidatePath('/garage')

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    ok: true,
    data: { vehicleSlug: String(payload.vehicle_slug ?? ''), zoneKey },
  }
}
