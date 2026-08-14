// A compact economy trend across recent energy sessions, with a stated reason wherever an interval yields no figure.
'use client'

import { TrendingUp } from 'lucide-react'
import type { EconomyGap } from '@/lib/calc/fuel'

export interface TrendPoint {
  odometer: number
  /** mpg for fuel, mi/kWh for charging. */
  value: number | null
  gap: EconomyGap | null
}

interface EconomyTrendProps {
  points: TrendPoint[]
  unitLabel: string
  averageLabel: string | null
}

/** Narrowest visible bar, so a very low reading is still a bar rather than nothing. */
const MIN_BAR_PERCENT = 4

/** Full-width bar for the highest reading in the window. */
const MAX_BAR_PERCENT = 100

const GAP_LABEL: Record<EconomyGap, string> = {
  first_entry: 'first entry',
  partial_fill: 'partial fill',
  missed_fill: 'missed fill',
  no_distance: 'no distance',
}

/**
 * Plots economy over recent sessions.
 *
 * Intervals with no figure are drawn as a labelled gap rather than skipped or
 * zeroed. A zero would drag the trend line down and misrepresent the vehicle;
 * silently omitting them would leave someone wondering why a fill they
 * remember making is missing (FR-032, FR-033).
 */
export function EconomyTrend({ points, unitLabel, averageLabel }: EconomyTrendProps) {
  if (points.length === 0) return null

  const measured = points.filter((point) => point.value !== null).map((point) => point.value!)
  const highest = measured.length > 0 ? Math.max(...measured) : 1

  return (
    <section className="rounded-card border border-border-strong bg-surface-raised p-3">
      <h3 className="flex items-center justify-between text-sm font-bold text-text-secondary">
        <span className="flex items-center gap-2">
          <TrendingUp size={16} aria-hidden />
          Recent economy
        </span>
        {averageLabel ? (
          <span className="tabular text-text-primary">
            {averageLabel} {unitLabel}
          </span>
        ) : null}
      </h3>

      <ol className="mt-3 space-y-1.5">
        {points.map((point) => (
          <li key={point.odometer} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 tabular text-text-muted">
              {point.odometer.toLocaleString()}
            </span>

            {point.value !== null ? (
              <>
                <span
                  aria-hidden
                  className="h-2 rounded-full bg-accent"
                  style={{
                    width: `${Math.max(MIN_BAR_PERCENT, (point.value / highest) * MAX_BAR_PERCENT)}%`,
                  }}
                />
                <span className="shrink-0 tabular font-semibold text-text-primary">
                  {point.value}
                </span>
              </>
            ) : (
              <span className="text-text-muted italic">
                {point.gap ? GAP_LABEL[point.gap] : 'no figure'}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
