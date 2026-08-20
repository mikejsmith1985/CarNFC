// The claim flow an unclaimed tag lands on. Binds a stock tag to a vehicle and a component.
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ClaimWizard } from '@/components/claim/ClaimWizard'
import type { VehicleOption } from '@/components/claim/VehicleStep'
import type { TemplateOption } from '@/components/claim/ComponentStep'
import type { PowerSource } from '@/types/servicecard'

export const metadata = { title: 'Claim a tag · ServiceCard' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ tag_id?: string }>
}

/**
 * Sets up a freshly stuck tag.
 *
 * Reached from `/t/{tag_id}` when the tag is unclaimed. The tag id travels in
 * the query string and is preserved through sign-in by the proxy's `next`
 * parameter, so a first-ever scan on a new phone still completes (FR-002).
 */
export default async function ClaimPage({ searchParams }: PageProps) {
  const { tag_id: tagId } = await searchParams

  if (!tagId) redirect('/garage')

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/verify?next=${encodeURIComponent(`/claim?tag_id=${tagId}`)}`)
  }

  // Re-resolve rather than trusting the query string: the tag may have been
  // claimed since the redirect, possibly by this same owner on another device.
  const { data: resolution } = await supabase.rpc('resolve_tag', { p_tag_id: tagId })
  const status = (resolution as { status?: string } | null)?.status

  if (status === 'owned') {
    const owned = resolution as { vehicle_slug: string; component_slug: string }
    redirect(`/v/${owned.vehicle_slug}/c/${owned.component_slug}`)
  }
  if (status === 'forbidden') redirect('/tag-unavailable')
  if (status !== 'unclaimed') redirect('/tag-unknown')

  const [vehicles, templates] = await Promise.all([loadVehicles(supabase), loadTemplates(supabase)])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Set up this tag</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Two steps. Afterwards, tapping this tag opens straight to the part.
        </p>
      </header>

      <ClaimWizard tagId={tagId} vehicles={vehicles} templates={templates} />
    </main>
  )
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/** The owner's vehicles, as choices for step one. */
async function loadVehicles(supabase: SupabaseClient): Promise<VehicleOption[]> {
  const { data } = await supabase
    .from('vehicles')
    .select('id, slug, nickname, year, make, model, power_source')
    .order('created_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    label:
      (row.nickname as string | null) ??
      [row.year, row.make, row.model].filter(Boolean).join(' ') ??
      'Vehicle',
    powerSource: row.power_source as PowerSource,
  }))
}

/** The seeded component library, as choices for step two. */
async function loadTemplates(supabase: SupabaseClient): Promise<TemplateOption[]> {
  const { data } = await supabase
    .from('component_templates')
    .select('key, display_name, is_energy_port, energy_mode_hint, sort_order')
    .order('sort_order', { ascending: true })

  return (data ?? []).map((row) => ({
    key: row.key as string,
    displayName: row.display_name as string,
    isEnergyPort: row.is_energy_port as boolean,
    energyModeHint: row.energy_mode_hint as 'fuel' | 'charge' | null,
    sortOrder: row.sort_order as number,
  }))
}
