// The four-category service log modal. Selecting a category swaps the entire field set, and Upgrade reveals the spec-override editor.
'use client'

import { useMemo, useState, useTransition } from 'react'
import { Droplet, Wrench, RefreshCw, Zap, Plus, Trash2, Mic } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { TextField, TextAreaField, SelectField, ToggleField } from '@/components/ui/Field'
import { checkOdometer, describeOdometerWarning } from '@/lib/calc/odometer'
import { submitOrQueue } from '@/lib/offline/sync'
import { createRevisionId } from '@/lib/offline/uuid'
import { AttachmentPicker, type PendingAttachment } from '@/components/AttachmentPicker'
import { HandsFreeLogger } from '@/components/voice/HandsFreeLogger'
import { ISO_DATE_LENGTH } from '@/lib/constants'
import type { ServiceLogDraft } from '@/lib/validation/service-log'
import type { ComponentSpec, LogCategory, SpecKind } from '@/types/servicecard'

interface LogModalProps {
  isOpen: boolean
  onClose: () => void
  initialCategory: LogCategory
  componentId: string
  componentName: string
  vehicleSlug: string
  currentOdometer: number
  specs: ComponentSpec[]
}

const CATEGORY_TABS: Array<{
  value: LogCategory
  label: string
  Icon: typeof Droplet
  blurb: string
}> = [
  { value: 'maintenance', label: 'Maintenance', Icon: Droplet, blurb: 'Routine, scheduled upkeep' },
  { value: 'repair', label: 'Repair', Icon: Wrench, blurb: 'Fixing something that failed' },
  { value: 'replace', label: 'Replace', Icon: RefreshCw, blurb: 'Swapping a worn part' },
  { value: 'upgrade', label: 'Upgrade', Icon: Zap, blurb: 'Aftermarket or custom work' },
]

const SPEC_KIND_OPTIONS: Array<{ value: SpecKind; label: string }> = [
  { value: 'torque', label: 'Torque' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'fluid', label: 'Fluid' },
  { value: 'tool', label: 'Tool' },
  { value: 'part_number', label: 'Part number' },
  { value: 'interval', label: 'Interval' },
]

interface DraftOverride {
  specKey: string
  kind: SpecKind
  label: string
  newValue: string
  unit: string
  supersededValue: string | null
}

function emptyDraft(currentOdometer: number): ServiceLogDraft {
  return {
    performedOn: new Date().toISOString().slice(0, ISO_DATE_LENGTH),
    odometer: String(currentOdometer),
    notes: '',
    fluidType: '',
    quantity: '',
    quantityUnit: 'qt',
    filterPartNumber: '',
    appliedTorque: '',
    nextIntervalMiles: '',
    nextIntervalDays: '',
    symptom: '',
    diagnosis: '',
    actionTaken: '',
    recheckMiles: '',
    recheckDays: '',
    oldPartNumber: '',
    newPartNumber: '',
    brand: '',
    supplier: '',
    cost: '',
    warrantyExpiresOn: '',
    upgradeBrand: '',
    productName: '',
    installNotes: '',
    referenceUrl: '',
  }
}

/**
 * Records one service entry in exactly one of four categories (FR-016).
 *
 * Switching category swaps the visible field set entirely and keeps only the
 * three fields every category shares — date, odometer, and notes (FR-017). The
 * database enforces the same exclusivity with CHECK constraints, so a Repair
 * carrying a warranty date is rejected in two independent places.
 */
export function LogModal({
  isOpen,
  onClose,
  initialCategory,
  componentId,
  componentName,
  vehicleSlug,
  currentOdometer,
  specs,
}: LogModalProps) {
  // Null means "whatever the button that opened this asked for". Only a tab
  // press inside the sheet overrides it, and only until the sheet closes —
  // holding the category outright meant the modal kept the first one it ever
  // saw, so Repair and Upgrade both opened the Maintenance form.
  const [categoryOverride, setCategoryOverride] = useState<LogCategory | null>(null)
  const [draft, setDraft] = useState<ServiceLogDraft>(() => emptyDraft(currentOdometer))
  const [overrides, setOverrides] = useState<DraftOverride[]>([])
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [odometerConfirmed, setOdometerConfirmed] = useState(false)
  const [isHandsFree, setIsHandsFree] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const activeCategory = categoryOverride ?? initialCategory

  const setField = (field: keyof ServiceLogDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  /**
   * Writes a spoken answer into the draft.
   *
   * Goes through the same path as typing, including clearing the confirmation
   * on an unusual odometer — otherwise a reading confirmed by hand could carry
   * over to a completely different one given by voice.
   */
  const recordSpokenAnswer = (field: keyof ServiceLogDraft, value: string) => {
    setField(field, value)
    if (field === 'odometer') setOdometerConfirmed(false)
  }

  const odometerCheck = useMemo(
    () => checkOdometer(Number(draft.odometer || 0), currentOdometer),
    [draft.odometer, currentOdometer],
  )

  const handleCategoryChange = (next: LogCategory) => {
    setCategoryOverride(next)
    setFormError(null)
    // A different category asks different questions, so a run in progress is
    // now asking about fields that no longer exist.
    setIsHandsFree(false)
    // Shared fields survive the switch; nothing else does.
    setDraft((previous) => ({
      ...emptyDraft(currentOdometer),
      performedOn: previous.performedOn,
      odometer: previous.odometer,
      notes: previous.notes,
    }))
    if (next !== 'upgrade') setOverrides([])
  }

  /** Closes the sheet and forgets anything chosen inside it. */
  const handleClose = () => {
    setCategoryOverride(null)
    setIsHandsFree(false)
    onClose()
  }

  const handleSubmit = () => {
    setFormError(null)

    if (!odometerCheck.isAcceptable && !odometerConfirmed) {
      setFormError(describeOdometerWarning(odometerCheck))
      return
    }

    startSaving(async () => {
      // Generated here, on the device, before the record leaves it. This is
      // what makes a retry after an ambiguous failure a no-op rather than a
      // duplicate (FR-041).
      const revisionId = createRevisionId()

      // Always through the outbox, online or not: the entry is durable before
      // anything can go wrong with the network, and one code path means the
      // offline route cannot rot for want of exercise (FR-039).
      const result = await submitOrQueue('service_revision', revisionId, {
        revisionId,
        entryId: createRevisionId(),
        componentId,
        vehicleSlug,
        category: activeCategory,
        draft,
        specOverrides: activeCategory === 'upgrade' ? overrides : [],
        attachmentIds: attachments.map((attachment) => attachment.id),
      })

      if (result.error) {
        setFormError(result.error)
        return
      }

      setDraft(emptyDraft(currentOdometer))
      setOverrides([])
      setAttachments([])
      setOdometerConfirmed(false)
      handleClose()
    })
  }

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleClose}
      title={`Log — ${componentName}`}
      headerAction={
        <button
          type="button"
          onClick={() => setIsHandsFree(true)}
          aria-label="Hands-free — ask me the questions"
          aria-pressed={isHandsFree}
          className={`flex min-h-touch min-w-touch items-center justify-center rounded-card active:bg-surface ${
            isHandsFree ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          <Mic size={22} aria-hidden />
        </button>
      }
      footer={
        <Button variant="primary" size="large" fullWidth onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save entry'}
        </Button>
      }
    >
      <CategoryTabs value={activeCategory} onChange={handleCategoryChange} />

      <div className="mt-4 space-y-4">
        {/*
          Only present once asked for. Its entry point lives in the header,
          because a control parked above the fields pushes them off a phone
          screen for everyone who just wants to type.
        */}
        {isHandsFree ? (
          <HandsFreeLogger
            category={activeCategory}
            onAnswer={recordSpokenAnswer}
            onFinish={() => setIsHandsFree(false)}
          />
        ) : null}

        {/* Shared by every category */}
        <TextField
          label="Date"
          type="date"
          value={draft.performedOn}
          onChange={(event) => setField('performedOn', event.target.value)}
        />

        <TextField
          label="Odometer"
          type="number"
          unit="mi"
          value={draft.odometer}
          onChange={(event) => {
            setField('odometer', event.target.value)
            setOdometerConfirmed(false)
          }}
          error={describeOdometerWarning(odometerCheck)}
        />

        {!odometerCheck.isAcceptable ? (
          <ToggleField
            label="Save this reading anyway"
            hint="Confirms an unusual odometer value"
            checked={odometerConfirmed}
            onChange={setOdometerConfirmed}
          />
        ) : null}

        {/* Category-specific — only one of these ever renders */}
        {activeCategory === 'maintenance' ? (
          <MaintenanceFields draft={draft} setField={setField} />
        ) : null}
        {activeCategory === 'repair' ? <RepairFields draft={draft} setField={setField} /> : null}
        {activeCategory === 'replace' ? <ReplaceFields draft={draft} setField={setField} /> : null}
        {activeCategory === 'upgrade' ? (
          <UpgradeFields
            draft={draft}
            setField={setField}
            overrides={overrides}
            setOverrides={setOverrides}
            specs={specs}
          />
        ) : null}

        <AttachmentPicker attachments={attachments} onChange={setAttachments} />

        <TextAreaField
          label="Notes"
          value={draft.notes}
          placeholder="Anything the next person under this vehicle should know"
          onChange={(event) => setField('notes', event.target.value)}
        />

        {formError ? (
          <p
            role="alert"
            className="rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}

function CategoryTabs({
  value,
  onChange,
}: {
  value: LogCategory
  onChange: (next: LogCategory) => void
}) {
  return (
    <div role="tablist" aria-label="Log category" className="grid grid-cols-2 gap-2">
      {CATEGORY_TABS.map((tab) => {
        const isActive = tab.value === value
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={`flex min-h-touch flex-col items-start gap-0.5 rounded-card border px-3 py-2.5 text-left transition-colors ${
              isActive
                ? 'border-accent bg-accent/10 text-text-primary'
                : 'border-border bg-surface-sunken text-text-secondary'
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <tab.Icon size={15} aria-hidden />
              {tab.label}
            </span>
            <span className="text-[0.7rem] leading-tight text-text-muted">{tab.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}

type SetField = (field: keyof ServiceLogDraft, value: string) => void

function MaintenanceFields({ draft, setField }: { draft: ServiceLogDraft; setField: SetField }) {
  return (
    <>
      <TextField
        label="Fluid or consumable"
        placeholder="75W-90 Synthetic Gear Oil"
        value={draft.fluidType}
        onChange={(event) => setField('fluidType', event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Quantity used"
          type="number"
          step="0.1"
          value={draft.quantity}
          onChange={(event) => setField('quantity', event.target.value)}
        />
        <SelectField
          label="Unit"
          value={draft.quantityUnit}
          onChange={(event) => setField('quantityUnit', event.target.value)}
          options={[
            { value: 'qt', label: 'Quarts' },
            { value: 'gal', label: 'Gallons' },
            { value: 'L', label: 'Liters' },
            { value: 'oz', label: 'Ounces' },
          ]}
        />
      </div>
      <TextField
        label="Filter part #"
        placeholder="FL-500S"
        value={draft.filterPartNumber}
        onChange={(event) => setField('filterPartNumber', event.target.value)}
      />
      <TextField
        label="Torque applied"
        unit="ft-lbs"
        placeholder="24"
        value={draft.appliedTorque}
        onChange={(event) => setField('appliedTorque', event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Next due in"
          type="number"
          unit="mi"
          value={draft.nextIntervalMiles}
          onChange={(event) => setField('nextIntervalMiles', event.target.value)}
        />
        <TextField
          label="Or in"
          type="number"
          unit="days"
          value={draft.nextIntervalDays}
          onChange={(event) => setField('nextIntervalDays', event.target.value)}
        />
      </div>
    </>
  )
}

function RepairFields({ draft, setField }: { draft: ServiceLogDraft; setField: SetField }) {
  return (
    <>
      <TextAreaField
        label="Symptom"
        placeholder="Weeping gear oil at the pinion seal"
        value={draft.symptom}
        onChange={(event) => setField('symptom', event.target.value)}
      />
      <TextAreaField
        label="Diagnosis / root cause"
        value={draft.diagnosis}
        onChange={(event) => setField('diagnosis', event.target.value)}
      />
      <TextAreaField
        label="Action taken"
        value={draft.actionTaken}
        onChange={(event) => setField('actionTaken', event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Re-check after"
          type="number"
          unit="mi"
          placeholder="50"
          hint="Surfaces on this card once passed"
          value={draft.recheckMiles}
          onChange={(event) => setField('recheckMiles', event.target.value)}
        />
        <TextField
          label="Or after"
          type="number"
          unit="days"
          value={draft.recheckDays}
          onChange={(event) => setField('recheckDays', event.target.value)}
        />
      </div>
    </>
  )
}

function ReplaceFields({ draft, setField }: { draft: ServiceLogDraft; setField: SetField }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Old part #"
          value={draft.oldPartNumber}
          onChange={(event) => setField('oldPartNumber', event.target.value)}
        />
        <TextField
          label="New part #"
          value={draft.newPartNumber}
          onChange={(event) => setField('newPartNumber', event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Brand"
          value={draft.brand}
          onChange={(event) => setField('brand', event.target.value)}
        />
        <TextField
          label="Supplier"
          value={draft.supplier}
          onChange={(event) => setField('supplier', event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Cost"
          type="number"
          step="0.01"
          unit="USD"
          value={draft.cost}
          onChange={(event) => setField('cost', event.target.value)}
        />
        <TextField
          label="Warranty until"
          type="date"
          value={draft.warrantyExpiresOn}
          onChange={(event) => setField('warrantyExpiresOn', event.target.value)}
        />
      </div>
    </>
  )
}

function UpgradeFields({
  draft,
  setField,
  overrides,
  setOverrides,
  specs,
}: {
  draft: ServiceLogDraft
  setField: SetField
  overrides: DraftOverride[]
  setOverrides: (next: DraftOverride[]) => void
  specs: ComponentSpec[]
}) {
  const addOverride = () => {
    setOverrides([
      ...overrides,
      { specKey: '', kind: 'torque', label: '', newValue: '', unit: '', supersededValue: null },
    ])
  }

  const updateOverride = (index: number, patch: Partial<DraftOverride>) => {
    setOverrides(
      overrides.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
  }

  return (
    <>
      <TextField
        label="Brand"
        placeholder="ARB"
        value={draft.upgradeBrand}
        onChange={(event) => setField('upgradeBrand', event.target.value)}
      />
      <TextField
        label="Product name"
        placeholder="Air Locker Differential Cover"
        value={draft.productName}
        onChange={(event) => setField('productName', event.target.value)}
      />
      <TextAreaField
        label="Install notes"
        placeholder="Trimmed splash shield 0.5 in for clearance"
        value={draft.installNotes}
        onChange={(event) => setField('installNotes', event.target.value)}
      />
      <TextField
        label="Manual or guide URL"
        type="url"
        placeholder="https://…"
        value={draft.referenceUrl}
        onChange={(event) => setField('referenceUrl', event.target.value)}
      />

      {/*
        The reason this category exists as its own thing. Once an aftermarket
        part is installed, the factory manual has stopped applying — so the
        specs recorded here take over the HUD for everyone who taps this tag
        afterwards (FR-022, FR-009).
      */}
      <section className="rounded-card border border-upgrade/40 bg-upgrade/5 p-3">
        <h3 className="text-sm font-bold text-upgrade">Specs this upgrade changes</h3>
        <p className="mt-1 text-xs text-text-muted">
          These replace the factory values on the card. Leave empty if nothing changed.
        </p>

        <div className="mt-3 space-y-3">
          {overrides.map((override, index) => (
            <div key={index} className="rounded-card border border-border bg-surface-sunken p-3">
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Spec"
                  value={override.specKey}
                  onChange={(event) => {
                    const matched = specs.find((spec) => spec.specKey === event.target.value)
                    updateOverride(index, {
                      specKey: event.target.value,
                      label: matched?.label ?? '',
                      kind: matched?.kind ?? override.kind,
                      unit: matched?.unit ?? '',
                      // Record what the factory said at time of install, so the
                      // card can keep showing it after the override lands.
                      supersededValue: matched?.factoryValue ?? matched?.effectiveValue ?? null,
                    })
                  }}
                  options={[
                    { value: '', label: 'Choose…' },
                    ...specs.map((spec) => ({ value: spec.specKey, label: spec.label })),
                  ]}
                />
                <SelectField
                  label="Type"
                  value={override.kind}
                  onChange={(event) =>
                    updateOverride(index, { kind: event.target.value as SpecKind })
                  }
                  options={SPEC_KIND_OPTIONS}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <TextField
                  label="New value"
                  value={override.newValue}
                  onChange={(event) => updateOverride(index, { newValue: event.target.value })}
                />
                <TextField
                  label="Unit"
                  value={override.unit}
                  onChange={(event) => updateOverride(index, { unit: event.target.value })}
                />
              </div>

              {override.supersededValue ? (
                <p className="mt-2 text-xs text-text-muted">
                  Factory value <s>{override.supersededValue}</s> will be kept for reference.
                </p>
              ) : null}

              <Button
                variant="ghost"
                icon={<Trash2 size={16} aria-hidden />}
                onClick={() => setOverrides(overrides.filter((_, position) => position !== index))}
                className="mt-2 !min-h-touch text-sm"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          icon={<Plus size={16} aria-hidden />}
          onClick={addOverride}
          fullWidth
          className="mt-3"
        >
          Add a changed spec
        </Button>
      </section>
    </>
  )
}
