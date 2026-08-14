// Next-due and overdue computation for service intervals and repair re-checks.

import { MILLISECONDS_PER_DAY } from '@/lib/constants'

export interface NextDueInput {
  lastServiceOdometer: number | null
  lastServiceDate: string | null
  intervalMiles: number | null
  intervalDays: number | null
}

export interface NextDue {
  dueOdometer: number | null
  dueOn: string | null
}

/**
 * Projects when a component is next due.
 *
 * Both thresholds are computed independently when both intervals exist, because
 * an oil change is due at whichever arrives first — five thousand miles or six
 * months. Collapsing them to one would hide whichever came sooner (FR-013).
 */
export function computeNextDue(input: NextDueInput): NextDue {
  const dueOdometer =
    input.lastServiceOdometer !== null && input.intervalMiles !== null
      ? input.lastServiceOdometer + input.intervalMiles
      : null

  const dueOn =
    input.lastServiceDate !== null && input.intervalDays !== null
      ? addDays(input.lastServiceDate, input.intervalDays)
      : null

  return { dueOdometer, dueOn }
}

/**
 * Whether a reminder has come due.
 *
 * Either threshold is enough. A reminder with neither can never fire, which is
 * why the database refuses to store one.
 */
export function isReminderOverdue(
  reminder: { dueOdometer: number | null; dueOn: string | null },
  currentOdometer: number,
  today: Date = new Date(),
): boolean {
  if (reminder.dueOdometer !== null && currentOdometer >= reminder.dueOdometer) return true

  if (reminder.dueOn !== null) {
    const dueTime = new Date(`${reminder.dueOn}T00:00:00Z`).getTime()
    if (!Number.isNaN(dueTime) && today.getTime() >= dueTime) return true
  }

  return false
}

/** Adds whole days to an ISO calendar date, returning another ISO date. */
function addDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return isoDate
  return new Date(base.getTime() + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10)
}
