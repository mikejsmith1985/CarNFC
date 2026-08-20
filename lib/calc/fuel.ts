// Fuel economy arithmetic. Pure functions over raw inputs — nothing derived is ever stored, so correcting a formula re-derives all history.

/** Why an interval yields no economy figure, shown to the owner rather than left blank. */
export type EconomyGap = 'first_entry' | 'partial_fill' | 'missed_fill' | 'no_distance'

export interface FuelEntryInput {
  odometer: number
  volumeGallons: number
  pricePerGallon: number | null
  totalCost: number | null
  isFullFill: boolean
  missedFillBefore: boolean
}

export interface FuelIntervalResult {
  /** Miles covered since the previous economy-closing fill. */
  milesCovered: number | null
  /** Miles per gallon over the interval, or null with a reason in `gap`. */
  milesPerGallon: number | null
  /** Dollars per mile over the interval. */
  costPerMile: number | null
  /** Set when no economy figure could be produced. */
  gap: EconomyGap | null
}

/**
 * Fills in whichever of volume, unit price, and total cost was left blank.
 *
 * Someone at a pump reads two numbers off the display and should not have to do
 * the third in their head (FR-031). The derived value stays editable, so this
 * never overwrites something the owner typed.
 */
export function deriveFuelCostFields(fields: {
  volumeGallons: number | null
  pricePerGallon: number | null
  totalCost: number | null
}): { volumeGallons: number | null; pricePerGallon: number | null; totalCost: number | null } {
  const { volumeGallons, pricePerGallon, totalCost } = fields

  if (volumeGallons !== null && pricePerGallon !== null && totalCost === null) {
    return { ...fields, totalCost: round(volumeGallons * pricePerGallon, 2) }
  }
  if (
    volumeGallons !== null &&
    totalCost !== null &&
    pricePerGallon === null &&
    volumeGallons > 0
  ) {
    return { ...fields, pricePerGallon: round(totalCost / volumeGallons, 3) }
  }
  if (
    pricePerGallon !== null &&
    totalCost !== null &&
    volumeGallons === null &&
    pricePerGallon > 0
  ) {
    return { ...fields, volumeGallons: round(totalCost / pricePerGallon, 3) }
  }
  return fields
}

/**
 * Economy for one fill, measured against the previous one.
 *
 * Distance-per-gallon is only meaningful between two full fills: a partial fill
 * leaves an unknown amount already in the tank, so the interval it opens cannot
 * be closed. Such intervals return a `gap` reason and no figure, while their
 * cost still counts toward spending (FR-033).
 */
export function calculateFuelInterval(
  current: FuelEntryInput,
  previous: FuelEntryInput | null,
): FuelIntervalResult {
  if (previous === null) {
    return { milesCovered: null, milesPerGallon: null, costPerMile: null, gap: 'first_entry' }
  }

  const milesCovered = current.odometer - previous.odometer

  if (milesCovered <= 0) {
    return { milesCovered, milesPerGallon: null, costPerMile: null, gap: 'no_distance' }
  }
  if (current.missedFillBefore) {
    return { milesCovered, milesPerGallon: null, costPerMile: null, gap: 'missed_fill' }
  }
  // Both ends of the interval must be full fills for the volume between them to
  // equal the fuel actually burned.
  if (!current.isFullFill || !previous.isFullFill) {
    return { milesCovered, milesPerGallon: null, costPerMile: null, gap: 'partial_fill' }
  }
  if (current.volumeGallons <= 0) {
    return { milesCovered, milesPerGallon: null, costPerMile: null, gap: 'no_distance' }
  }

  const milesPerGallon = round(milesCovered / current.volumeGallons, 1)
  const intervalCost = resolveTotalCost(current)
  const costPerMile = intervalCost === null ? null : round(intervalCost / milesCovered, 3)

  return { milesCovered, milesPerGallon, costPerMile, gap: null }
}

export interface FuelTrendPoint {
  odometer: number
  milesPerGallon: number | null
  costPerMile: number | null
  gap: EconomyGap | null
}

/**
 * Economy across a run of fills, oldest first.
 *
 * Returned in the same order it was given so a chart can plot it directly
 * against the odometer axis.
 */
export function calculateFuelTrend(entriesOldestFirst: FuelEntryInput[]): FuelTrendPoint[] {
  return entriesOldestFirst.map((entry, index) => {
    const previous = index === 0 ? null : (entriesOldestFirst[index - 1] ?? null)
    const interval = calculateFuelInterval(entry, previous)
    return {
      odometer: entry.odometer,
      milesPerGallon: interval.milesPerGallon,
      costPerMile: interval.costPerMile,
      gap: interval.gap,
    }
  })
}

/**
 * Average economy over every interval that produced a figure.
 *
 * Skipped intervals are excluded rather than counted as zero, which would drag
 * the average down and misrepresent the vehicle.
 */
export function calculateAverageMpg(entriesOldestFirst: FuelEntryInput[]): number | null {
  const figures = calculateFuelTrend(entriesOldestFirst)
    .map((point) => point.milesPerGallon)
    .filter((mpg): mpg is number => mpg !== null)

  if (figures.length === 0) return null
  return round(figures.reduce((sum, mpg) => sum + mpg, 0) / figures.length, 1)
}

/** Total spend across a run of fills, including intervals with no economy figure. */
export function calculateTotalFuelCost(entries: FuelEntryInput[]): number {
  return round(
    entries.reduce((sum, entry) => sum + (resolveTotalCost(entry) ?? 0), 0),
    2,
  )
}

/** Total cost for one fill, computed from unit price when it was not entered directly. */
function resolveTotalCost(entry: FuelEntryInput): number | null {
  if (entry.totalCost !== null) return entry.totalCost
  if (entry.pricePerGallon !== null) return round(entry.pricePerGallon * entry.volumeGallons, 2)
  return null
}

/** Rounds to a fixed number of decimal places without floating-point drift in the last digit. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
