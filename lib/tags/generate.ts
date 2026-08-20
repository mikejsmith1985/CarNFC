// Tag identifier generation, kept free of I/O so it stays in the unit test layer (Article V).

import { randomBytes } from 'node:crypto'
import { TAG_ID_ENTROPY_BITS, TAG_ID_LENGTH } from '@/lib/constants'

/**
 * Crockford-style base32.
 *
 * Vowels are excluded so a batch can never spell a word on a physical label, and
 * 0/1/l/o are excluded because someone reading a tag aloud or transcribing it by
 * hand will confuse them.
 */
const BASE32_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/**
 * Generates one tag identifier: 128 bits of CSPRNG entropy as 26 base32 characters.
 *
 * Unguessability is the security property here. Finding an unclaimed tag id means
 * being able to claim it, so the identifier space must not be searchable by
 * anyone who does not physically hold the tag (FR-001c).
 */
export function generateTagId(): string {
  const bytes = randomBytes(TAG_ID_ENTROPY_BITS / 8)

  let identifier = ''
  let bitBuffer = 0
  let bitsHeld = 0

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte
    bitsHeld += 8
    while (bitsHeld >= 5) {
      bitsHeld -= 5
      identifier += BASE32_ALPHABET[(bitBuffer >> bitsHeld) & 31]
    }
  }

  if (bitsHeld > 0) {
    identifier += BASE32_ALPHABET[(bitBuffer << (5 - bitsHeld)) & 31]
  }

  return identifier.slice(0, TAG_ID_LENGTH)
}

/** Generates a batch of distinct identifiers for one manufacturing run. */
export function generateTagBatch(count: number): string[] {
  const identifiers = new Set<string>()
  while (identifiers.size < count) {
    identifiers.add(generateTagId())
  }
  return [...identifiers]
}
