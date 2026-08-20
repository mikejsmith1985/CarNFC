// Next-due and re-check reminders for a component, including the overdue state.
import { Clock, AlertCircle } from 'lucide-react'
import type { Reminder } from '@/types/servicecard'
import { MILLISECONDS_PER_DAY, UNIT_DISTANCE } from '@/lib/constants'

interface ReminderBannerProps {
  reminders: Reminder[]
  currentOdometer: number
}

/**
 * Renders outstanding reminders (FR-013, FR-023).
 *
 * A re-check created by a repair surfaces once the vehicle has covered the
 * recorded distance; a next-due derived from a maintenance interval counts down
 * to it. Overdue items are visually distinct and sort first.
 */
export function ReminderBanner({ reminders, currentOdometer }: ReminderBannerProps) {
  if (reminders.length === 0) return null

  const sorted = [...reminders].sort(
    (left, right) => Number(right.isOverdue) - Number(left.isOverdue),
  )

  return (
    <div className="space-y-2 px-4 pt-4">
      {sorted.map((reminder) => (
        <ReminderRow key={reminder.id} reminder={reminder} currentOdometer={currentOdometer} />
      ))}
    </div>
  )
}

function ReminderRow({
  reminder,
  currentOdometer,
}: {
  reminder: Reminder
  currentOdometer: number
}) {
  const Icon = reminder.isOverdue ? AlertCircle : Clock
  const toneClasses = reminder.isOverdue
    ? 'border-danger/50 bg-danger/10 text-danger'
    : 'border-border-strong bg-surface-raised text-text-secondary'

  return (
    <p
      className={`flex items-start gap-2 rounded-card border px-3 py-2.5 text-sm font-medium ${toneClasses}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {reminder.kind === 'recheck' ? 'Re-check this repair' : 'Next service'}
        {' — '}
        {describeDue(reminder, currentOdometer)}
      </span>
    </p>
  )
}

/** Turns a reminder's triggers into the phrase someone actually wants to read. */
function describeDue(reminder: Reminder, currentOdometer: number): string {
  const parts: string[] = []

  if (reminder.dueOdometer !== null) {
    const remaining = reminder.dueOdometer - currentOdometer
    parts.push(
      remaining > 0
        ? `in ${remaining.toLocaleString()} ${UNIT_DISTANCE}`
        : `${Math.abs(remaining).toLocaleString()} ${UNIT_DISTANCE} overdue`,
    )
  }

  if (reminder.dueOn !== null) {
    const dueDate = new Date(`${reminder.dueOn}T00:00:00`)
    const remainingDays = Math.ceil((dueDate.getTime() - Date.now()) / MILLISECONDS_PER_DAY)
    parts.push(
      remainingDays > 0 ? `in ${remainingDays} days` : `${Math.abs(remainingDays)} days overdue`,
    )
  }

  return parts.join(' or ')
}
