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

  // A caller with no session never reaches this page: middleware sends them to
  // sign in carrying the scanned address, so the round trip still ends on the
  // part. That also keeps a real tag and an invented one indistinguishable to
  // anyone without a session, so the tag space cannot be used to find out which
  // tags exist.
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
