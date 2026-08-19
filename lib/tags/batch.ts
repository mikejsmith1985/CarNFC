// How many tag addresses an owner may mint in one press.

/** One press means "give me a tag" at minimum. */
export const MIN_TAG_BATCH = 1

/**
 * A whole pack and a bit.
 *
 * Tags are sold in packs of about thirty, so writing a pack in one sitting is
 * ordinary. Beyond that a request is a mistake or an abuse, and every minted row
 * is a permanent address nobody can reuse.
 */
export const MAX_TAG_BATCH = 50

/** Brings any requested batch size within what the product will actually mint. */
export function clampTagBatchSize(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return MIN_TAG_BATCH

  const whole = Math.floor(requested)
  if (whole < MIN_TAG_BATCH) return MIN_TAG_BATCH
  if (whole > MAX_TAG_BATCH) return MAX_TAG_BATCH
  return whole
}

/**
 * The largest run the production tools will mint at once.
 *
 * An owner setting up a blank tag deals in ones and tens; a print run deals in
 * hundreds. Both are still bounded, because every identifier minted is an
 * address nobody can ever reuse.
 */
export const MAX_PRODUCTION_BATCH = 1000

/** Brings a production run within what will actually be minted in one go. */
export function clampProductionBatchSize(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return MIN_TAG_BATCH

  const whole = Math.floor(requested)
  if (whole < MIN_TAG_BATCH) return MIN_TAG_BATCH
  if (whole > MAX_PRODUCTION_BATCH) return MAX_PRODUCTION_BATCH
  return whole
}
