// Offers a projected odometer reading, so someone at a pump with the nozzle running does not have to walk back to the dash.
'use client'

import { Wand2 } from 'lucide-react'
import { suggestOdometer } from '@/lib/calc/odometer'

interface OdometerSuggestProps {
  lastKnownOdometer: number | null
  lastEntryDate: string | null
  averageMilesPerDay: number
  currentValue: string
  onAccept: (value: number) => void
}

/**
 * Shows a projected reading when it differs from what is already typed.
 *
 * A suggestion, never an autofill: the odometer anchors every economy and
 * interval figure in the product, so a guess must not silently become the
 * recorded value. Accepting it is one tap; ignoring it costs nothing.
 */
export function OdometerSuggest({
  lastKnownOdometer,
  lastEntryDate,
  averageMilesPerDay,
  currentValue,
  onAccept,
}: OdometerSuggestProps) {
  const suggestion = suggestOdometer(
    lastKnownOdometer,
    lastEntryDate ? new Date(lastEntryDate) : null,
    averageMilesPerDay,
    new Date(),
  )

  if (suggestion === null || String(suggestion) === currentValue.trim()) return null

  return (
    <button
      type="button"
      onClick={() => onAccept(suggestion)}
      className="flex min-h-touch w-full items-center gap-2 rounded-card border border-border-strong bg-surface-sunken px-3 py-2 text-left text-sm text-text-secondary"
    >
      <Wand2 size={16} className="shrink-0 text-accent" aria-hidden />
      <span>
        Probably around <span className="tabular font-semibold">{suggestion.toLocaleString()}</span>{' '}
        mi — tap to use
      </span>
    </button>
  )
}
