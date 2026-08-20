// Unit tests for tag identifier generation (FR-001c).

import { describe, expect, it } from 'vitest'
import { generateTagBatch, generateTagId } from '@/lib/tags/generate'
import { TAG_ID_LENGTH } from '@/lib/constants'

describe('generateTagId', () => {
  it('produces an identifier of the documented length', () => {
    expect(generateTagId()).toHaveLength(TAG_ID_LENGTH)
  })

  it('uses only unambiguous base32 characters', () => {
    // No vowels (so no batch ever spells a word), and no 0/1/l/o glyphs that a
    // human transcribing a tag by hand would confuse.
    expect(generateTagId()).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]+$/)
  })

  it('produces a different identifier on each call', () => {
    expect(generateTagId()).not.toBe(generateTagId())
  })
})

describe('generateTagBatch', () => {
  it('returns exactly the requested count', () => {
    expect(generateTagBatch(50)).toHaveLength(50)
  })

  it('returns no duplicates within a batch', () => {
    const batch = generateTagBatch(200)
    expect(new Set(batch).size).toBe(200)
  })

  it('spreads across the alphabet rather than clustering on a prefix', () => {
    // A weak generator shows up here as a handful of repeated leading
    // characters, which would also mean far fewer than 128 bits of real entropy.
    const leadingCharacters = new Set(generateTagBatch(200).map((id) => id[0]))
    expect(leadingCharacters.size).toBeGreaterThan(10)
  })

  // The 10,000-identifier collision sweep lives in tests/integration/: it is real
  // CSPRNG work, so it belongs outside the unit layer's 10ms budget (Article V).
})
