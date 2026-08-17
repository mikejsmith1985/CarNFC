// Editing and deleting one vehicle, from the vehicle's own page.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { updateVehicle, deleteVehicle } from '@/app/actions/vehicle'
import {
  VehicleForm,
  toVehicleDraft,
  toVehicleInput,
  type VehicleDraft,
} from '@/components/garage/VehicleForm'
import type { PowerSource } from '@/types/servicecard'

interface VehicleSettingsProps {
  vehicleId: string
  /** What the owner sees this vehicle called, and what they must retype to delete it. */
  displayName: string
  vehicle: {
    year: number | null
    make: string | null
    model: string | null
    trim: string | null
    nickname: string | null
    powerSource: PowerSource
  }
}

/**
 * Lets the owner correct or remove a vehicle (FR-048).
 *
 * Deletion is kept behind retyping the name rather than a second tap. It takes
 * the components, the tag bindings and the whole service history with it, and
 * that history is the entire point of the product.
 */
export function VehicleSettings({ vehicleId, displayName, vehicle }: VehicleSettingsProps) {
  const router = useRouter()
  const isReady = useIsHydrated()

  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [draft, setDraft] = useState<VehicleDraft>(() => toVehicleDraft(vehicle))
  const [confirmationText, setConfirmationText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isWorking, startWorking] = useTransition()

  const handleSave = () => {
    setFormError(null)
    startWorking(async () => {
      const result = await updateVehicle({ vehicleId, ...toVehicleInput(draft) })
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setIsEditing(false)
      router.refresh()
    })
  }

  const handleDelete = () => {
    setFormError(null)
    startWorking(async () => {
      const result = await deleteVehicle(vehicleId, confirmationText, displayName)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setIsDeleting(false)
      router.push('/garage')
      router.refresh()
    })
  }

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4"
      aria-label="Vehicle settings"
      {...hydrationMarker(isReady)}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
        This vehicle
      </h2>

      <div className="mt-3 space-y-2">
        <Button
          variant="secondary"
          fullWidth
          icon={<Pencil size={16} aria-hidden />}
          onClick={() => {
            setDraft(toVehicleDraft(vehicle))
            setIsEditing(true)
          }}
        >
          Edit details
        </Button>

        <Button
          variant="danger"
          fullWidth
          icon={<Trash2 size={16} aria-hidden />}
          onClick={() => {
            setConfirmationText('')
            setFormError(null)
            setIsDeleting(true)
          }}
        >
          Delete this vehicle
        </Button>
      </div>

      <Sheet
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit vehicle"
        footer={
          <Button
            variant="primary"
            size="large"
            fullWidth
            onClick={handleSave}
            disabled={isWorking}
          >
            {isWorking ? 'Saving…' : 'Save changes'}
          </Button>
        }
      >
        <VehicleForm draft={draft} onChange={setDraft} />

        <p className="mt-4 text-xs text-text-muted">
          The odometer is not editable here. It follows the highest reading you have logged, so it
          stays true to the entries rather than to a number typed once.
        </p>

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
      </Sheet>

      <Sheet
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        title="Delete vehicle"
        footer={
          <Button
            variant="danger"
            size="large"
            fullWidth
            onClick={handleDelete}
            disabled={isWorking || confirmationText.trim() === ''}
          >
            {isWorking ? 'Deleting…' : 'Delete forever'}
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          This removes <span className="font-semibold text-text-primary">{displayName}</span>, every
          component on it, and its entire service history. It cannot be undone.
        </p>

        <p className="mt-3 text-sm text-text-muted">
          The physical tags survive. They become unclaimed, so you can stick them on something else
          and tap them again.
        </p>

        <div className="mt-4">
          <TextField
            label={`Type ${displayName} to confirm`}
            value={confirmationText}
            autoComplete="off"
            onChange={(event) => setConfirmationText(event.target.value)}
          />
        </div>

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
      </Sheet>
    </section>
  )
}
