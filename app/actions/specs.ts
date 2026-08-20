// Server Action for correcting a component's factory specifications.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { toSlug } from '@/lib/claim/slug'
import { saveSpecsSchema } from '@/lib/validation/vehicle'

export type SaveSpecsResult = { ok: true } | { ok: false; error: string }

/**
 * Replaces a component's factory specification set.
 *
 * The seeded library is a convenience rather than authoritative manufacturer
 * data, so every value it pre-fills has to be correctable (FR-054). Overrides
 * introduced by upgrade entries are untouched: they live on the log that
 * recorded the work, and editing them here would rewrite history.
 */
export async function saveComponentSpecs(input: {
  componentId: string
  vehicleSlug: string
  specs: Array<{ specKey: string; kind: string; label: string; value: string; unit: string }>
}): Promise<SaveSpecsResult> {
  const parsed = saveSpecsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the specification values.',
    }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to edit specifications.' }

  // Replace wholesale rather than diffing. Factory specs are a small set with
  // no history of their own — the recorded history lives in the entry timeline,
  // which this never touches. RLS scopes the delete to the owner's component.
  const { error: deleteError } = await supabase
    .from('component_specs')
    .delete()
    .eq('component_id', parsed.data.componentId)

  if (deleteError) return { ok: false, error: deleteError.message }

  if (parsed.data.specs.length > 0) {
    const { error: insertError } = await supabase.from('component_specs').insert(
      parsed.data.specs.map((spec, index) => ({
        component_id: parsed.data.componentId,
        // A stable key is what an upgrade override joins against, so it is
        // derived from the label rather than left to a client-supplied value.
        spec_key: toSlug(spec.label).replace(/-/g, '_') || spec.specKey,
        kind: spec.kind,
        label: spec.label,
        value: spec.value,
        unit: spec.unit.trim() === '' ? null : spec.unit,
        sort_order: index,
      })),
    )

    if (insertError) return { ok: false, error: insertError.message }
  }

  revalidatePath(`/v/${parsed.data.vehicleSlug}`, 'layout')
  return { ok: true }
}
