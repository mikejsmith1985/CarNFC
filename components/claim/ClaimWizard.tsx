// Two-step claim wizard: which vehicle, then which part.
'use client'

import { useState, useSyncExternalStore } from 'react'
import { VehicleStep, type VehicleOption } from '@/components/claim/VehicleStep'
import { ComponentStep, type TemplateOption } from '@/components/claim/ComponentStep'

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

  // Marks the wizard interactive once React has hydrated. A real browser click
  // on a server-rendered button does nothing until then, which makes UX tests
  // flaky in a way that looks like a product bug and is not.
  //
  // useSyncExternalStore rather than an effect: it returns false during server
  // render and true on the client with no state update, so there is no
  // cascading re-render.
  const isReady = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )

  return (
    <div className="space-y-6" data-ready={isReady ? 'true' : 'false'}>
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

/** No-op subscription: the value never changes after hydration. */
function subscribeToNothing(): () => void {
  return () => {}
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
