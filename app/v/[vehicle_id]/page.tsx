// Vehicle overview: every tagged component on one vehicle. Owner-only, whether or not passport sharing is enabled.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { PowerSource } from '@/types/servicecard'
import { ChevronRight, Fuel, BatteryCharging, Wrench, MapPin } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PassportSharing } from '@/components/PassportSharing'
import { VehicleSettings } from '@/components/garage/VehicleSettings'
import { TagRebinder } from '@/components/garage/TagRebinder'
import { ComponentZonePicker } from '@/components/zones/ComponentZonePicker'
import { findZone } from '@/lib/zones/zones'
import { TagMinter } from '@/components/garage/TagMinter'
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
    .select('id, slug, nickname, year, make, model, trim, power_source, current_odometer')
    .eq('slug', vehicleSlug)
    .maybeSingle()

  // RLS already scopes this to the owner, so a miss means "not yours or not
  // there" — both of which are a 404. A 403 would confirm the vehicle exists.
  if (!vehicle) notFound()

  const { data: components } = await supabase
    .from('components')
    .select('id, slug, display_name, template_key, zone_key, is_energy_port, energy_mode_hint')
    .eq('vehicle_id', vehicle.id as string)
    .order('display_name', { ascending: true })

  const { data: boundTags } = await supabase
    .from('tags')
    .select('id, component_id, zone_key')
    .eq('vehicle_id', vehicle.id as string)
    .order('claimed_at', { ascending: true })

  const shareState = await readShareState(vehicle.id as string)

  // A zone tag binds to the vehicle and to no component at all, so counting
  // components alone reports a vehicle with a working tag on it as untagged —
  // and offers to set up the tag that is already stuck to the bonnet.
  const zoneTags = (boundTags ?? [])
    .filter((tag) => tag.zone_key !== null)
    .map((tag) => ({ id: tag.id as string, zone: findZone(tag.zone_key as string) }))
    .filter(
      (tag): tag is { id: string; zone: NonNullable<ReturnType<typeof findZone>> } =>
        tag.zone !== null,
    )

  const hasAnyTag = (components?.length ?? 0) > 0 || zoneTags.length > 0

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

      {zoneTags.length > 0 ? (
        <section className="mb-6" aria-label="Tagged areas">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-secondary">
            Tagged areas
          </h2>
          <ul className="space-y-2">
            {zoneTags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`/v/${vehicle.slug as string}/z/${tag.zone.key}`}
                  className="flex min-h-touch items-center justify-between gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 active:bg-border"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold">
                      <MapPin size={16} className="shrink-0 text-text-secondary" aria-hidden />
                      {tag.zone.label}
                    </span>
                    <span className="mt-0.5 block pl-6 text-xs text-text-muted">
                      {tag.zone.placement}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-secondary">
        Tagged components
      </h2>

      {!hasAnyTag ? (
        /*
          The instructions used to live only on an empty garage, so they
          disappeared the moment someone added their first vehicle — which is
          precisely when they are about to put a tag on it.
        */
        <div className="rounded-card border border-dashed border-border-strong px-4 py-6">
          <p className="text-center text-sm text-text-muted">
            No tags on this vehicle yet. Stick one on a part, or somewhere you reach several parts
            from, then tap it with your phone.
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-sm font-semibold text-text-primary">Got a blank tag?</p>
            <TagMinter
              appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.rootlevellabs.tech'}
            />
          </div>
        </div>
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

      <div className="mt-8 space-y-6">
        <PassportSharing
          vehicleId={vehicle.id as string}
          initiallyShared={shareState.isShared}
          initialIncludeCosts={shareState.includeCosts}
        />

        <TagRebinder
          vehicleId={vehicle.id as string}
          tags={(boundTags ?? [])
            .filter((tag) => tag.component_id !== null)
            .map((tag) => ({
              tagId: tag.id as string,
              componentId: tag.component_id as string,
              componentName:
                (components ?? []).find((component) => component.id === tag.component_id)
                  ?.display_name ?? 'Unknown part',
            }))}
          components={(components ?? []).map((component) => ({
            id: component.id as string,
            displayName: component.display_name as string,
          }))}
        />

        <ComponentZonePicker
          vehicleSlug={vehicle.slug as string}
          components={(components ?? []).map((component) => ({
            id: component.id as string,
            displayName: component.display_name as string,
            templateKey: component.template_key as string | null,
            zoneKey: component.zone_key as string | null,
          }))}
        />

        <VehicleSettings
          vehicleId={vehicle.id as string}
          displayName={(vehicle.nickname as string | null) || identity || 'this vehicle'}
          vehicle={{
            year: vehicle.year as number | null,
            make: vehicle.make as string | null,
            model: vehicle.model as string | null,
            trim: vehicle.trim as string | null,
            nickname: vehicle.nickname as string | null,
            powerSource: vehicle.power_source as PowerSource,
            currentOdometer: vehicle.current_odometer as number,
          }}
        />
      </div>
    </main>
  )
}
