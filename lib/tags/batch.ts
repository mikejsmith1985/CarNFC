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
