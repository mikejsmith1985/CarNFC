// The quick-log buttons a zone badge opens to, with whatever is due soonest first.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Droplet, ChevronRight, AlertTriangle, Fuel } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LogModal } from '@/components/LogModal'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { UNIT_DISTANCE } from '@/lib/constants'
import type { LogCategory } from '@/types/servicecard'

export interface ZoneComponent {
  id: string
  slug: string
  displayName: string
  templateKey: string | null
  isEnergyPort: boolean
  /** Odometer reading this part is next due at, when it has an interval. */
  nextServiceMiles: number | null
}

interface ZoneQuickActionsProps {
  vehicleSlug: string
  currentOdometer: number
  defaultCategory: LogCategory
  components: ZoneComponent[]
}

/** Miles remaining below which a part is called out rather than merely listed. */
const DUE_SOON_MILES = 1000

/**
 * One tap per part, from the badge to a filled-in log sheet.
 *
 * The whole point of a zone tag is that it removes the hunting: no vehicle
 * list, no category browsing, no scrolling to find the part. What is due
 * soonest is stated at the top, and every part in reach is one press away from
 * a log sheet already pointed at it.
 */
export function ZoneQuickActions({
  vehicleSlug,
  currentOdometer,
  defaultCategory,
  components,
}: ZoneQuickActionsProps) {
  const isReady = useIsHydrated()
  const [loggingFor, setLoggingFor] = useState<ZoneComponent | null>(null)

  const dueSoon = components
    .map((component) => ({ component, milesRemaining: milesUntilDue(component, currentOdometer) }))
    .filter(
      (entry): entry is { component: ZoneComponent; milesRemaining: number } =>
        entry.milesRemaining !== null && entry.milesRemaining <= DUE_SOON_MILES,
    )
    .sort((left, right) => left.milesRemaining - right.milesRemaining)

  return (
    <div {...hydrationMarker(isReady)}>
      {dueSoon.length > 0 ? (
        <section className="px-4 pt-4" aria-label="Due soon in this zone">
          <ul className="space-y-2">
            {dueSoon.map(({ component, milesRemaining }) => (
              <li
                key={component.id}
                className="flex items-center gap-2 rounded-card border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
              >
                <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden />
                <span className="font-semibold text-text-primary">{component.displayName}</span>
                <span className="tabular text-text-secondary">
                  {milesRemaining <= 0
                    ? 'overdue'
                    : `due in ${milesRemaining.toLocaleString()} ${UNIT_DISTANCE}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="px-4 py-4" aria-label="Quick log in this zone">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
          Quick log
        </h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {components.map((component) =>
            // An energy port has its own logger and no service sheet to open,
            // so it links rather than opening a log modal that cannot fit it.
            component.isEnergyPort ? (
              <Link
                key={component.id}
                href={`/v/${vehicleSlug}/c/${component.slug}`}
                className="flex min-h-touch flex-col items-start justify-center gap-1 rounded-card border border-border bg-surface-raised px-3 py-3 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Fuel size={16} className="shrink-0 text-text-secondary" aria-hidden />
                  {component.displayName}
                </span>
                <span className="text-xs text-text-muted">Log fill or charge</span>
              </Link>
            ) : (
              <Button
                key={component.id}
                variant="secondary"
                icon={<Droplet size={16} aria-hidden />}
                onClick={() => setLoggingFor(component)}
                className="flex-col !items-start !gap-1 !px-3 text-left text-sm"
              >
                {component.displayName}
              </Button>
            ),
          )}
        </div>

        <Link
          href={`/v/${vehicleSlug}`}
          className="mt-3 flex min-h-touch items-center justify-between rounded-card border border-border px-3 text-sm text-text-secondary"
        >
          Something else on this vehicle
          <ChevronRight size={16} aria-hidden />
        </Link>
      </section>

      {loggingFor ? (
        <LogModal
          isOpen
          onClose={() => setLoggingFor(null)}
          initialCategory={defaultCategory}
          componentId={loggingFor.id}
          componentName={loggingFor.displayName}
          vehicleSlug={vehicleSlug}
          currentOdometer={currentOdometer}
          specs={[]}
        />
      ) : null}
    </div>
  )
}

/** Miles left before a part is due, or null when it keeps no interval. */
function milesUntilDue(component: ZoneComponent, currentOdometer: number): number | null {
  if (component.nextServiceMiles === null) return null
  return component.nextServiceMiles - currentOdometer
}
