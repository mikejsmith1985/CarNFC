// Odometer plausibility checks. An odometer that only ever rises is the backbone of every economy and interval figure in the product.

import { ODOMETER_IMPLAUSIBLE_JUMP_MILES } from '@/lib/constants'

export type OdometerWarning = 'below_last_known' | 'implausible_jump'

export interface OdometerCheckResult {
  /** Whether the value can be saved without an explicit confirmation. */
  isAcceptable: boolean
  warning: OdometerWarning | null
  /** The reading being checked, carried through so the UI can phrase the warning. */
  entered: number
  lastKnown: number | null
  /** Entered minus last known. Negative when the odometer went backwards. */
  difference: number | null
}

/**
 * Checks an entered odometer reading against the last known value.
 *
 * Returns structured facts, not a sentence. Formatting a number for a human
 * means locale data, and this function sits in the hot path of every keystroke
 * in the log form — so presentation is the caller's job, handled by
 * `describeOdometerWarning` below.
 *
 * Neither warning blocks the save outright: a cluster really can be replaced,
 * and someone really can drive a long way between taps. Both require the owner
 * to confirm, so a typo costs one tap rather than corrupting every subsequent
 * economy figure (FR-024).
 */
export function checkOdometer(entered: number, lastKnown: number | null): OdometerCheckResult {
  if (lastKnown === null) {
    return { isAcceptable: true, warning: null, entered, lastKnown: null, difference: null }
  }

  const difference = entered - lastKnown

  if (difference < 0) {
    return { isAcceptable: false, warning: 'below_last_known', entered, lastKnown, difference }
  }

  if (difference > ODOMETER_IMPLAUSIBLE_JUMP_MILES) {
    return { isAcceptable: false, warning: 'implausible_jump', entered, lastKnown, difference }
  }

  return { isAcceptable: true, warning: null, entered, lastKnown, difference }
}

/**
 * Turns a check result into the sentence shown beneath the field.
 *
 * Separate from `checkOdometer` because this is the only part that needs locale
 * formatting, and it runs once per warning rather than once per keystroke.
 */
export function describeOdometerWarning(result: OdometerCheckResult): string | null {
  if (result.warning === null || result.lastKnown === null || result.difference === null) {
    return null
  }

  if (result.warning === 'below_last_known') {
    return `That is below the last recorded reading of ${result.lastKnown.toLocaleString()} mi. Save anyway?`
  }

  return `That is ${result.difference.toLocaleString()} mi above the last reading. Check for an extra digit.`
}

/**
 * Suggests the current odometer from the last reading and how fast miles accrue.
 *
 * Pre-filling saves typing at a pump with the nozzle running. The estimate is
 * capped at 30 days of drift so a vehicle left standing for a season does not
 * come back with a wildly inflated suggestion.
 */
export function suggestOdometer(
  lastKnownOdometer: number | null,
  lastEntryDate: Date | null,
  averageMilesPerDay: number,
  today: Date,
): number | null {
  if (lastKnownOdometer === null || lastEntryDate === null) return lastKnownOdometer

  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
  const MAX_PROJECTED_DAYS = 30

  const elapsedDays = Math.max(
    0,
    Math.floor((today.getTime() - lastEntryDate.getTime()) / MILLISECONDS_PER_DAY),
  )
  const projectedDays = Math.min(elapsedDays, MAX_PROJECTED_DAYS)

  return lastKnownOdometer + Math.round(projectedDays * averageMilesPerDay)
}
