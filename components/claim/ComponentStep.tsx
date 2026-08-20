// Claim wizard step two: choose what part this tag is stuck to, from the library or ad hoc.
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Fuel, BatteryCharging, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { claimTag, claimZoneTag } from '@/app/actions/claim'
import { listZones, type ZoneKey } from '@/lib/zones/zones'
import { filterCompatibleTemplates, type ComponentTemplateSummary } from '@/lib/claim/compatibility'
import type { VehicleOption } from '@/components/claim/VehicleStep'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'

export interface TemplateOption extends ComponentTemplateSummary {
  sortOrder: number
}

interface ComponentStepProps {
  tagId: string
  vehicle: VehicleOption
  templates: TemplateOption[]
  onBack: () => void
}

/**
 * Chooses the component and completes the claim.
 *
 * The library is filtered to what this vehicle can actually have: a battery
 * electric car is never offered a fuel filler, because binding one produces a
 * card that opens a logger asking for gallons and a tag that has to be peeled
 * off again (FR-029, spec Edge Cases).
 */
export function ComponentStep({ tagId, vehicle, templates, onBack }: ComponentStepProps) {
  const router = useRouter()
  const isReady = useIsHydrated()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  // A badge covering a working area rather than a single part. Exclusive with
  // a template choice, the same way the binding is exclusive in the database.
  const [selectedZone, setSelectedZone] = useState<ZoneKey | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const compatibleTemplates = useMemo(
    () =>
      filterCompatibleTemplates(templates, vehicle.powerSource).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ),
    [templates, vehicle.powerSource],
  )

  const selectedTemplate = compatibleTemplates.find((entry) => entry.key === selectedKey) ?? null
  const resolvedName = isCustom ? customName : (selectedTemplate?.displayName ?? '')

  const handleClaim = () => {
    setFormError(null)

    if (selectedZone) {
      startSaving(async () => {
        const zoneResult = await claimZoneTag(tagId, vehicle.id, selectedZone)
        if (!zoneResult.ok) {
          setFormError(zoneResult.error)
          return
        }
        router.replace(`/v/${zoneResult.data.vehicleSlug}/z/${zoneResult.data.zoneKey}`)
        router.refresh()
      })
      return
    }

    startSaving(async () => {
      const result = await claimTag({
        tagId,
        vehicleId: vehicle.id,
        templateKey: isCustom ? null : selectedKey,
        displayName: resolvedName,
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      // Straight onto the card that now exists — the point of the whole flow.
      router.replace(`/v/${result.data.vehicleSlug}/c/${result.data.componentSlug}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4" {...hydrationMarker(isReady)}>
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
          What is this tag on?
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Tagging {vehicle.label}. Picking from the list fills in the specs for you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {compatibleTemplates.map((template) => {
          const isSelected = !isCustom && template.key === selectedKey
          const Icon =
            template.energyModeHint === 'fuel'
              ? Fuel
              : template.energyModeHint === 'charge'
                ? BatteryCharging
                : Wrench

          return (
            <button
              key={template.key}
              type="button"
              onClick={() => {
                setSelectedKey(template.key)
                setIsCustom(false)
                setSelectedZone(null)
                setFormError(null)
              }}
              className={`flex min-h-touch items-center gap-2 rounded-card border px-3 py-2.5 text-left text-sm font-semibold ${
                isSelected
                  ? 'border-accent bg-accent/10 text-text-primary'
                  : 'border-border bg-surface-sunken text-text-secondary'
              }`}
            >
              <Icon size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{template.displayName}</span>
            </button>
          )
        })}
      </div>

      <Button
        variant={isCustom ? 'primary' : 'ghost'}
        fullWidth
        onClick={() => {
          setIsCustom(true)
          setSelectedKey(null)
          setSelectedZone(null)
        }}
      >
        Not listed — name it myself
      </Button>

      {/*
        The alternative to a tag per part. Nobody puts twenty badges on a truck,
        so one badge can stand for a whole working area and open everything
        reachable from it.
      */}
      <section className="rounded-card border border-border bg-surface-sunken p-3">
        <h3 className="text-sm font-bold text-text-primary">Or cover a whole area</h3>
        <p className="mt-1 text-xs text-text-muted">
          One badge for everything you reach from where it is stuck.
        </p>

        <div className="mt-3 space-y-2">
          {listZones().map((zone) => {
            const isSelected = selectedZone === zone.key
            return (
              <button
                key={zone.key}
                type="button"
                onClick={() => {
                  setSelectedZone(zone.key)
                  setSelectedKey(null)
                  setIsCustom(false)
                  setFormError(null)
                }}
                className={`flex min-h-touch w-full items-start gap-2 rounded-card border px-3 py-2.5 text-left ${
                  isSelected
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border bg-surface-raised text-text-secondary'
                }`}
              >
                <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{zone.label}</span>
                  <span className="block text-xs text-text-muted">{zone.placement}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {isCustom ? (
        <TextField
          label="Component name"
          placeholder="Skid plate"
          hint="You can add tools, torque specs and capacities on the card afterwards."
          value={customName}
          onChange={(event) => setCustomName(event.target.value)}
        />
      ) : null}

      {formError ? (
        <p
          role="alert"
          className="rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="large"
        fullWidth
        onClick={handleClaim}
        disabled={isSaving || (selectedZone === null && resolvedName.trim() === '')}
      >
        {isSaving ? 'Claiming…' : 'Claim this tag'}
      </Button>

      <Button variant="ghost" fullWidth onClick={onBack}>
        Choose a different vehicle
      </Button>
    </div>
  )
}
