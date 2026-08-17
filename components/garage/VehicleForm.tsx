// The shared vehicle identity form, used both to add a vehicle and to edit one.
'use client'

import { useState } from 'react'
import { TextField, SelectField } from '@/components/ui/Field'
import type { PowerSource } from '@/types/servicecard'
import type { VehicleInput } from '@/lib/validation/vehicle'

const POWER_SOURCE_OPTIONS: Array<{ value: PowerSource; label: string }> = [
  { value: 'gasoline', label: 'Gasoline or diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'both', label: 'Plug-in hybrid' },
]

/** Widest sensible model year, so a typo cannot become a vehicle from 20014. */
const EARLIEST_YEAR = 1900
const LATEST_YEAR = 2100

export interface VehicleDraft {
  year: string
  make: string
  model: string
  trim: string
  nickname: string
  powerSource: PowerSource
}

export function emptyVehicleDraft(): VehicleDraft {
  return { year: '', make: '', model: '', trim: '', nickname: '', powerSource: 'gasoline' }
}

/** Turns the form's strings into the shape the schema and the database expect. */
export function toVehicleInput(draft: VehicleDraft): VehicleInput {
  const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim())

  return {
    year: draft.year.trim() === '' ? null : Number(draft.year),
    make: blankToNull(draft.make),
    model: blankToNull(draft.model),
    trim: blankToNull(draft.trim),
    nickname: blankToNull(draft.nickname),
    powerSource: draft.powerSource,
  }
}

interface VehicleFormProps {
  draft: VehicleDraft
  onChange: (next: VehicleDraft) => void
}

/**
 * Collects what a vehicle is.
 *
 * Every identity field is optional except the power source, which is not: it
 * decides which energy loggers the vehicle can ever open, and guessing it wrong
 * offers a charge log to a diesel (FR-029).
 */
export function VehicleForm({ draft, onChange }: VehicleFormProps) {
  const setField = (field: keyof VehicleDraft, value: string) => {
    onChange({ ...draft, [field]: value })
  }

  return (
    <div className="space-y-4">
      <TextField
        label="Nickname"
        placeholder="Raptor"
        hint="What you actually call it. Shown everywhere in place of the model."
        value={draft.nickname}
        onChange={(event) => setField('nickname', event.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Year"
          type="number"
          inputMode="numeric"
          min={EARLIEST_YEAR}
          max={LATEST_YEAR}
          placeholder="2014"
          value={draft.year}
          onChange={(event) => setField('year', event.target.value)}
        />
        <TextField
          label="Make"
          placeholder="Ford"
          value={draft.make}
          onChange={(event) => setField('make', event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Model"
          placeholder="F-150"
          value={draft.model}
          onChange={(event) => setField('model', event.target.value)}
        />
        <TextField
          label="Trim"
          placeholder="Raptor"
          value={draft.trim}
          onChange={(event) => setField('trim', event.target.value)}
        />
      </div>

      <SelectField
        label="Power source"
        hint="Decides which energy loggers this vehicle can open."
        value={draft.powerSource}
        onChange={(event) => setField('powerSource', event.target.value)}
        options={POWER_SOURCE_OPTIONS}
      />
    </div>
  )
}

/** Keeps the form and the stored record in one shape when opening an edit. */
export function toVehicleDraft(vehicle: {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  nickname: string | null
  powerSource: PowerSource
}): VehicleDraft {
  return {
    year: vehicle.year === null ? '' : String(vehicle.year),
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    trim: vehicle.trim ?? '',
    nickname: vehicle.nickname ?? '',
    powerSource: vehicle.powerSource,
  }
}

/** Local state helper so both callers start from the same empty draft. */
export function useVehicleDraft(initial: VehicleDraft = emptyVehicleDraft()) {
  return useState<VehicleDraft>(initial)
}
