// Card header: which vehicle, which part, and the current odometer — the three things that orient someone who just tapped a tag.
import { Car, Tag } from 'lucide-react'
import type { ComponentCard } from '@/types/servicecard'
import { UNIT_DISTANCE } from '@/lib/constants'

interface VehicleHeaderProps {
  vehicle: ComponentCard['vehicle']
  component: ComponentCard['component']
}

/** Renders vehicle identity, odometer, and the tag's component location (FR-007). */
export function VehicleHeader({ vehicle, component }: VehicleHeaderProps) {
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')

  return (
    <header className="border-b border-border bg-surface-raised px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-bold text-text-primary">
            <Car size={18} className="shrink-0 text-text-secondary" aria-hidden />
            <span className="truncate">{vehicle.nickname || vehicleName || 'Vehicle'}</span>
          </p>
          {vehicle.nickname && vehicleName ? (
            <p className="mt-0.5 truncate pl-6 text-sm text-text-secondary">{vehicleName}</p>
          ) : null}
        </div>

        {/* The odometer is read at a glance and compared against the HUD's
            interval figures, so it is monospaced and never truncated. */}
        <p className="shrink-0 rounded-card border border-border-strong bg-surface-sunken px-2.5 py-1.5 text-sm font-bold tabular text-text-primary">
          {vehicle.currentOdometer.toLocaleString()} {UNIT_DISTANCE}
        </p>
      </div>

      <p className="mt-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent">
        <Tag size={16} className="shrink-0" aria-hidden />
        <span className="truncate">{component.displayName}</span>
      </p>
    </header>
  )
}
