// Vehicle overview: every tagged component on one vehicle. Owner-only, whether or not passport sharing is enabled.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Fuel, BatteryCharging, Wrench } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PassportSharing } from '@/components/PassportSharing'
import { readShareState } from '@/app/actions/passport'
import { UNIT_DISTANCE } from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ vehicle_id: string }>
}

/**
 * Lists the components on a vehicle.
 *
 * This address never serves a non-owner, whether or not the passport is shared.
 * Sharing mints a separate unguessable link precisely so the owner's own address
 * never becomes the thing that leaked (FR-049b).
 */
export default async function VehicleOverviewPage({ params }: PageProps) {
  const { vehicle_id: vehicleSlug } = await params
  const supabase = await createServerSupabaseClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, slug, nickname, year, make, model, trim, current_odometer')
    .eq('slug', vehicleSlug)
    .maybeSingle()

  // RLS already scopes this to the owner, so a miss means "not yours or not
  // there" — both of which are a 404. A 403 would confirm the vehicle exists.
  if (!vehicle) notFound()

  const { data: components } = await supabase
    .from('components')
    .select('id, slug, display_name, is_energy_port, energy_mode_hint')
    .eq('vehicle_id', vehicle.id as string)
    .order('display_name', { ascending: true })

  const shareState = await readShareState(vehicle.id as string)

  const identity = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-8">
      <header className="mb-6">
        {/* Inline-flex with the touch-target minimum: a bare text link renders
            around 19px tall, which fails FR-014 for a gloved thumb. */}
        <Link
          href="/garage"
          className="-ml-2 inline-flex min-h-touch items-center px-2 text-sm text-text-muted"
        >
          ← Garage
        </Link>
        <h1 className="mt-2 text-xl font-bold">
          {(vehicle.nickname as string | null) || identity || 'Vehicle'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {identity ? `${identity} · ` : ''}
          <span className="tabular">
            {(vehicle.current_odometer as number).toLocaleString()} {UNIT_DISTANCE}
          </span>
        </p>
      </header>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-secondary">
        Tagged components
      </h2>

      {(components?.length ?? 0) === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
          No tags claimed on this vehicle yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(components ?? []).map((component) => {
            const Icon =
              component.energy_mode_hint === 'fuel'
                ? Fuel
                : component.energy_mode_hint === 'charge'
                  ? BatteryCharging
                  : Wrench

            return (
              <li key={component.id as string}>
                <Link
                  href={`/v/${vehicle.slug}/c/${component.slug}`}
                  className="flex min-h-touch items-center gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 active:bg-border"
                >
                  <Icon size={18} className="shrink-0 text-text-secondary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {component.display_name as string}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-8">
        <PassportSharing
          vehicleId={vehicle.id as string}
          initiallyShared={shareState.isShared}
          initialIncludeCosts={shareState.includeCosts}
        />
      </div>
    </main>
  )
}
