// Adds a vehicle from the garage, for anyone who wants one recorded before a tag ever goes on it.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { createVehicle } from '@/app/actions/claim'
import {
  VehicleForm,
  emptyVehicleDraft,
  toVehicleInput,
  type VehicleDraft,
} from '@/components/garage/VehicleForm'

/**
 * Adds a vehicle without claiming a tag first.
 *
 * Until now a vehicle could only be born inside the claim flow, which meant the
 * garage could show vehicles but never gain one — and someone setting up before
 * their tags arrive had nowhere to start (FR-048).
 */
export function AddVehicleSheet() {
  const router = useRouter()
  const isReady = useIsHydrated()

  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<VehicleDraft>(emptyVehicleDraft())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const handleClose = () => {
    setIsOpen(false)
    setFormError(null)
  }

  const handleSave = () => {
    setFormError(null)
    startSaving(async () => {
      const result = await createVehicle(toVehicleInput(draft))
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setDraft(emptyVehicleDraft())
      setIsOpen(false)
      router.push(`/v/${result.data.slug}`)
      router.refresh()
    })
  }

  return (
    <div {...hydrationMarker(isReady)}>
      <Button
        variant="secondary"
        fullWidth
        icon={<Plus size={18} aria-hidden />}
        onClick={() => setIsOpen(true)}
      >
        Add a vehicle
      </Button>

      <Sheet
        isOpen={isOpen}
        onClose={handleClose}
        title="Add a vehicle"
        footer={
          <Button variant="primary" size="large" fullWidth onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Adding…' : 'Add vehicle'}
          </Button>
        }
      >
        <VehicleForm draft={draft} onChange={setDraft} />

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
      </Sheet>
    </div>
  )
}
