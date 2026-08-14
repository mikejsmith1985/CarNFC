// Server Actions for editing and deleting a log entry — both of which write a new revision rather than changing an old one.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { serviceTombstoneSchema } from '@/lib/validation/service-log'

export type ReviseResult = { ok: true } | { ok: false; error: string }

interface TombstoneInput {
  revisionId: string
  entryId: string
  componentId: string
  supersedesRevisionId: string
  vehicleSlug: string
}

/**
 * Deletes an entry by writing a tombstone that supersedes its current revision.
 *
 * Nothing is removed. The superseded revision stays on record, which is what
 * lets two devices that both acted on the entry offline converge without either
 * one's work disappearing — and what makes a shared passport a record that
 * cannot be quietly rewritten (FR-027).
 *
 * The database will refuse an actual DELETE here regardless: the privilege was
 * revoked. This is the supported way to remove something from view.
 */
export async function tombstoneServiceEntry(input: TombstoneInput): Promise<ReviseResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to delete this entry.' }

  const parsed = serviceTombstoneSchema.safeParse({
    id: input.revisionId,
    entryId: input.entryId,
    componentId: input.componentId,
    supersedesRevisionId: input.supersedesRevisionId,
    clientCreatedAt: new Date().toISOString(),
    isTombstone: true,
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'That entry could not be deleted.',
    }
  }

  const { error } = await supabase.from('service_entry_revisions').upsert(
    {
      id: input.revisionId,
      entry_id: input.entryId,
      supersedes_revision_id: input.supersedesRevisionId,
      is_tombstone: true,
      author_id: user.id,
      client_created_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  if (error) return { ok: false, error: error.message }

  // Reminders and next-due indicators derived from the removed entry have to go
  // with it, or the card would keep counting down to a service that no longer
  // exists (FR-027c).
  await supabase.rpc('recompute_component_derived', { p_component_id: input.componentId })

  revalidatePath(`/v/${input.vehicleSlug}`, 'layout')
  return { ok: true }
}

/**
 * Marks a reminder as dealt with.
 *
 * Completing rather than deleting: the reminder records that a re-check was
 * asked for and answered, which is part of the repair's story.
 */
export async function completeReminder(
  reminderId: string,
  vehicleSlug: string,
): Promise<ReviseResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to update this reminder.' }

  const { error } = await supabase
    .from('reminders')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', reminderId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/v/${vehicleSlug}`, 'layout')
  return { ok: true }
}
