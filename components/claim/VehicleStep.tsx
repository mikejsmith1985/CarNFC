// Claim wizard step one: pick an existing vehicle, or add one without leaving the flow.
'use client'

import { useState, useTransition } from 'react'
import { Car, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField, SelectField } from '@/components/ui/Field'
import { createVehicle } from '@/app/actions/claim'
import type { PowerSource } from '@/types/servicecard'

export interface VehicleOption {
  id: string
  slug: string
  label: string
  powerSource: PowerSource
}

interface VehicleStepProps {
  vehicles: VehicleOption[]
  onSelect: (vehicle: VehicleOption) => void
}

const POWER_SOURCE_OPTIONS = [
  { value: 'gasoline', label: 'Gasoline or diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'both', label: 'Plug-in hybrid (both)' },
]

/**
 * Chooses the vehicle this tag belongs to.
 *
 * Someone claiming their very first tag has no vehicles yet, so the create form
 * lives inside this step. Sending them elsewhere would drop the pending tag id
 * and put them back at the start of a flow they are standing in a driveway for.
 */
export function VehicleStep({ vehicles, onSelect }: VehicleStepProps) {
  const [isAdding, setIsAdding] = useState(vehicles.length === 0)
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [trim, setTrim] = useState('')
  const [nickname, setNickname] = useState('')
  const [powerSource, setPowerSource] = useState<PowerSource>('gasoline')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const handleCreate = () => {
    setFormError(null)
    startSaving(async () => {
      const result = await createVehicle({
        year: year.trim() === '' ? null : Number(year),
        make: make.trim() || null,
        model: model.trim() || null,
        trim: trim.trim() || null,
        nickname: nickname.trim() || null,
        powerSource,
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      onSelect({
        id: result.data.vehicleId,
        slug: result.data.slug,
        label: nickname.trim() || [year, make, model].filter(Boolean).join(' ') || 'Vehicle',
        powerSource,
      })
    })
  }

  if (!isAdding) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
          Which vehicle?
        </h2>

        {vehicles.map((vehicle) => (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelect(vehicle)}
            className="flex min-h-touch w-full items-center gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 text-left active:bg-border"
          >
            <Car size={20} className="shrink-0 text-text-secondary" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{vehicle.label}</span>
              <span className="block text-xs text-text-muted">/{vehicle.slug}</span>
            </span>
          </button>
        ))}

        <Button
          variant="secondary"
          fullWidth
          icon={<Plus size={18} aria-hidden />}
          onClick={() => setIsAdding(true)}
        >
          Add a vehicle
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
        Add a vehicle
      </h2>

      <TextField
        label="Nickname"
        placeholder="Raptor"
        hint="What you actually call it. Becomes part of the address."
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
      />

      <div className="grid grid-cols-3 gap-3">
        <TextField
          label="Year"
          type="number"
          value={year}
          onChange={(event) => setYear(event.target.value)}
        />
        <TextField
          label="Make"
          placeholder="Ford"
          value={make}
          onChange={(event) => setMake(event.target.value)}
        />
        <TextField
          label="Model"
          placeholder="F-150"
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
      </div>

      <TextField
        label="Trim"
        placeholder="Raptor"
        value={trim}
        onChange={(event) => setTrim(event.target.value)}
      />

      {/* Decides which energy loggers this vehicle can ever open (FR-029). */}
      <SelectField
        label="Power source"
        value={powerSource}
        onChange={(event) => setPowerSource(event.target.value as PowerSource)}
        options={POWER_SOURCE_OPTIONS}
        hint="Determines whether fuel or charging tags apply."
      />

      {formError ? (
        <p
          role="alert"
          className="rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}

      <Button variant="primary" size="large" fullWidth onClick={handleCreate} disabled={isSaving}>
        {isSaving ? 'Adding…' : 'Add vehicle'}
      </Button>

      {vehicles.length > 0 ? (
        <Button variant="ghost" fullWidth onClick={() => setIsAdding(false)}>
          Back to my vehicles
        </Button>
      ) : null}
    </div>
  )
}
