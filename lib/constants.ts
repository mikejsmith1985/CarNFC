// Every tunable limit in ServiceCard, named once so no magic number appears at a call site (Article IV).

// --- Attachments (FR-026, FR-026a) -------------------------------------------

/** Hard cap per attached file, after on-device compression. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Maximum attachments on a single service entry. */
export const ATTACHMENT_MAX_PER_ENTRY = 5

/**
 * Longest edge, in pixels, that a photograph is downscaled to.
 * 2048 keeps 8-point receipt text and stamped part numbers legible (SC-014)
 * while bringing a typical 12-megapixel capture from ~4 MB to ~400 KB, which is
 * the difference between an upload that finishes on the walk out of a garage
 * and one that stalls (SC-015).
 */
export const IMAGE_MAX_LONGEST_EDGE_PX = 2048

/** WebP quality for compressed photographs. */
export const IMAGE_WEBP_QUALITY = 0.82

/** File types accepted as attachments. PDFs are stored unmodified so manuals stay searchable. */
export const ATTACHMENT_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const

/** MIME types that are passed through without compression. */
export const ATTACHMENT_PASSTHROUGH_MIME_TYPES = ['application/pdf'] as const

// --- Identifiers (FR-001c, FR-041, FR-049a) ----------------------------------

/** Entropy behind a physical tag identifier. Brute-forcing an unclaimed tag must not be feasible. */
export const TAG_ID_ENTROPY_BITS = 128

/** Rendered length of a tag identifier in base32url. */
export const TAG_ID_LENGTH = 26

/** Entropy behind a passport share token. */
export const SHARE_TOKEN_ENTROPY_BITS = 256

/** Rendered length of a share token in base64url. */
export const SHARE_TOKEN_LENGTH = 43

// --- Offline sync (FR-040, FR-041, FR-042) -----------------------------------

/** First retry delay when draining the outbox. */
export const SYNC_BACKOFF_INITIAL_MS = 1_000

/** Ceiling on exponential backoff between drain attempts. */
export const SYNC_BACKOFF_MAX_MS = 5 * 60 * 1_000

/**
 * Consecutive failures after which a record is flagged `stuck` and surfaced.
 * It is never deleted — FR-042 forbids discarding an unsynchronized entry.
 */
export const SYNC_STUCK_AFTER_ATTEMPTS = 10

/** Fraction of the storage quota above which the owner is warned of eviction risk. */
export const STORAGE_PRESSURE_WARN_RATIO = 0.85

// --- Reads and rendering (SC-001) --------------------------------------------

/** Timeline entries returned on the first card load; the rest paginate. */
export const TIMELINE_PAGE_SIZE = 20

/** Server-side budget for get_component_card, inside the 1-second end-to-end target. */
export const CARD_QUERY_BUDGET_MS = 200

/** Lifetime of a signed attachment URL handed to a passport guest. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60

// --- Accessibility (FR-014, SC-008) ------------------------------------------

/** Minimum touch target, in pixels, for anything interactive. */
export const MIN_TOUCH_TARGET_PX = 48

// --- Odometer validation (FR-024) --------------------------------------------

/**
 * Increase over the last known reading that triggers a plausibility warning.
 * Catches the extra-digit typo (112450 entered as 1124500) without nagging an
 * owner who genuinely drove a long way between taps.
 */
export const ODOMETER_IMPLAUSIBLE_JUMP_MILES = 50_000

// --- Units (spec Assumptions) ------------------------------------------------

/** Imperial only for this release; metric presentation is out of scope. */
export const UNIT_DISTANCE = 'mi' as const
export const UNIT_VOLUME = 'gal' as const
export const UNIT_ENERGY = 'kWh' as const
export const UNIT_TORQUE = 'ft-lbs' as const
export const UNIT_CURRENCY = 'USD' as const

/** Watt-hours per kilowatt-hour, used when converting mi/kWh to Wh/mi. */
export const WATT_HOURS_PER_KWH = 1_000

/** Percentage bounds for EV state of charge (FR-036). */
export const SOC_MIN_PCT = 0
export const SOC_MAX_PCT = 100

// --- Formatting --------------------------------------------------------------

/**
 * Decimal places for per-mile costs.
 * Fuel and electricity land in fractions of a cent per mile, so two decimals
 * would round most values to the same figure and hide the comparison entirely.
 */
export const COST_PER_MILE_DECIMALS = 3

/** Length of an ISO calendar date, `YYYY-MM-DD`, when slicing a timestamp. */
export const ISO_DATE_LENGTH = 10

/** How long a "Copied" confirmation stays visible. */
export const COPY_FEEDBACK_MS = 2_000

/** Bytes per kilobyte, for size formatting and cap arithmetic. */
export const BYTES_PER_KILOBYTE = 1024

/** Bits per byte, when sizing CSPRNG output from an entropy target. */
export const BITS_PER_BYTE = 8

/** Milliseconds in a day, for countdowns to a due date. */
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000
