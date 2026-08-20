// Editor for a component's factory specifications, so any pre-populated value can be corrected.
'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { TextField, SelectField } from '@/components/ui/Field'
import { saveComponentSpecs } from '@/app/actions/specs'
import type { ComponentSpec, SpecKind } from '@/types/servicecard'

interface SpecEditorProps {
  isOpen: boolean
  onClose: () => void
  componentId: string
  vehicleSlug: string
  specs: ComponentSpec[]
}

interface SpecDraft {
  specKey: string
  kind: SpecKind
  label: string
  value: string
  unit: string
}

const SPEC_KIND_OPTIONS: Array<{ value: SpecKind; label: string }> = [
  { value: 'tool', label: 'Tool' },
  { value: 'torque', label: 'Torque' },
  { value: 'fluid', label: 'Fluid' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'part_number', label: 'Part number' },
  { value: 'interval', label: 'Interval' },
]

/**
 * Edits the factory specification set for a component.
 *
 * The seeded library is a convenience, not authoritative manufacturer data, so
 * every value it pre-fills has to be correctable. Only factory specs are edited
 * here — a value an upgrade overrode belongs to that upgrade's log entry, and
 * changing it here would silently rewrite recorded history.
 */
export function SpecEditor({ isOpen, onClose, componentId, vehicleSlug, specs }: SpecEditorProps) {
  const [drafts, setDrafts] = useState<SpecDraft[]>(() =>
    specs
      .filter((spec) => spec.origin === 'factory')
      .map((spec) => ({
        specKey: spec.specKey,
        kind: spec.kind,
        label: spec.label,
        value: spec.effectiveValue,
        unit: spec.unit ?? '',
      })),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const overriddenCount = specs.filter((spec) => spec.origin === 'override').length

  const updateDraft = (index: number, patch: Partial<SpecDraft>) => {
    setDrafts(
      drafts.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
    )
  }

  const handleSave = () => {
    setFormError(null)
    startSaving(async () => {
      const result = await saveComponentSpecs({
        componentId,
        vehicleSlug,
        specs: drafts.filter((draft) => draft.label.trim() !== '' && draft.value.trim() !== ''),
      })
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      onClose()
    })
  }

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Edit specifications"
      footer={
        <Button variant="primary" size="large" fullWidth onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save specs'}
        </Button>
      }
    >
      <p className="text-sm text-text-muted">
        These are the factory values shown on the card. Correct anything the library got wrong.
      </p>

      {overriddenCount > 0 ? (
        <p className="mt-3 rounded-card border border-upgrade/40 bg-upgrade/5 px-3 py-2 text-xs text-text-secondary">
          {overriddenCount} spec{overriddenCount === 1 ? ' is' : 's are'} currently overridden by an
          upgrade. Edit the upgrade entry to change those.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {drafts.map((draft, index) => (
          <div key={index} className="rounded-card border border-border bg-surface-sunken p-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Label"
                value={draft.label}
                onChange={(event) => updateDraft(index, { label: event.target.value })}
              />
              <SelectField
                label="Type"
                value={draft.kind}
                onChange={(event) => updateDraft(index, { kind: event.target.value as SpecKind })}
                options={SPEC_KIND_OPTIONS}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <TextField
                label="Value"
                value={draft.value}
                onChange={(event) => updateDraft(index, { value: event.target.value })}
              />
              <TextField
                label="Unit"
                placeholder="ft-lbs"
                value={draft.unit}
                onChange={(event) => updateDraft(index, { unit: event.target.value })}
              />
            </div>

            <Button
              variant="ghost"
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => setDrafts(drafts.filter((_, position) => position !== index))}
              className="mt-2 text-sm"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        fullWidth
        icon={<Plus size={16} aria-hidden />}
        className="mt-3"
        onClick={() =>
          setDrafts([
            ...drafts,
            {
              specKey: `custom_${drafts.length + 1}`,
              kind: 'tool',
              label: '',
              value: '',
              unit: '',
            },
          ])
        }
      >
        Add a specification
      </Button>

      {formError ? (
        <p
          role="alert"
          className="mt-3 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
    </Sheet>
  )
}

/** Trigger button for the editor, placed beside the mechanics HUD. */
export function SpecEditorTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      icon={<Pencil size={16} aria-hidden />}
      onClick={onOpen}
      className="text-sm"
    >
      Edit specs
    </Button>
  )
}
