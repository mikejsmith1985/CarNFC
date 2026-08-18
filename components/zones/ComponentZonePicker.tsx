// Lets an owner say which working zone each part belongs to.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { SelectField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { setComponentZone } from '@/app/actions/zones'
import { listZones, NO_ZONE, zoneForTemplate } from '@/lib/zones/zones'

export interface ZoneAssignableComponent {
  id: string
  displayName: string
  templateKey: string | null
  zoneKey: string | null
}

interface ComponentZonePickerProps {
  vehicleSlug: string
  components: ZoneAssignableComponent[]
}

/** The value meaning "whatever this part's template implies". */
const FOLLOW_TEMPLATE = ''

/**
 * Assigns parts to zones, so a zone badge can reach anything.
 *
 * Placement follows the part's template by default, which covers the seeded
 * library and nothing an owner added by hand — those have no template, so
 * without this they are invisible from every badge on the vehicle.
 */
export function ComponentZonePicker({ vehicleSlug, components }: ComponentZonePickerProps) {
  const router = useRouter()
  const isReady = useIsHydrated()
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  if (components.length === 0) return null

  const handleChange = (componentId: string, value: string) => {
    setFormError(null)
    startSaving(async () => {
      const result = await setComponentZone(
        componentId,
        vehicleSlug,
        value === FOLLOW_TEMPLATE ? null : value,
      )
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4"
      aria-label="Zones"
      {...hydrationMarker(isReady)}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
        <MapPin size={16} aria-hidden />
        Zones
      </h2>
      <p className="mt-2 text-sm text-text-muted">
        Which badge opens which part. Most are already placed by what they are.
      </p>

      <div className="mt-4 space-y-3">
        {components.map((component) => {
          const impliedZone = zoneForTemplate(component.templateKey)
          const defaultLabel = impliedZone ? `Default — ${impliedZone.label}` : 'Default — no zone'

          return (
            <SelectField
              key={component.id}
              label={component.displayName}
              value={component.zoneKey ?? FOLLOW_TEMPLATE}
              disabled={isSaving}
              onChange={(event) => handleChange(component.id, event.target.value)}
              options={[
                { value: FOLLOW_TEMPLATE, label: defaultLabel },
                ...listZones().map((zone) => ({ value: zone.key, label: zone.label })),
                { value: NO_ZONE, label: 'No zone' },
              ]}
            />
          )
        })}
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-3 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
    </section>
  )
}
