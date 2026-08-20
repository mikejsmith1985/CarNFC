// Server Action for minting tag addresses an owner can write to blank hardware.
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateTagBatch } from '@/lib/tags/generate'
import { clampTagBatchSize } from '@/lib/tags/batch'
import type { ActionResult } from '@/app/actions/claim'

/**
 * Reserves tag addresses for the signed-in owner.
 *
 * Someone with blank tags has nothing to write until the product gives them an
 * address, and until now the only source was a script run by hand. The rows are
 * created with the owner recorded and nothing else bound, which is the same
 * state a factory-minted tag arrives in — so a tap still opens the claim flow —
 * except that `claim_tag` will only accept them from this owner.
 */
export async function mintTagAddresses(
  requestedCount: number,
): Promise<ActionResult<{ tagIds: string[] }>> {
  const count = clampTagBatchSize(requestedCount)

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to get a tag address.' }

  const tagIds = generateTagBatch(count)

  const { error } = await supabase
    .from('tags')
    .insert(tagIds.map((id) => ({ id, claimed_by: user.id })))

  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { tagIds } }
}
