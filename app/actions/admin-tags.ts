// Server Actions for the production side: making and inspecting batches of tags.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateTagBatch } from '@/lib/tags/generate'
import { clampProductionBatchSize } from '@/lib/tags/batch'
import type { ActionResult } from '@/app/actions/claim'

export interface TagBatchSummary {
  id: string
  label: string
  note: string | null
  createdAt: string
  tagCount: number
  claimedCount: number
}

export interface BatchTag {
  tagId: string
  isClaimed: boolean
  claimedAt: string | null
}

/** Whether the signed-in account may see the production tools at all. */
export async function isAdminAccount(): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('is_admin')
  return !error && data === true
}

/**
 * Mints a run of tags with no owner, ready to be written and shipped.
 *
 * Left deliberately unclaimed: the buyer is unknown at manufacture, so the
 * first person to tap one becomes its owner. The identifiers come from the same
 * generator an owner's blank tag uses, so there is one definition of what a tag
 * identifier is.
 */
export async function createTagBatch(
  label: string,
  note: string,
  requestedCount: number,
): Promise<ActionResult<{ batchId: string; tagCount: number }>> {
  const trimmedLabel = label.trim()
  if (trimmedLabel === '') return { ok: false, error: 'Give the run a name.' }

  const count = clampProductionBatchSize(requestedCount)

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('admin_create_tag_batch', {
    p_label: trimmedLabel,
    p_note: note,
    p_tag_ids: generateTagBatch(count),
  })

  if (error) {
    return {
      ok: false,
      error: error.message.includes('not_permitted')
        ? 'This account cannot make tags.'
        : error.message,
    }
  }

  revalidatePath('/admin/tags')

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    ok: true,
    data: { batchId: String(payload.batch_id ?? ''), tagCount: Number(payload.tag_count ?? 0) },
  }
}

/** Every run made so far, newest first, with how many have been claimed. */
export async function listTagBatches(): Promise<TagBatchSummary[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('admin_list_tag_batches')
  if (error) return []

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    note: (row.note as string | null) ?? null,
    createdAt: String(row.created_at),
    tagCount: Number(row.tag_count ?? 0),
    claimedCount: Number(row.claimed_count ?? 0),
  }))
}

/** Every tag in one run, for handing to an encoder or checking what shipped. */
export async function readBatchTags(batchId: string): Promise<BatchTag[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('admin_batch_tags', { p_batch_id: batchId })
  if (error) return []

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    tagId: String(row.tag_id),
    isClaimed: row.is_claimed === true,
    claimedAt: (row.claimed_at as string | null) ?? null,
  }))
}
