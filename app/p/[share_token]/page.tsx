// The shared vehicle passport: the only route in the product that serves vehicle data to an unauthenticated caller.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAnonSupabaseClient } from '@/lib/supabase/server'
import { looksLikeShareToken } from '@/lib/passport/token'
import { PassportView, type PassportPayload } from '@/components/passport/PassportView'
import type { LogCategory } from '@/types/servicecard'

export const dynamic = 'force-dynamic'

/**
 * No indexing, no link previews, no archiving.
 *
 * Without this, pasting a share link into any chat application would expand a
 * preview containing the vehicle's history, and a crawler reaching it once
 * would make the disclosure permanent (FR-051b). The matching `X-Robots-Tag`
 * header is set in next.config.ts, and `/p/` is disallowed in robots.txt.
 *
 * Note the deliberate absence of any OpenGraph or Twitter card metadata.
 */
export const metadata: Metadata = {
  title: 'Vehicle service record',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

interface PageProps {
  params: Promise<{ share_token: string }>
}

/**
 * Renders a vehicle's history for whoever holds the link.
 *
 * Revoked, unknown and malformed tokens all produce an identical 404. Anything
 * that distinguished them would let someone probe which links had once been
 * valid.
 */
export default async function PassportPage({ params }: PageProps) {
  const { share_token: shareToken } = await params

  // A shape check avoids a pointless query. It never produces a different
  // response — the outcome below is the same 404 either way.
  if (!looksLikeShareToken(shareToken)) notFound()

  const supabase = createAnonSupabaseClient()
  const { data, error } = await supabase.rpc('get_public_passport', { p_token: shareToken })

  if (error || data === null) notFound()

  return <PassportView passport={normalizePassport(data as Record<string, unknown>)} />
}

/** Maps the RPC's snake_case projection onto the view's props. */
function normalizePassport(payload: Record<string, unknown>): PassportPayload {
  const vehicle = (payload.vehicle ?? {}) as Record<string, unknown>
  const summary = (payload.energy_summary ?? {}) as Record<string, unknown>

  return {
    vehicle: {
      year: (vehicle.year as number | null) ?? null,
      make: (vehicle.make as string | null) ?? null,
      model: (vehicle.model as string | null) ?? null,
      trim: (vehicle.trim as string | null) ?? null,
      powerSource: String(vehicle.power_source ?? ''),
      currentOdometer: Number(vehicle.current_odometer ?? 0),
    },
    components: ((payload.components as Record<string, unknown>[]) ?? []).map((component) => ({
      displayName: String(component.display_name),
      specs: ((component.specs as Record<string, unknown>[]) ?? []).map((spec) => ({
        label: String(spec.label),
        effectiveValue: String(spec.effective_value),
        unit: (spec.unit as string | null) ?? null,
        origin: String(spec.origin),
      })),
    })),
    history: ((payload.history as Record<string, unknown>[]) ?? []).map((entry) => ({
      componentName: String(entry.component_name),
      category: entry.category as LogCategory,
      performedOn: String(entry.performed_on),
      odometer: Number(entry.odometer ?? 0),
      notes: (entry.notes as string | null) ?? null,
      isEdited: Boolean(entry.is_edited),
      // Already nulled in SQL unless the owner opted in. Carried through here
      // rather than re-decided, so redaction has exactly one home.
      cost: (entry.cost as number | null) ?? null,
    })),
    energySummary: {
      entryCount: Number(summary.entry_count ?? 0),
      firstOdometer: (summary.first_odometer as number | null) ?? null,
      lastOdometer: (summary.last_odometer as number | null) ?? null,
    },
    includeCosts: Boolean(payload.include_costs),
  }
}
