// Mints short-lived signed URLs for attachments on a shared passport.
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/constants'

export interface SignedAttachment {
  filename: string
  signedUrl: string
  mimeType: string
}

/**
 * Signs attachment paths that the passport RPC has already authorized.
 *
 * The bucket is private and stays that way. A guest receives a URL that expires
 * in fifteen minutes rather than durable access, so a forwarded link stops
 * working long before it can circulate — and revoking the share stops new ones
 * from being minted at all.
 *
 * The paths are never taken from the request. They come from the RPC, which has
 * already checked the token and applied the owner's redaction choices; this
 * function only turns authorized paths into fetchable ones.
 */
export async function signPassportAttachments(
  attachments: Array<{ storagePath: string; filename: string; mimeType: string }>,
): Promise<SignedAttachment[]> {
  if (attachments.length === 0) return []

  const admin = createAdminClient()

  const { data, error } = await admin.storage.from('attachments').createSignedUrls(
    attachments.map((attachment) => attachment.storagePath),
    SIGNED_URL_TTL_SECONDS,
  )

  if (error || !data) return []

  return data.flatMap((signed, index) => {
    const source = attachments[index]
    if (!signed.signedUrl || !source) return []
    return [{ filename: source.filename, signedUrl: signed.signedUrl, mimeType: source.mimeType }]
  })
}
