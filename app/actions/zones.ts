// Server Action for saying which zone a part belongs to.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isZoneKey, NO_ZONE } from '@/lib/zones/zones'
import type { ActionResult } from '@/app/actions/claim'

/**
 * Moves a part into a zone, out of every zone, or back to its template default.
 *
 * A part added by hand has no template, so nothing would otherwise know where it
 * is and a zone badge could never reach it. This is how an owner tells it.
 */
export async function setComponentZone(
  componentId: string,
  vehicleSlug: string,
  zoneKey: string | null,
): Promise<ActionResult> {
  // Null is meaningful — it restores the template default — so only a value
  // that is neither null, nor 'none', nor a real zone is a mistake.
  if (zoneKey !== null && zoneKey !== NO_ZONE && !isZoneKey(zoneKey)) {
    return { ok: false, error: 'That is not a zone.' }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to change this.' }

  // Row Level Security already limits this to components on the owner's own
  // vehicles; there is no owner column here to match on directly.
  const { error } = await supabase
    .from('components')
    .update({ zone_key: zoneKey })
    .eq('id', componentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/v/${vehicleSlug}`)

  return { ok: true }
}
