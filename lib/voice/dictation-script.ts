// The ordered questions hands-free mode asks, and how it reads an answer back.
//
// Only fields worth asking for out loud are here. Anything that needs a screen
// to answer sensibly — a spec override, an attachment, a warranty date — is left
// to the form, because a question nobody can answer by voice wastes the time of
// someone lying under a vehicle.

import type { AnswerKind } from '@/lib/voice/transcript'
import type { ServiceLogDraft } from '@/lib/validation/service-log'
import type { LogCategory } from '@/types/servicecard'

export interface DictationQuestion {
  field: keyof ServiceLogDraft
  /** Spoken aloud, so it reads as a question rather than a form label. */
  prompt: string
  kind: AnswerKind
}

/** Asked first in every category: hands are dirtiest at the start of a job. */
const ODOMETER_QUESTION: DictationQuestion = {
  field: 'odometer',
  prompt: "What's the odometer reading?",
  kind: 'number',
}

/** Asked last in every category, so anything unanticipated still has a home. */
const NOTES_QUESTION: DictationQuestion = {
  field: 'notes',
  prompt: 'Anything the next person under this vehicle should know?',
  kind: 'text',
}

const CATEGORY_QUESTIONS: Record<LogCategory, DictationQuestion[]> = {
  maintenance: [
    { field: 'fluidType', prompt: 'What fluid or oil weight went in?', kind: 'viscosity' },
    { field: 'quantity', prompt: 'How much of it?', kind: 'number' },
    { field: 'filterPartNumber', prompt: 'Filter part number?', kind: 'partNumber' },
    { field: 'appliedTorque', prompt: 'What torque did you use, in foot-pounds?', kind: 'number' },
    { field: 'nextIntervalMiles', prompt: 'Due again in how many miles?', kind: 'number' },
  ],
  repair: [
    { field: 'symptom', prompt: 'What was it doing?', kind: 'text' },
    { field: 'diagnosis', prompt: 'What turned out to be causing it?', kind: 'text' },
    { field: 'actionTaken', prompt: 'What did you do about it?', kind: 'text' },
    { field: 'recheckMiles', prompt: 'Re-check this after how many miles?', kind: 'number' },
  ],
  replace: [
    { field: 'oldPartNumber', prompt: 'What part number came off?', kind: 'partNumber' },
    { field: 'newPartNumber', prompt: 'And what went on?', kind: 'partNumber' },
    { field: 'brand', prompt: 'What brand?', kind: 'text' },
    { field: 'supplier', prompt: 'Where did it come from?', kind: 'text' },
    { field: 'cost', prompt: 'What did it cost?', kind: 'number' },
  ],
  upgrade: [
    { field: 'upgradeBrand', prompt: 'What brand is the part?', kind: 'text' },
    { field: 'productName', prompt: 'What is it called?', kind: 'text' },
    { field: 'installNotes', prompt: 'Anything unusual about fitting it?', kind: 'text' },
  ],
}

/** The full run of questions for one category, in the order they get asked. */
export function getDictationScript(category: LogCategory): DictationQuestion[] {
  return [ODOMETER_QUESTION, ...CATEGORY_QUESTIONS[category], NOTES_QUESTION]
}

/** How each field is named and measured when an answer is read back for confirmation. */
const ANSWER_PHRASING: Partial<Record<keyof ServiceLogDraft, { label: string; unit?: string }>> = {
  odometer: { label: 'Odometer', unit: 'miles' },
  fluidType: { label: 'Fluid' },
  quantity: { label: 'Quantity used' },
  filterPartNumber: { label: 'Filter part number' },
  appliedTorque: { label: 'Torque', unit: 'foot-pounds' },
  nextIntervalMiles: { label: 'Due again in', unit: 'miles' },
  symptom: { label: 'Symptom' },
  diagnosis: { label: 'Diagnosis' },
  actionTaken: { label: 'Action taken' },
  recheckMiles: { label: 'Re-check after', unit: 'miles' },
  oldPartNumber: { label: 'Old part number' },
  newPartNumber: { label: 'New part number' },
  brand: { label: 'Brand' },
  supplier: { label: 'Supplier' },
  cost: { label: 'Cost', unit: 'dollars' },
  upgradeBrand: { label: 'Brand' },
  productName: { label: 'Product' },
  installNotes: { label: 'Install notes' },
  notes: { label: 'Notes' },
}

/**
 * One sentence confirming what was recorded, spoken back before moving on.
 *
 * Reading it back is the only way someone whose eyes are on the job can catch a
 * misheard answer, so a skipped question says so out loud rather than passing
 * over in silence.
 */
export function summarizeAnswer(field: keyof ServiceLogDraft, value: string): string {
  const phrasing = ANSWER_PHRASING[field] ?? { label: String(field) }

  if (value.trim() === '') return `${phrasing.label}, skipped.`

  const measured = phrasing.unit ? `${value} ${phrasing.unit}` : value
  return `${phrasing.label}, ${measured}.`
}
