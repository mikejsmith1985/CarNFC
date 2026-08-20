// UUIDv7 generation. Revision ids are created on the device, before a record ever leaves it — this is what makes sync exactly-once.

/**
 * Generates a UUIDv7.
 *
 * Two properties matter here, and both are why v7 rather than v4:
 *
 *   1. The id is created on the *client*, so the server can insert with
 *      `ON CONFLICT (id) DO NOTHING`. A retry after an ambiguous network
 *      failure then becomes a no-op instead of a duplicate entry (FR-041).
 *      Retry-safety is a database constraint, not queue bookkeeping.
 *
 *   2. v7 embeds a millisecond timestamp in its leading bits, so ids sort by
 *      creation time. That keeps index locality good on the revision tables,
 *      which are append-only and grow forever.
 *
 * Sorting has to hold *within* a millisecond too, not just across them. The
 * outbox drains in bursts — a hundred entries queued in a dead zone all arrive
 * at once — so without the monotonic counter below, those inserts would scatter
 * across the index exactly when locality matters most. RFC 9562 reserves the
 * 12 bits after the version for precisely this.
 *
 * The embedded timestamp is never used for ordering or precedence — those read
 * `server_received_at`, because a device clock may be wrong.
 */
/** Millisecond of the last id issued, so the counter knows when to reseed. */
let lastTimestampMs = 0

/** 12-bit sequence within a millisecond. Reseeded randomly each new millisecond. */
let sequence = 0

/** Largest value the 12-bit sequence can hold. */
const SEQUENCE_MASK = 0x0fff

export function createRevisionId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  let timestampMs = Date.now()

  if (timestampMs === lastTimestampMs) {
    sequence = (sequence + 1) & SEQUENCE_MASK
    // Overflowed a millisecond's worth of ids: borrow from the next one rather
    // than emit a value that would sort behind its predecessor.
    if (sequence === 0) timestampMs = ++lastTimestampMs
  } else {
    if (timestampMs < lastTimestampMs) {
      // The clock went backwards. Keep issuing ahead of the last id rather than
      // let a wrong clock produce ids that sort out of order.
      timestampMs = lastTimestampMs
      sequence = (sequence + 1) & SEQUENCE_MASK
    } else {
      lastTimestampMs = timestampMs
      // Start each millisecond partway up the range, leaving room to increment
      // while keeping the value unpredictable.
      sequence = ((bytes[6]! << 8) | bytes[7]!) & 0x07ff
    }
  }

  // Bytes 0-5: 48-bit big-endian milliseconds since the Unix epoch.
  bytes[0] = (timestampMs / 2 ** 40) & 0xff
  bytes[1] = (timestampMs / 2 ** 32) & 0xff
  bytes[2] = (timestampMs / 2 ** 24) & 0xff
  bytes[3] = (timestampMs / 2 ** 16) & 0xff
  bytes[4] = (timestampMs / 2 ** 8) & 0xff
  bytes[5] = timestampMs & 0xff

  // Bytes 6-7: version 7 in the high nibble, then the 12-bit sequence.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f)
  bytes[7] = sequence & 0xff

  // Byte 8 high bits: RFC 4122 variant.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** Extracts the embedded creation time. For display and debugging only, never for ordering. */
export function readUuidV7Timestamp(uuid: string): Date | null {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) return null

  const milliseconds = Number.parseInt(hex.slice(0, 12), 16)
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null
}
