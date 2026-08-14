// Read-only presentation of a shared vehicle passport. Contains no write affordance of any kind.
import { Car, ShieldCheck, Pencil } from 'lucide-react'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { UNIT_DISTANCE } from '@/lib/constants'
import type { LogCategory } from '@/types/servicecard'

export interface PassportPayload {
  vehicle: {
    year: number | null
    make: string | null
    model: string | null
    trim: string | null
    powerSource: string
    currentOdometer: number
  }
  components: Array<{
    displayName: string
    specs: Array<{ label: string; effectiveValue: string; unit: string | null; origin: string }>
  }>
  history: Array<{
    componentName: string
    category: LogCategory
    performedOn: string
    odometer: number
    notes: string | null
    isEdited: boolean
    cost: number | null
  }>
  energySummary: { entryCount: number; firstOdometer: number | null; lastOdometer: number | null }
  includeCosts: boolean
}

/**
 * Renders a vehicle's service record for someone who does not own it.
 *
 * Every control is absent rather than disabled. A disabled button is still a
 * button, and this page exists to be handed to a stranger — there should be
 * nothing here that even looks like it could change the record.
 *
 * Owner identity and charging locations never appear, and costs only when the
 * owner explicitly opted in (FR-050).
 */
export function PassportView({ passport }: { passport: PassportPayload }) {
  const identity = [
    passport.vehicle.year,
    passport.vehicle.make,
    passport.vehicle.model,
    passport.vehicle.trim,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl pb-10">
      <header className="border-b border-border bg-surface-raised px-4 py-5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <ShieldCheck size={14} aria-hidden />
          Vehicle service record
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-bold">
          <Car size={20} className="shrink-0 text-text-secondary" aria-hidden />
          {identity || 'Vehicle'}
        </h1>
        <p className="mt-1 text-sm tabular text-text-secondary">
          {passport.vehicle.currentOdometer.toLocaleString()} {UNIT_DISTANCE}
        </p>
      </header>

      <section className="px-4 py-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
          Service history
        </h2>

        {passport.history.length === 0 ? (
          <p className="mt-3 rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
            No service recorded yet.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {passport.history.map((entry, index) => (
              <li
                key={`${entry.performedOn}-${index}`}
                className="rounded-card border border-border bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={entry.category} />
                  <span className="text-xs font-semibold text-text-secondary">
                    {entry.componentName}
                  </span>
                  {entry.isEdited ? (
                    // A buyer should be able to see that a record was revised.
                    // The history is append-only, so nothing was overwritten —
                    // but they are entitled to know it was touched.
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Pencil size={11} aria-hidden />
                      Edited
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm font-semibold tabular text-text-primary">
                  {entry.performedOn} · {entry.odometer.toLocaleString()} {UNIT_DISTANCE}
                  {passport.includeCosts && entry.cost !== null ? (
                    <span className="ml-2 font-normal text-text-secondary">
                      ${entry.cost.toFixed(2)}
                    </span>
                  ) : null}
                </p>

                {entry.notes ? (
                  <p className="mt-1 text-sm text-text-secondary">{entry.notes}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="px-4 pb-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
          Recorded specifications
        </h2>
        <div className="mt-3 space-y-3">
          {passport.components.map((component) => (
            <div
              key={component.displayName}
              className="rounded-card border border-border bg-surface-raised p-3"
            >
              <h3 className="text-sm font-bold">{component.displayName}</h3>
              <dl className="mt-2 space-y-1">
                {component.specs.map((spec) => (
                  <div key={spec.label} className="flex justify-between gap-3 text-sm">
                    <dt className="text-text-secondary">
                      {spec.label}
                      {spec.origin === 'override' ? (
                        <span className="ml-1.5 text-xs text-upgrade">modified</span>
                      ) : null}
                    </dt>
                    <dd className="tabular text-text-primary">
                      {spec.effectiveValue}
                      {spec.unit ? ` ${spec.unit}` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {passport.energySummary.entryCount > 0 ? (
        <section className="px-4 pb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
            Fuel &amp; charging
          </h2>
          <p className="mt-2 rounded-card border border-border bg-surface-raised p-3 text-sm text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {passport.energySummary.entryCount}
            </span>{' '}
            logged sessions on record.
          </p>
        </section>
      ) : null}

      <footer className="px-4 pt-2 text-center text-xs text-text-muted">
        Shared by the owner from ServiceCard. This record is read-only and can be revoked at any
        time.
      </footer>
    </main>
  )
}
