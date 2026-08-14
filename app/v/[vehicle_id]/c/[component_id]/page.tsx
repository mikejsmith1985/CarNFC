// The Component Service Card — the primary view, and what a tag tap ultimately renders.
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VehicleHeader } from '@/components/VehicleHeader'
import { MechanicsHud } from '@/components/MechanicsHud'
import { ComponentTimeline } from '@/components/ComponentTimeline'
import { QuickActions } from '@/components/QuickActions'
import { ReminderBanner } from '@/components/ReminderBanner'
import { EnergyLogger } from '@/components/EnergyLogger'
import { SyncIndicator } from '@/components/SyncIndicator'
import { StalenessBanner } from '@/components/StalenessBanner'
import { CardCacheWriter } from '@/components/CardCacheWriter'
import { TIMELINE_PAGE_SIZE } from '@/lib/constants'
import type { ComponentCard } from '@/types/servicecard'

interface PageProps {
  // Next 16 delivers route params as a Promise. The Next 14 synchronous shape
  // compiles under a stale mental model and fails at runtime.
  params: Promise<{ vehicle_id: string; component_id: string }>
}

export const dynamic = 'force-dynamic'

/**
 * Renders the service card for one component on one vehicle.
 *
 * Header, reminders, HUD, and quick actions render outside any Suspense
 * boundary so they paint on the first response — someone reaching for a drain
 * plug needs the torque figure, not the 2019 history. Only the timeline streams.
 */
export default async function ComponentServiceCardPage({ params }: PageProps) {
  const { vehicle_id: vehicleSlug, component_id: componentSlug } = await params

  const card = await loadComponentCard(vehicleSlug, componentSlug)

  // A non-owner gets 404, never 403 — a 403 would confirm the vehicle exists.
  if (card === null) notFound()

  // A tag on a fuel door or charge port opens the energy logger instead of the
  // standard card (FR-004).
  if (card.component.isEnergyPort) {
    // Economy is measured against the previous entry on this vehicle. Without
    // it the logger can only ever report "first entry", so it is loaded here
    // rather than left undefined (FR-032, FR-037).
    const previous = await loadPreviousEnergyEntry(card.vehicle.id)

    return (
      <main className="mx-auto min-h-dvh w-full max-w-xl">
        <VehicleHeader vehicle={card.vehicle} component={card.component} />
        <SyncIndicator />
        <EnergyLogger
          vehicleId={card.vehicle.id}
          vehicleSlug={card.vehicle.slug}
          powerSource={card.vehicle.powerSource}
          modeHint={card.component.energyModeHint}
          currentOdometer={card.vehicle.currentOdometer}
          previousOdometer={previous.odometer}
          previousWasFullFill={previous.wasFullFill}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl pb-8">
      <VehicleHeader vehicle={card.vehicle} component={card.component} />

      <CardCacheWriter vehicleSlug={vehicleSlug} componentSlug={componentSlug} card={card} />
      <SyncIndicator />
      <StalenessBanner vehicleSlug={vehicleSlug} componentSlug={componentSlug} />

      <ReminderBanner reminders={card.reminders} currentOdometer={card.vehicle.currentOdometer} />

      <MechanicsHud specs={card.specs} />

      <QuickActions
        componentId={card.component.id}
        componentName={card.component.displayName}
        vehicleSlug={card.vehicle.slug}
        currentOdometer={card.vehicle.currentOdometer}
        specs={card.specs}
      />

      <Suspense fallback={<TimelineSkeleton />}>
        <ComponentTimeline
          entries={card.timeline}
          hasMore={card.timelineHasMore}
          componentName={card.component.displayName}
        />
      </Suspense>
    </main>
  )
}

/**
 * Fetches everything the card renders in a single round trip.
 *
 * Sequential client-side queries cannot meet the one-second budget in SC-001, so
 * the whole payload comes back from one RPC. That function is SECURITY INVOKER,
 * meaning RLS still applies — it is a performance measure, never an
 * authorization bypass.
 */
async function loadComponentCard(
  vehicleSlug: string,
  componentSlug: string,
): Promise<ComponentCard | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_component_card', {
    p_vehicle_slug: vehicleSlug,
    p_component_slug: componentSlug,
    p_limit: TIMELINE_PAGE_SIZE,
  })

  if (error || data === null) return null

  return normalizeCard(data as Record<string, unknown>)
}

/**
 * Reads the most recent energy entry on a vehicle.
 *
 * Vehicle-scoped rather than component-scoped, so a plug-in hybrid's fuel and
 * charge sessions form one continuous odometer axis (FR-037).
 */
async function loadPreviousEnergyEntry(
  vehicleId: string,
): Promise<{ odometer: number | null; wasFullFill: boolean }> {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('v_current_energy_revisions')
    .select('odometer, is_full_fill, entry_id, energy_entries!inner(vehicle_id)')
    .eq('energy_entries.vehicle_id', vehicleId)
    .order('odometer', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { odometer: null, wasFullFill: true }

  return {
    odometer: (data.odometer as number | null) ?? null,
    // A null marker means the previous entry was a charge, which never opens a
    // liquid-fuel interval; treating it as full keeps the next fill measurable.
    wasFullFill: (data.is_full_fill as boolean | null) ?? true,
  }
}

/** Maps the RPC's snake_case JSON onto the camelCase types the components consume. */
function normalizeCard(payload: Record<string, unknown>): ComponentCard {
  const vehicle = payload.vehicle as Record<string, unknown>
  const component = payload.component as Record<string, unknown>

  return {
    vehicle: {
      id: String(vehicle.id),
      slug: String(vehicle.slug),
      year: (vehicle.year as number | null) ?? null,
      make: (vehicle.make as string | null) ?? null,
      model: (vehicle.model as string | null) ?? null,
      trim: (vehicle.trim as string | null) ?? null,
      nickname: (vehicle.nickname as string | null) ?? null,
      powerSource: vehicle.power_source as ComponentCard['vehicle']['powerSource'],
      currentOdometer: Number(vehicle.current_odometer ?? 0),
    },
    component: {
      id: String(component.id),
      slug: String(component.slug),
      displayName: String(component.display_name),
      isEnergyPort: Boolean(component.is_energy_port),
      energyModeHint:
        (component.energy_mode_hint as ComponentCard['component']['energyModeHint']) ?? null,
      serviceIntervalMiles: (component.service_interval_miles as number | null) ?? null,
      serviceIntervalDays: (component.service_interval_days as number | null) ?? null,
    },
    specs: ((payload.specs as Record<string, unknown>[]) ?? []).map((spec) => ({
      specKey: String(spec.spec_key),
      kind: spec.kind as ComponentCard['specs'][number]['kind'],
      label: String(spec.label),
      effectiveValue: String(spec.effective_value),
      unit: (spec.unit as string | null) ?? null,
      origin: spec.origin as ComponentCard['specs'][number]['origin'],
      factoryValue: (spec.factory_value as string | null) ?? null,
      overrideRevisionId: (spec.override_revision_id as string | null) ?? null,
      supersededOverrideCount: Number(spec.superseded_override_count ?? 0),
    })),
    reminders: ((payload.reminders as Record<string, unknown>[]) ?? []).map((reminder) => ({
      id: String(reminder.id),
      componentId: String(component.id),
      sourceRevisionId: null,
      kind: reminder.kind as ComponentCard['reminders'][number]['kind'],
      dueOdometer: (reminder.due_odometer as number | null) ?? null,
      dueOn: (reminder.due_on as string | null) ?? null,
      isOverdue: Boolean(reminder.is_overdue),
      completedAt: null,
    })),
    timeline: ((payload.timeline as Record<string, unknown>[]) ?? []).map((entry) => ({
      entryId: String(entry.entry_id),
      revisionId: String(entry.revision_id),
      category: entry.category as ComponentCard['timeline'][number]['category'],
      performedOn: String(entry.performed_on),
      odometer: Number(entry.odometer ?? 0),
      notes: (entry.notes as string | null) ?? null,
      isEdited: Boolean(entry.is_edited),
      categoryFields: (entry.category_fields as Record<string, string | number | null>) ?? {},
      attachments: ((entry.attachments as Record<string, unknown>[]) ?? []).map((file) => ({
        id: String(file.id),
        revisionId: String(entry.revision_id),
        storagePath: String(file.storage_path),
        originalFilename: String(file.original_filename),
        mimeType: String(file.mime_type),
        byteSize: 0,
        state: file.state as ComponentCard['timeline'][number]['attachments'][number]['state'],
      })),
    })),
    timelineHasMore: Boolean(payload.timeline_has_more),
  }
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3 px-4 py-5" aria-hidden>
      <div className="h-4 w-24 rounded bg-surface-raised" />
      <div className="h-20 rounded-card bg-surface-raised" />
      <div className="h-20 rounded-card bg-surface-raised" />
    </div>
  )
}
