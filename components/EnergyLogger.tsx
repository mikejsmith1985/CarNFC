// The energy logger a fuel-door or charge-port tag opens: ICE fuel-ups and EV charging sessions, with the resulting economy shown live.
'use client'

import { useMemo, useState, useTransition } from 'react'
import { Fuel, BatteryCharging } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField, SelectField, ToggleField } from '@/components/ui/Field'
import { calculateFuelInterval, deriveFuelCostFields, type EconomyGap } from '@/lib/calc/fuel'
import { calculateChargeSession } from '@/lib/calc/ev'
import { checkOdometer, describeOdometerWarning } from '@/lib/calc/odometer'
import { submitOrQueue } from '@/lib/offline/sync'
import { createRevisionId } from '@/lib/offline/uuid'
import { FUEL_GRADES, CHARGE_LOCATIONS } from '@/lib/validation/energy-log'
import { COST_PER_MILE_DECIMALS, UNIT_DISTANCE } from '@/lib/constants'
import type { EnergyMode, PowerSource } from '@/types/servicecard'

interface EnergyLoggerProps {
  vehicleId: string
  vehicleSlug: string
  powerSource: PowerSource
  modeHint: EnergyMode | null
  currentOdometer: number
  /** Odometer at the last energy entry, used to close the economy interval. */
  previousOdometer?: number | null
  /** Whether the previous fill was a full one — only then can economy be computed. */
  previousWasFullFill?: boolean
}

/** Explains why an interval produced no economy figure, rather than showing a blank (FR-033). */
const GAP_EXPLANATION: Record<EconomyGap, string> = {
  first_entry: 'First entry — economy appears from the next fill onward.',
  partial_fill: 'Partial fill: cost still counts, but economy needs two full fills.',
  missed_fill: 'A fill went unrecorded, so this interval cannot be measured.',
  no_distance: 'No distance covered since the last entry.',
}

/**
 * Records a fuel-up or a charging session.
 *
 * Which modes appear is decided by the vehicle's power source: a gasoline truck
 * never sees a state-of-charge field, and a plug-in hybrid gets both with the
 * tag's own placement pre-selected (FR-029).
 */
export function EnergyLogger({
  vehicleId,
  vehicleSlug,
  powerSource,
  modeHint,
  currentOdometer,
  previousOdometer = null,
  previousWasFullFill = true,
}: EnergyLoggerProps) {
  const availableModes = resolveAvailableModes(powerSource)
  const [mode, setMode] = useState<EnergyMode>(modeHint ?? availableModes[0] ?? 'fuel')

  return (
    <div className="px-4 py-5">
      {availableModes.length > 1 ? <ModeTabs value={mode} onChange={setMode} /> : null}

      {mode === 'fuel' ? (
        <FuelForm
          vehicleId={vehicleId}
          vehicleSlug={vehicleSlug}
          currentOdometer={currentOdometer}
          previousOdometer={previousOdometer}
          previousWasFullFill={previousWasFullFill}
        />
      ) : (
        <ChargeForm
          vehicleId={vehicleId}
          vehicleSlug={vehicleSlug}
          currentOdometer={currentOdometer}
          previousOdometer={previousOdometer}
        />
      )}
    </div>
  )
}

/** A vehicle only ever sees the modes its powertrain can actually use. */
function resolveAvailableModes(powerSource: PowerSource): EnergyMode[] {
  if (powerSource === 'gasoline') return ['fuel']
  if (powerSource === 'electric') return ['charge']
  return ['fuel', 'charge']
}

function ModeTabs({
  value,
  onChange,
}: {
  value: EnergyMode
  onChange: (next: EnergyMode) => void
}) {
  return (
    <div role="tablist" aria-label="Energy mode" className="mb-4 grid grid-cols-2 gap-2">
      <button
        role="tab"
        type="button"
        aria-selected={value === 'fuel'}
        onClick={() => onChange('fuel')}
        className={tabClasses(value === 'fuel')}
      >
        <Fuel size={18} aria-hidden />
        Fuel
      </button>
      <button
        role="tab"
        type="button"
        aria-selected={value === 'charge'}
        onClick={() => onChange('charge')}
        className={tabClasses(value === 'charge')}
      >
        <BatteryCharging size={18} aria-hidden />
        Charge
      </button>
    </div>
  )
}

function tabClasses(isActive: boolean): string {
  return `flex min-h-touch items-center justify-center gap-2 rounded-card border text-sm font-bold transition-colors ${
    isActive
      ? 'border-accent bg-accent/10 text-text-primary'
      : 'border-border bg-surface-sunken text-text-secondary'
  }`
}

// =============================================================================
// ICE
// =============================================================================

function FuelForm({
  vehicleId,
  vehicleSlug,
  currentOdometer,
  previousOdometer,
  previousWasFullFill,
}: {
  vehicleId: string
  vehicleSlug: string
  currentOdometer: number
  previousOdometer: number | null
  previousWasFullFill: boolean
}) {
  const [odometer, setOdometer] = useState(String(currentOdometer))
  const [volume, setVolume] = useState('')
  const [pricePerGallon, setPricePerGallon] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [grade, setGrade] = useState<string>('87')
  const [isFullFill, setIsFullFill] = useState(true)
  const [missedFillBefore, setMissedFillBefore] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const odometerCheck = checkOdometer(Number(odometer || 0), currentOdometer)

  /**
   * Fills in whichever of volume, unit price, and total cost was left blank.
   * Someone at a pump reads two numbers off the display; the third should not
   * need doing in their head (FR-031).
   */
  const applyDerivation = () => {
    const derived = deriveFuelCostFields({
      volumeGallons: toNumberOrNull(volume),
      pricePerGallon: toNumberOrNull(pricePerGallon),
      totalCost: toNumberOrNull(totalCost),
    })
    if (derived.volumeGallons !== null && volume === '') setVolume(String(derived.volumeGallons))
    if (derived.pricePerGallon !== null && pricePerGallon === '')
      setPricePerGallon(String(derived.pricePerGallon))
    if (derived.totalCost !== null && totalCost === '') setTotalCost(String(derived.totalCost))
  }

  const economy = useMemo(() => {
    const volumeValue = toNumberOrNull(volume)
    if (volumeValue === null || previousOdometer === null) {
      return calculateFuelInterval(
        {
          odometer: Number(odometer || 0),
          volumeGallons: volumeValue ?? 0,
          pricePerGallon: toNumberOrNull(pricePerGallon),
          totalCost: toNumberOrNull(totalCost),
          isFullFill,
          missedFillBefore,
        },
        null,
      )
    }

    return calculateFuelInterval(
      {
        odometer: Number(odometer || 0),
        volumeGallons: volumeValue,
        pricePerGallon: toNumberOrNull(pricePerGallon),
        totalCost: toNumberOrNull(totalCost),
        isFullFill,
        missedFillBefore,
      },
      {
        odometer: previousOdometer,
        volumeGallons: 1,
        pricePerGallon: null,
        totalCost: null,
        isFullFill: previousWasFullFill,
        missedFillBefore: false,
      },
    )
  }, [
    odometer,
    volume,
    pricePerGallon,
    totalCost,
    isFullFill,
    missedFillBefore,
    previousOdometer,
    previousWasFullFill,
  ])

  const handleSubmit = () => {
    setFormError(null)
    startSaving(async () => {
      const revisionId = createRevisionId()
      const result = await submitOrQueue('energy_revision', revisionId, {
        revisionId,
        entryId: createRevisionId(),
        vehicleId,
        vehicleSlug,
        mode: 'fuel',
        payload: {
          odometer: Number(odometer || 0),
          volumeGallons: toNumberOrNull(volume),
          pricePerGallon: toNumberOrNull(pricePerGallon),
          totalCost: toNumberOrNull(totalCost),
          fuelGrade: grade,
          isFullFill,
          missedFillBefore,
        },
      })
      if (result.error) setFormError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <TextField
        label="Odometer"
        type="number"
        unit={UNIT_DISTANCE}
        value={odometer}
        onChange={(event) => setOdometer(event.target.value)}
        error={describeOdometerWarning(odometerCheck)}
      />

      <TextField
        label="Gallons pumped"
        type="number"
        step="0.001"
        unit="gal"
        value={volume}
        onChange={(event) => setVolume(event.target.value)}
        onBlur={applyDerivation}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Price / gal"
          type="number"
          step="0.001"
          unit="USD"
          value={pricePerGallon}
          onChange={(event) => setPricePerGallon(event.target.value)}
          onBlur={applyDerivation}
        />
        <TextField
          label="Total cost"
          type="number"
          step="0.01"
          unit="USD"
          value={totalCost}
          onChange={(event) => setTotalCost(event.target.value)}
          onBlur={applyDerivation}
        />
      </div>

      <SelectField
        label="Grade"
        value={grade}
        onChange={(event) => setGrade(event.target.value)}
        options={FUEL_GRADES.map((value) => ({ value, label: value }))}
      />

      <ToggleField
        label="Filled the tank"
        hint="Only a full fill closes an economy interval"
        checked={isFullFill}
        onChange={setIsFullFill}
      />

      <ToggleField
        label="A fill went unrecorded"
        hint="Excludes this interval from economy, keeps the cost"
        checked={missedFillBefore}
        onChange={setMissedFillBefore}
      />

      <ResultPanel
        rows={[
          {
            label: 'Miles this tank',
            value:
              economy.milesCovered !== null ? `${economy.milesCovered.toLocaleString()} mi` : '—',
          },
          {
            label: 'Economy',
            value: economy.milesPerGallon !== null ? `${economy.milesPerGallon} mpg` : '—',
          },
          {
            label: 'Cost per mile',
            value:
              economy.costPerMile !== null
                ? `$${economy.costPerMile.toFixed(COST_PER_MILE_DECIMALS)}`
                : '—',
          },
        ]}
        note={economy.gap ? GAP_EXPLANATION[economy.gap] : null}
      />

      {formError ? <ErrorNote message={formError} /> : null}

      <Button variant="primary" size="large" fullWidth onClick={handleSubmit} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save fill-up'}
      </Button>
    </div>
  )
}

// =============================================================================
// EV
// =============================================================================

function ChargeForm({
  vehicleId,
  vehicleSlug,
  currentOdometer,
  previousOdometer,
}: {
  vehicleId: string
  vehicleSlug: string
  currentOdometer: number
  previousOdometer: number | null
}) {
  const [odometer, setOdometer] = useState(String(currentOdometer))
  const [socStart, setSocStart] = useState('')
  const [socEnd, setSocEnd] = useState('')
  const [energyKwh, setEnergyKwh] = useState('')
  const [location, setLocation] = useState<string>('home')
  const [sessionCost, setSessionCost] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const odometerCheck = checkOdometer(Number(odometer || 0), currentOdometer)
  const socStartValue = toNumberOrNull(socStart)
  const socEndValue = toNumberOrNull(socEnd)

  // A session cannot end with less charge than it started with (FR-036).
  const socError =
    socStartValue !== null && socEndValue !== null && socEndValue < socStartValue
      ? 'Ending charge cannot be lower than starting charge'
      : null

  const session = useMemo(
    () =>
      calculateChargeSession(
        {
          odometer: Number(odometer || 0),
          socStartPct: socStartValue ?? 0,
          socEndPct: socEndValue ?? 0,
          energyKwh: toNumberOrNull(energyKwh) ?? 0,
          sessionCost: toNumberOrNull(sessionCost),
        },
        previousOdometer,
      ),
    [odometer, socStartValue, socEndValue, energyKwh, sessionCost, previousOdometer],
  )

  const handleSubmit = () => {
    setFormError(null)
    if (socError) {
      setFormError(socError)
      return
    }
    startSaving(async () => {
      const revisionId = createRevisionId()
      const result = await submitOrQueue('energy_revision', revisionId, {
        revisionId,
        entryId: createRevisionId(),
        vehicleId,
        vehicleSlug,
        mode: 'charge',
        payload: {
          odometer: Number(odometer || 0),
          socStartPct: socStartValue,
          socEndPct: socEndValue,
          energyKwh: toNumberOrNull(energyKwh),
          chargeLocation: location,
          sessionCost: toNumberOrNull(sessionCost),
        },
      })
      if (result.error) setFormError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <TextField
        label="Odometer"
        type="number"
        unit={UNIT_DISTANCE}
        value={odometer}
        onChange={(event) => setOdometer(event.target.value)}
        error={describeOdometerWarning(odometerCheck)}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Start charge"
          type="number"
          min={0}
          max={100}
          unit="%"
          value={socStart}
          onChange={(event) => setSocStart(event.target.value)}
        />
        <TextField
          label="End charge"
          type="number"
          min={0}
          max={100}
          unit="%"
          value={socEnd}
          onChange={(event) => setSocEnd(event.target.value)}
          error={socError}
        />
      </div>

      <TextField
        label="Energy delivered"
        type="number"
        step="0.001"
        unit="kWh"
        value={energyKwh}
        onChange={(event) => setEnergyKwh(event.target.value)}
      />

      <SelectField
        label="Charged at"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        options={CHARGE_LOCATIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
      />

      <TextField
        label="Session cost"
        type="number"
        step="0.01"
        unit="USD"
        value={sessionCost}
        onChange={(event) => setSessionCost(event.target.value)}
      />

      <ResultPanel
        rows={[
          { label: 'Charge added', value: `${session.socGainedPct}%` },
          {
            label: 'Efficiency',
            value: session.milesPerKwh !== null ? `${session.milesPerKwh} mi/kWh` : '—',
          },
          {
            label: 'Consumption',
            value: session.wattHoursPerMile !== null ? `${session.wattHoursPerMile} Wh/mi` : '—',
          },
          {
            label: 'Cost per kWh',
            value:
              session.costPerKwh !== null
                ? `$${session.costPerKwh.toFixed(COST_PER_MILE_DECIMALS)}`
                : '—',
          },
          {
            label: 'Cost per mile',
            value:
              session.costPerMile !== null
                ? `$${session.costPerMile.toFixed(COST_PER_MILE_DECIMALS)}`
                : '—',
          },
        ]}
        note={
          previousOdometer === null
            ? 'First entry — efficiency appears from the next session onward.'
            : null
        }
      />

      {formError ? <ErrorNote message={formError} /> : null}

      <Button variant="primary" size="large" fullWidth onClick={handleSubmit} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save session'}
      </Button>
    </div>
  )
}

// =============================================================================
// Shared presentation
// =============================================================================

function ResultPanel({
  rows,
  note,
}: {
  rows: Array<{ label: string; value: string }>
  note: string | null
}) {
  return (
    <section className="rounded-card border border-border-strong bg-surface-raised p-3">
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-text-secondary">{row.label}</dt>
            <dd className="text-base font-bold tabular text-text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
      {note ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-text-muted">{note}</p>
      ) : null}
    </section>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  )
}

/** Empty strings mean "not entered", which is different from zero. */
function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}
