// Server Action for uploading an attachment's bytes and recording it against its revision.
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAcceptedType } from '@/lib/media/compress-params'
import { ATTACHMENT_MAX_BYTES, BYTES_PER_KILOBYTE } from '@/lib/constants'

export type UploadResult = { ok: true } | { ok: false; error: string }

interface UploadInput {
  attachmentId: string
  revisionId: string
  vehicleId: string
  filename: string
  mimeType: string
  bytes: ArrayBuffer
}

/**
 * Uploads one attachment and links it to its revision.
 *
 * The storage path starts with the owner's id, which is what the bucket policy
 * keys on — the path is the authorization boundary, so it is built here from
 * the session rather than accepted from the client.
 *
 * Uploads are content-addressed by attachment id and use upsert, so a retry
 * after an ambiguous failure overwrites itself instead of leaving a duplicate
 * object behind (FR-026c).
 */
export async function uploadAttachment(input: UploadInput): Promise<UploadResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to attach files.' }

  if (!isAcceptedType(input.mimeType)) {
    return { ok: false, error: `${input.filename} is not a photo or PDF.` }
  }

  if (input.bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    const megabytes = Math.round(ATTACHMENT_MAX_BYTES / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE))
    return { ok: false, error: `${input.filename} is over the ${megabytes} MB limit.` }
  }

  const storagePath = `${user.id}/${input.vehicleId}/${input.attachmentId}`

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: true })

  if (uploadError) return { ok: false, error: uploadError.message }

  const { error: recordError } = await supabase.from('attachments').upsert(
    {
      id: input.attachmentId,
      revision_id: input.revisionId,
      storage_path: storagePath,
      original_filename: input.filename,
      mime_type: input.mimeType,
      byte_size: input.bytes.byteLength,
      state: 'uploaded',
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )

  if (recordError) return { ok: false, error: recordError.message }

  return { ok: true }
}
