// The garage: every vehicle on the account. The app's launch destination when it is opened from the home screen rather than a tag.
import Link from 'next/link'
import { Car, ChevronRight } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'
import { SyncIndicator } from '@/components/SyncIndicator'
import { AddVehicleSheet } from '@/components/garage/AddVehicleSheet'
import { UNIT_DISTANCE } from '@/lib/constants'
import type { PowerSource } from '@/types/servicecard'

export const metadata = { title: 'My garage · ServiceCard' }
export const dynamic = 'force-dynamic'

const POWER_SOURCE_LABEL: Record<PowerSource, string> = {
  gasoline: 'Gasoline',
  electric: 'Electric',
  both: 'Plug-in hybrid',
}

/**
 * Lists the owner's vehicles.
 *
 * Deliberately the least-used screen in the product: the intended way in is a
 * tag tap, which skips this entirely. It exists for the home-screen launch and
 * as somewhere to land after signing in.
 */
export default async function GaragePage() {
  const supabase = await createServerSupabaseClient()

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, slug, nickname, year, make, model, trim, power_source, current_odometer')
    .order('created_at', { ascending: true })

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl pb-8">
      <SyncIndicator />
      <div className="px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">My garage</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {(vehicles?.length ?? 0) === 0
                ? 'No vehicles yet.'
                : `${vehicles?.length} vehicle${vehicles?.length === 1 ? '' : 's'}`}
            </p>
          </div>

          <SignOutButton />
        </header>

        {(vehicles?.length ?? 0) === 0 ? (
          <div className="rounded-card border border-dashed border-border-strong px-4 py-10 text-center">
            <Car size={32} className="mx-auto text-text-muted" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-text-secondary">Nothing here yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Stick a tag on a part and tap it. Setup takes two steps — or add a vehicle now and tag
              it later.
            </p>
            <div className="mx-auto mt-5 max-w-xs">
              <AddVehicleSheet />
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {(vehicles ?? []).map((vehicle) => {
              const identity = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                .filter(Boolean)
                .join(' ')

              return (
                <li key={vehicle.id as string}>
                  <Link
                    href={`/v/${vehicle.slug}`}
                    className="flex min-h-touch items-center justify-between gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 active:bg-border"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {(vehicle.nickname as string | null) || identity || 'Vehicle'}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {identity ? `${identity} · ` : ''}
                        {POWER_SOURCE_LABEL[vehicle.power_source as PowerSource]} ·{' '}
                        <span className="tabular">
                          {(vehicle.current_odometer as number).toLocaleString()} {UNIT_DISTANCE}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-6">
          <AddVehicleSheet />
        </div>
      </div>
    </main>
  )
}
