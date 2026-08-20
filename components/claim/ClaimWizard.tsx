// Two-step claim wizard: which vehicle, then which part.
'use client'

import { useState } from 'react'
import { VehicleStep, type VehicleOption } from '@/components/claim/VehicleStep'
import { ComponentStep, type TemplateOption } from '@/components/claim/ComponentStep'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'

interface ClaimWizardProps {
  tagId: string
  vehicles: VehicleOption[]
  templates: TemplateOption[]
}

/**
 * Holds the pending tag id across both steps.
 *
 * The whole flow is client-side state rather than separate routes precisely so
 * the tag id survives adding a vehicle mid-way. Losing it would mean walking
 * back to the vehicle and re-scanning (US3 scenario 3).
 */
export function ClaimWizard({ tagId, vehicles, templates }: ClaimWizardProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null)

  const isReady = useIsHydrated()

  return (
    <div className="space-y-6" {...hydrationMarker(isReady)}>
      <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <StepPill index={1} label="Vehicle" isActive={selectedVehicle === null} />
        <span aria-hidden className="h-px flex-1 bg-border" />
        <StepPill index={2} label="Part" isActive={selectedVehicle !== null} />
      </ol>

      {selectedVehicle === null ? (
        <VehicleStep vehicles={vehicles} onSelect={setSelectedVehicle} />
      ) : (
        <ComponentStep
          tagId={tagId}
          vehicle={selectedVehicle}
          templates={templates}
          onBack={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  )
}

function StepPill({ index, label, isActive }: { index: number; label: string; isActive: boolean }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        isActive ? 'bg-accent/15 text-accent' : 'text-text-muted'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] ${
          isActive ? 'bg-accent text-text-inverse' : 'bg-border text-text-secondary'
        }`}
      >
        {index}
      </span>
      {label}
    </li>
  )
}
