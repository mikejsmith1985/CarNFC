// Tag entry point: the only address printed onto physical hardware. Resolves an opaque tag id and always redirects.
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TagResolution } from '@/types/servicecard'

/**
 * Resolves a scanned tag and sends the caller onward.
 *
 * This page never renders anything of its own. A tag adhered to a frame rail
 * cannot be reprogrammed, so this address is permanent and everything behind it
 * must stay free to change.
 */
export default async function TagResolverPage({
  params,
}: {
  // Next 16 delivers route params as a Promise. Awaiting is mandatory.
  params: Promise<{ tag_id: string }>
}) {
  const { tag_id: tagId } = await params
  const supabase = await createServerSupabaseClient()

  // Nothing is resolved for a caller with no session, and that is two things at
  // once.
  //
  // It is the difference between working and not working: to anyone signed out,
  // every claimed tag reads as forbidden — including the owner's own, and an
  // owner on a phone is signed out regularly. Sending them to a dead end at
  // their own vehicle is the one failure this product cannot afford.
  //
  // It also closes an oracle. Answering differently for a real tag and an
  // invented one tells anybody willing to guess which tags exist. Now the
  // answer is the same for both until there is a session to judge against, and
  // the scanned address rides through sign-in so the tap still lands on the part.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/verify?next=${encodeURIComponent(`/t/${tagId}`)}`)
  }

  const { data, error } = await supabase.rpc('resolve_tag', { p_tag_id: tagId })

  if (error) {
    redirect('/tag-unknown')
  }

  const resolution = normalizeResolution(data)

  switch (resolution.status) {
    case 'owned':
      redirect(`/v/${resolution.vehicleSlug}/c/${resolution.componentSlug}`)
    case 'unclaimed':
      redirect(`/claim?tag_id=${encodeURIComponent(tagId)}`)
    case 'forbidden':
      // Discloses nothing about the vehicle. This branch and 'unknown' are
      // deliberately indistinguishable — a measurable difference between them
      // would turn the tag space into an oracle for enumerating claimed tags.
      redirect('/tag-unavailable')
    default:
      redirect('/tag-unknown')
  }
}

/** Maps the RPC's snake_case payload onto the typed resolution union. */
function normalizeResolution(payload: unknown): TagResolution {
  if (payload === null || typeof payload !== 'object') return { status: 'unknown' }

  const record = payload as Record<string, unknown>
  const status = record.status

  if (status === 'owned') {
    return {
      status: 'owned',
      vehicleSlug: String(record.vehicle_slug ?? ''),
      componentSlug: String(record.component_slug ?? ''),
    }
  }
  if (status === 'unclaimed') return { status: 'unclaimed' }
  if (status === 'forbidden') return { status: 'forbidden' }
  return { status: 'unknown' }
}
