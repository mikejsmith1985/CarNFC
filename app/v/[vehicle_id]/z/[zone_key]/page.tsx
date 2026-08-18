// The zone landing view — what one badge covering a working area opens to.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, ChevronLeft, Car, ChevronRight } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SyncIndicator } from '@/components/SyncIndicator'
import { ZoneQuickActions } from '@/components/zones/ZoneQuickActions'
import { componentsInZone, findZone } from '@/lib/zones/zones'
import { computeNextDue } from '@/lib/calc/reminders'
import { UNIT_DISTANCE } from '@/lib/constants'

interface PageProps {
  // Next 16 delivers route params as a Promise. Awaiting is mandatory.
  params: Promise<{ vehicle_id: string; zone_key: string }>
}

export const dynamic = 'force-dynamic'

/**
 * Everything reachable from one place on the vehicle, in one screen.
 *
 * A tag per part is sharper — tap the diff, get the diff — but nobody puts
 * twenty badges on a truck. This is the other end of that trade: one badge
 * where a person already stands, and the parts they reach from there, with
 * whatever is due soonest first.
 */
export default async function ZoneLandingPage({ params }: PageProps) {
  const { vehicle_id: vehicleSlug, zone_key: zoneKey } = await params

  // The key arrives from a URL printed on hardware, so it is checked against
  // what this build defines rather than trusted.
  const zone = findZone(zoneKey)
  if (!zone) notFound()

  const supabase = await createServerSupabaseClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, slug, nickname, year, make, model, trim, current_odometer')
    .eq('slug', vehicleSlug)
    .maybeSingle()

  // Row Level Security already scopes this to the owner, so a miss means "not
  // yours or not there" — both a 404. A 403 would confirm the vehicle exists.
  if (!vehicle) notFound()

  const { data: components } = await supabase
    .from('components')
    .select(
      'id, slug, display_name, template_key, zone_key, is_energy_port, service_interval_miles, service_interval_days',
    )
    .eq('vehicle_id', vehicle.id as string)

  // "Due soon" is projected from the last service, not stored — the same
  // calculation the card itself uses, so the two can never disagree.
  const lastServiceByComponent = await loadLastServiceOdometers(
    supabase,
    (components ?? []).map((component) => component.id as string),
  )

  const inZone = componentsInZone(
    zone,
    (components ?? []).map((component) => {
      const componentId = component.id as string
      const { dueOdometer } = computeNextDue({
        lastServiceOdometer: lastServiceByComponent.get(componentId) ?? null,
        lastServiceDate: null,
        intervalMiles: component.service_interval_miles as number | null,
        intervalDays: component.service_interval_days as number | null,
      })

      return {
        id: componentId,
        slug: component.slug as string,
        displayName: component.display_name as string,
        templateKey: component.template_key as string | null,
        zoneKey: component.zone_key as string | null,
        isEnergyPort: component.is_energy_port as boolean,
        nextServiceMiles: dueOdometer,
      }
    }),
  )

  const identity = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')
  const currentOdometer = vehicle.current_odometer as number

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl pb-10">
      <SyncIndicator />

      <header className="border-b border-border bg-surface-raised px-4 py-4">
        {/* Arriving by tag leaves no history to go back through, so the way out
            is on the page rather than in the browser's back button. */}
        <Link
          href={`/v/${vehicle.slug as string}`}
          className="-ml-1 flex min-h-touch items-center gap-1.5 text-base font-bold text-text-primary"
        >
          <ChevronLeft size={18} className="shrink-0 text-text-secondary" aria-hidden />
          <Car size={18} className="shrink-0 text-text-secondary" aria-hidden />
          <span className="truncate">
            {(vehicle.nickname as string | null) || identity || 'Vehicle'}
          </span>
        </Link>

        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent">
            <MapPin size={16} className="shrink-0" aria-hidden />
            {zone.label}
          </p>
          <p className="shrink-0 rounded-card border border-border-strong bg-surface-sunken px-2.5 py-1.5 text-sm font-bold tabular text-text-primary">
            {currentOdometer.toLocaleString()} {UNIT_DISTANCE}
          </p>
        </div>
      </header>

      {inZone.length === 0 ? (
        <section className="px-4 py-10 text-center">
          <p className="text-sm font-semibold text-text-secondary">
            Nothing tagged in this zone yet
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Add the parts you work on here and this badge opens straight to them.
          </p>
          <Link
            href={`/v/${vehicle.slug as string}`}
            className="mt-4 inline-flex min-h-touch items-center gap-1 rounded-card border border-border-strong px-4 text-sm font-semibold text-text-primary"
          >
            Open {(vehicle.nickname as string | null) || 'this vehicle'}
            <ChevronRight size={16} aria-hidden />
          </Link>
        </section>
      ) : (
        <ZoneQuickActions
          vehicleSlug={vehicle.slug as string}
          currentOdometer={currentOdometer}
          defaultCategory={zone.defaultCategory}
          components={inZone}
        />
      )}

      <p className="px-4 pt-6 text-xs text-text-muted">Badge location: {zone.placement}.</p>
    </main>
  )
}

/**
 * The odometer at each component's most recent service.
 *
 * Read from the current-revisions view so a superseded or tombstoned entry
 * never sets a due date — an edit that corrected a mistake must move the
 * projection with it.
 */
async function loadLastServiceOdometers(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  componentIds: string[],
): Promise<Map<string, number>> {
  const latest = new Map<string, number>()
  if (componentIds.length === 0) return latest

  const { data } = await supabase
    .from('v_current_service_revisions')
    .select('component_id, odometer')
    .in('component_id', componentIds)

  for (const row of data ?? []) {
    const componentId = row.component_id as string
    const odometer = row.odometer as number | null
    if (odometer === null) continue
    latest.set(componentId, Math.max(latest.get(componentId) ?? 0, odometer))
  }

  return latest
}
