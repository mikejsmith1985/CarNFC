// Electric-vehicle efficiency arithmetic. Pure functions, same discipline as lib/calc/fuel.ts.

import { WATT_HOURS_PER_KWH } from '@/lib/constants'

export interface ChargeEntryInput {
  odometer: number
  socStartPct: number
  socEndPct: number
  energyKwh: number
  sessionCost: number | null
}

export interface ChargeSessionResult {
  /** Percentage points of battery added this session. */
  socGainedPct: number
  /** Dollars per kilowatt-hour for this session, which is how charging sources compare. */
  costPerKwh: number | null
  /** Miles driven since the previous energy entry on this vehicle. */
  milesCovered: number | null
  /** Miles per kilowatt-hour over that distance. */
  milesPerKwh: number | null
  /** Watt-hours per mile — the same figure inverted, which is how most EV dashboards report. */
  wattHoursPerMile: number | null
  costPerMile: number | null
}

/**
 * Efficiency and cost for one charging session.
 *
 * Distance is measured from the previous energy entry on the vehicle rather than
 * the previous *charge*, because a plug-in hybrid interleaves fuel and charge
 * entries on one continuous odometer axis (FR-037).
 */
export function calculateChargeSession(
  current: ChargeEntryInput,
  previousOdometer: number | null,
): ChargeSessionResult {
  const socGainedPct = round(current.socEndPct - current.socStartPct, 2)
  const costPerKwh =
    current.sessionCost !== null && current.energyKwh > 0
      ? round(current.sessionCost / current.energyKwh, 3)
      : null

  if (previousOdometer === null) {
    return {
      socGainedPct,
      costPerKwh,
      milesCovered: null,
      milesPerKwh: null,
      wattHoursPerMile: null,
      costPerMile: null,
    }
  }

  const milesCovered = current.odometer - previousOdometer

  if (milesCovered <= 0 || current.energyKwh <= 0) {
    return {
      socGainedPct,
      costPerKwh,
      milesCovered,
      milesPerKwh: null,
      wattHoursPerMile: null,
      costPerMile: null,
    }
  }

  const milesPerKwh = round(milesCovered / current.energyKwh, 2)
  const wattHoursPerMile = round((current.energyKwh * WATT_HOURS_PER_KWH) / milesCovered, 0)
  const costPerMile =
    current.sessionCost !== null ? round(current.sessionCost / milesCovered, 3) : null

  return { socGainedPct, costPerKwh, milesCovered, milesPerKwh, wattHoursPerMile, costPerMile }
}

export interface ChargeTrendPoint {
  odometer: number
  milesPerKwh: number | null
  wattHoursPerMile: number | null
  costPerMile: number | null
}

/** Efficiency across a run of charging sessions, oldest first. */
export function calculateChargeTrend(sessionsOldestFirst: ChargeEntryInput[]): ChargeTrendPoint[] {
  return sessionsOldestFirst.map((session, index) => {
    const previousOdometer = index === 0 ? null : (sessionsOldestFirst[index - 1]?.odometer ?? null)
    const result = calculateChargeSession(session, previousOdometer)
    return {
      odometer: session.odometer,
      milesPerKwh: result.milesPerKwh,
      wattHoursPerMile: result.wattHoursPerMile,
      costPerMile: result.costPerMile,
    }
  })
}

/** Average miles per kilowatt-hour over every session that produced a figure. */
export function calculateAverageMilesPerKwh(
  sessionsOldestFirst: ChargeEntryInput[],
): number | null {
  const figures = calculateChargeTrend(sessionsOldestFirst)
    .map((point) => point.milesPerKwh)
    .filter((value): value is number => value !== null)

  if (figures.length === 0) return null
  return round(figures.reduce((sum, value) => sum + value, 0) / figures.length, 2)
}

/**
 * Estimated usable pack capacity implied by one session.
 *
 * Energy delivered divided by the fraction of the pack it filled. Tracked over
 * time this is a rough range-health signal; it is deliberately not presented as
 * a battery state-of-health figure, which needs data this app does not have.
 */
export function estimateUsablePackKwh(session: ChargeEntryInput): number | null {
  const socFraction = (session.socEndPct - session.socStartPct) / 100
  if (socFraction <= 0) return null
  return round(session.energyKwh / socFraction, 1)
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
