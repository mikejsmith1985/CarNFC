// Puts parts on a vehicle without needing a tag stuck to each one first.
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Wrench, Fuel, BatteryCharging } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { addCustomPart, addPartsFromLibrary } from '@/app/actions/components'
import type { ComponentTemplateSummary } from '@/lib/claim/compatibility'

export interface PartOption extends ComponentTemplateSummary {
  /** Whether this part starts ticked, so the common case is one press. */
  isPreselected: boolean
}

interface AddPartsProps {
  vehicleId: string
  heading: string
  description: string
  parts: PartOption[]
  /** Offers a free-text part for anything the seeded library does not cover. */
  canNameOwnPart?: boolean
  /** Where a hand-named part lands, so a zone badge can show what it created. */
  zoneKey?: string | null
  /** Wording for the confirm button, which differs between setup and topping up. */
  actionLabel?: string
}

/**
 * Chooses parts from the library and creates them on the vehicle.
 *
 * A part used to exist only as the thing a claimed tag pointed at, which meant
 * a vehicle with one zone badge on it had no parts at all — and the badge
 * opened to an empty screen offering no way to fix that. Parts and tags are
 * separate concerns here: a part can exist with no tag on it, and gains one
 * later if the owner ever sticks one there.
 */
export function AddParts({
  vehicleId,
  heading,
  description,
  parts,
  canNameOwnPart = false,
  zoneKey = null,
  actionLabel = 'Add these parts',
}: AddPartsProps) {
  const router = useRouter()
  const isReady = useIsHydrated()

  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    parts.filter((part) => part.isPreselected).map((part) => part.key),
  )
  const [customName, setCustomName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  // Counted rather than flagged, because a refresh requested from inside the
  // transition that did the writing is swallowed: the parts land in the
  // database and the page keeps showing the empty state that created them.
  const [saveCount, setSaveCount] = useState(0)

  useEffect(() => {
    if (saveCount === 0) return
    router.refresh()
  }, [saveCount, router])

  const togglePart = (key: string) => {
    setSelectedKeys((previous) =>
      previous.includes(key) ? previous.filter((selected) => selected !== key) : [...previous, key],
    )
  }

  const handleAddSelected = () => {
    setFormError(null)
    startSaving(async () => {
      const result = await addPartsFromLibrary(vehicleId, selectedKeys)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setSelectedKeys([])
      setSaveCount((previous) => previous + 1)
    })
  }

  const handleAddCustom = () => {
    setFormError(null)
    startSaving(async () => {
      const result = await addCustomPart(vehicleId, customName, zoneKey)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setCustomName('')
      setSaveCount((previous) => previous + 1)
    })
  }

  if (parts.length === 0 && !canNameOwnPart) return null

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4"
      aria-label={heading}
      {...hydrationMarker(isReady)}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">{heading}</h2>
      <p className="mt-1 text-sm text-text-muted">{description}</p>

      {parts.length > 0 ? (
        <>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {parts.map((part) => (
              <li key={part.key}>
                <PartToggle
                  part={part}
                  isSelected={selectedKeys.includes(part.key)}
                  onToggle={() => togglePart(part.key)}
                />
              </li>
            ))}
          </ul>

          <Button
            fullWidth
            className="mt-3"
            icon={<Plus size={16} aria-hidden />}
            onClick={handleAddSelected}
            disabled={isSaving || selectedKeys.length === 0}
          >
            {isSaving ? 'Adding…' : `${actionLabel} (${selectedKeys.length})`}
          </Button>
        </>
      ) : null}

      {canNameOwnPart ? (
        <div className="mt-4 border-t border-border pt-4">
          <TextField
            label="Something else"
            placeholder="Winch, air compressor, roof rack…"
            hint="Anything the list above does not cover."
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
          />
          <Button
            variant="secondary"
            fullWidth
            className="mt-2"
            icon={<Plus size={16} aria-hidden />}
            onClick={handleAddCustom}
            disabled={isSaving || customName.trim() === ''}
          >
            Add this part
          </Button>
        </div>
      ) : null}

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

interface PartToggleProps {
  part: PartOption
  isSelected: boolean
  onToggle: () => void
}

/** One tickable part. A whole-tile target, because this is used in gloves. */
function PartToggle({ part, isSelected, onToggle }: PartToggleProps) {
  const Icon =
    part.energyModeHint === 'fuel'
      ? Fuel
      : part.energyModeHint === 'charge'
        ? BatteryCharging
        : Wrench

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      onClick={onToggle}
      className={`flex min-h-touch w-full items-center gap-2 rounded-card border px-3 py-3 text-left text-sm font-semibold ${
        isSelected
          ? 'border-accent bg-accent/10 text-text-primary'
          : 'border-border bg-surface-sunken text-text-secondary'
      }`}
    >
      {isSelected ? (
        <Check size={16} className="shrink-0 text-accent" aria-hidden />
      ) : (
        <Icon size={16} className="shrink-0 text-text-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">{part.displayName}</span>
    </button>
  )
}
